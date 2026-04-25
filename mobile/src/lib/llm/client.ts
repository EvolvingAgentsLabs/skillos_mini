/**
 * LLMClient — thin browser-friendly wrapper around OpenAI-compatible
 * /chat/completions endpoints with SSE streaming.
 *
 * Replaces the Python OpenAI SDK usage in agent_runtime.py. Works with
 * OpenRouter, Google's OpenAI-compat Gemini endpoint, and Ollama's
 * /v1/chat/completions.
 */

import type { LLMProvider } from "./provider";
import type { ResolvedProvider } from "./providers";
import { defaultIsRetriable, withRetry } from "./retry";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /**
   * Optional image data URLs (or remote URLs) attached to this message.
   * When the cloud provider supports vision (Gemini, GPT-4V, Claude),
   * `buildBody` rewrites the message into the OpenAI-compatible
   * `content: [{type:"text",...},{type:"image_url",...}]` shape.
   *
   * Local backends ignore this field. Callers should check provider
   * capability before populating images — see `lib/llm/vision_diagnose.ts`.
   */
  images?: string[];
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatResult {
  content: string;
  usage?: TokenUsage;
  finishReason?: string;
}

export interface ChatOptions {
  stream?: boolean;
  onChunk?: (delta: string) => void;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  /** If set, override the model from the resolved provider. */
  model?: string;
}

export class LLMClient implements LLMProvider {
  constructor(public readonly provider: ResolvedProvider) {}

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    if (opts.stream === false) return this.chatOnce(messages, opts);
    return this.chatStream(messages, opts);
  }

  /** One-shot health check: short user prompt, returns true on 2xx. */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const r = await this.chat(
        [{ role: "user", content: "ping" }],
        { stream: false, maxTokens: 8 },
      );
      return { ok: true, message: r.content.slice(0, 80) || "ok" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg };
    }
  }

  // ────────────────────────────────────────────────────────────────────

  private buildHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...this.provider.headers,
    };
    if (this.provider.apiKey) {
      headers["authorization"] = `Bearer ${this.provider.apiKey}`;
    }
    return headers;
  }

  private buildBody(messages: ChatMessage[], opts: ChatOptions, stream: boolean): string {
    const body: Record<string, unknown> = {
      model: opts.model ?? this.provider.model,
      messages: messages.map(serializeMessage),
      stream,
    };
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
    return JSON.stringify(body);
  }

  private async chatOnce(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
    return withRetry(
      async () => {
        const res = await fetch(`${this.provider.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.buildHeaders(),
          body: this.buildBody(messages, opts, false),
          signal: opts.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
          usage?: TokenUsage;
        };
        const choice = json.choices?.[0];
        const content = choice?.message?.content ?? "";
        return { content, usage: json.usage, finishReason: choice?.finish_reason };
      },
      { signal: opts.signal, isRetriable: defaultIsRetriable },
    );
  }

  private async chatStream(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
    // Only retry the connection + TTFB portion. Once tokens are streaming we
    // never retry (would double-bill).
    const res = await withRetry(
      async () => {
        const r = await fetch(`${this.provider.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            ...(this.buildHeaders() as Record<string, string>),
            accept: "text/event-stream",
          },
          body: this.buildBody(messages, opts, true),
          signal: opts.signal,
        });
        if (!r.ok || !r.body) {
          const text = await r.text().catch(() => "");
          throw new Error(`LLM ${r.status}: ${text.slice(0, 300)}`);
        }
        return r;
      },
      { signal: opts.signal, isRetriable: defaultIsRetriable },
    );
    if (!res.body) throw new Error("LLM stream missing body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let usage: TokenUsage | undefined;
    let finishReason: string | undefined;

    const handleEvent = (payload: string): boolean => {
      // payload is the full "data: …" chunk body after `data: `; returns true if stream is done.
      if (payload === "[DONE]") return true;
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        return false;
      }
      const obj = parsed as {
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
        usage?: TokenUsage;
      };
      const choice = obj.choices?.[0];
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        content += delta;
        opts.onChunk?.(delta);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (obj.usage) usage = obj.usage;
      return false;
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE events are delimited by blank lines (\n\n or \r\n\r\n).
      while (true) {
        const sep = buffer.indexOf("\n\n");
        const sepCr = buffer.indexOf("\r\n\r\n");
        const idx = sep === -1 ? sepCr : sepCr === -1 ? sep : Math.min(sep, sepCr);
        if (idx === -1) break;
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + (buffer[idx + 1] === "\r" ? 4 : 2));
        // Each event may have several lines, one or more "data: …"
        for (const line of rawEvent.split(/\r?\n/)) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (handleEvent(payload)) return { content, usage, finishReason };
        }
      }
    }
    // Flush any trailing data line without an explicit terminator.
    if (buffer.trim().length > 0) {
      for (const line of buffer.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        if (handleEvent(payload)) break;
      }
    }
    return { content, usage, finishReason };
  }
}

/**
 * Serialize a ChatMessage for the OpenAI-compatible /chat/completions API.
 *
 * - Plain text messages (no `images`) round-trip unchanged.
 * - Messages with `images` get rewritten to the multimodal content-array
 *   shape used by Gemini OpenAI-compat, OpenRouter GPT-4V, and the OpenAI
 *   Vision API: `content: [{type:"text",...},{type:"image_url",...}]`.
 *   Each image URL is wrapped as `{type:"image_url", image_url: {url}}`.
 *
 * This is exported for unit testing only — production callers go through
 * `LLMClient.chat`.
 */
export function serializeMessage(m: ChatMessage): unknown {
  if (!m.images || m.images.length === 0) {
    return { role: m.role, content: m.content };
  }
  const parts: unknown[] = [];
  if (m.content) {
    parts.push({ type: "text", text: m.content });
  }
  for (const url of m.images) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  return { role: m.role, content: parts };
}
