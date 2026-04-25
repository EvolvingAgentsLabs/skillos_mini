/**
 * Vision-diagnoser orchestrator — CLAUDE.md §7.3 (cloud path).
 *
 * Builds a multimodal user message from a job's photos + the cartridge's
 * vision-diagnoser agent prompt, sends it through the configured
 * provider via `buildProvider()` (per §4.4 — never bypass), parses the
 * `<produces>{...}</produces>` block, and returns a `DiagnosisEntry`
 * shaped for the JobState.
 *
 * What works today:
 *  - Cloud OpenAI-compatible providers that accept vision messages
 *    (Gemini OpenAI compat, OpenRouter GPT-4V, Claude via OpenRouter).
 *  - LiteRT-LM Android plugin: as the plugin gains a vision API, the same
 *    call site continues to work — `buildProvider` already returns a
 *    `LocalLLMClient` whose backend can be extended to handle the
 *    `images` field on the ChatMessage.
 *
 * What does NOT work today:
 *  - wllama text-only models. They drop `images` silently. Callers
 *    should warn the user when their configured provider is text-only
 *    before invoking this function (we still try, but the LLM gets no
 *    image input — not useful).
 */

import type { LLMProvider, ProviderCapabilities } from "./provider";
import type { ChatMessage } from "./client";
import { buildProvider, type BuildProviderConfig } from "./build_provider";
import { getProviders } from "../providers";
import type { ProviderBundle } from "../providers/types";
import type { CartridgeManifest } from "../cartridge/types";
import { CartridgeRegistry } from "../cartridge/registry";

export interface VisionDiagnoseInput {
  manifest: CartridgeManifest;
  photo_uris: string[];
  providerCfg: BuildProviderConfig;
  /** Override provider bundle (for tests). */
  providers?: ProviderBundle;
  /** Override LLM provider factory (for tests). */
  buildLLM?: (cfg: BuildProviderConfig) => Promise<LLMProvider & {
    capabilities?: () => ProviderCapabilities;
  }>;
  /** Optional cartridge registry — if not supplied, a fresh one is built. */
  registry?: CartridgeRegistry;
}

export interface VisionDiagnoseResult {
  trade?: string;
  severity?: number;
  problem_categories: string[];
  summary?: string;
  client_explanation?: string;
  hazards?: { kind: string; description: string; requires_immediate_action?: boolean }[];
  confidence?: number;
  /** Raw model output for debugging — included so the UI can offer a "see raw" toggle. */
  raw: string;
}

const DEFAULT_PROBLEM_CATEGORIES = ["unspecified"];

export async function runVisionDiagnoser(input: VisionDiagnoseInput): Promise<VisionDiagnoseResult> {
  const providers = input.providers ?? (await getProviders());
  const registry = input.registry ?? (await initRegistry());
  const agent = await registry.loadAgent(input.manifest.name, "vision-diagnoser");
  if (!agent) {
    throw new Error(`vision-diagnoser agent missing on cartridge ${input.manifest.name}`);
  }

  const images: string[] = [];
  for (const uri of input.photo_uris) {
    const blob = await providers.storage.getBlob(uri);
    if (!blob) continue;
    const dataUrl = await blobToDataUrl(blob);
    images.push(dataUrl);
  }
  if (images.length === 0) {
    throw new Error("no resolvable photos for vision-diagnoser");
  }

  const systemMessage: ChatMessage = {
    role: "system",
    content: agent.body,
  };
  const userMessage: ChatMessage = {
    role: "user",
    content:
      "Mirá las fotos adjuntas y devolvé EXACTAMENTE un bloque `<produces>{...}</produces>` " +
      "siguiendo el esquema diagnosis del prompt. No agregues texto fuera del bloque.",
    images,
  };

  const buildLLM = input.buildLLM ?? buildProvider;
  const llm = await buildLLM(input.providerCfg);
  const result = await llm.chat([systemMessage, userMessage], {
    temperature: 0.2,
    stream: false,
  });
  return parseDiagnosis(result.content);
}

/**
 * Parse a `<produces>{...}</produces>` JSON block out of the agent output.
 * Tolerates surrounding prose, code fences, and whitespace.
 *
 * Exported for unit testing.
 */
export function parseDiagnosis(raw: string): VisionDiagnoseResult {
  const block = extractProducesBlock(raw);
  let parsed: unknown = null;
  if (block) {
    try {
      parsed = JSON.parse(block);
    } catch {
      // Fall through — leave parsed null and surface a non-fatal partial result.
    }
  }
  const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const diag =
    root.diagnosis && typeof root.diagnosis === "object"
      ? (root.diagnosis as Record<string, unknown>)
      : root;

  const problem_categories = asStringArray(diag.problem_categories);
  return {
    trade: asString(diag.trade),
    severity: clampSeverity(diag.severity),
    problem_categories: problem_categories.length > 0 ? problem_categories : DEFAULT_PROBLEM_CATEGORIES,
    summary: asString(diag.summary),
    client_explanation: asString(diag.client_explanation),
    hazards: asHazards(diag.hazards),
    confidence: clampConfidence(diag.confidence),
    raw,
  };
}

/* ──────────────────────────────────────────────────────────────────── */
/*                               Helpers                                 */
/* ──────────────────────────────────────────────────────────────────── */

async function initRegistry(): Promise<CartridgeRegistry> {
  const reg = new CartridgeRegistry();
  await reg.init();
  return reg;
}

function extractProducesBlock(raw: string): string | undefined {
  const tagged = raw.match(/<produces>\s*([\s\S]*?)\s*<\/produces>/i);
  if (tagged) return tagged[1];
  // Fallback: model emitted a fenced code block without the tag.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) return fence[1];
  // Last resort: the whole string if it looks like JSON.
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  return undefined;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i]);
  const b64 =
    typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return `data:${blob.type || "application/octet-stream"};base64,${b64}`;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim().length > 0) out.push(item);
  }
  return out;
}

function clampSeverity(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(1, Math.min(5, Math.round(v)));
}

function clampConfidence(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(0, Math.min(1, v));
}

function asHazards(v: unknown): VisionDiagnoseResult["hazards"] {
  if (!Array.isArray(v)) return undefined;
  const out: NonNullable<VisionDiagnoseResult["hazards"]> = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const kind = asString(o.kind);
    const description = asString(o.description);
    if (kind && description) {
      const requires =
        typeof o.requires_immediate_action === "boolean"
          ? o.requires_immediate_action
          : undefined;
      out.push({ kind, description, ...(requires !== undefined && { requires_immediate_action: requires }) });
    }
  }
  return out.length > 0 ? out : undefined;
}
