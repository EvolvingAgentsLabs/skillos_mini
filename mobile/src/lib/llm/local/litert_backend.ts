/**
 * LiteRTBackend — uses the `@skillos/capacitor-litert-lm` plugin to run
 * `.litertlm` models through Google's on-device runtime.
 *
 * Selected by `pickBackendForModel` only on Android native builds; the web
 * / iOS plugin stubs throw "not implemented" on initModel, which is caught
 * and surfaced as a clear "install the app / use wllama" error upstream.
 *
 * Implementation is dynamically imported so pure-PWA builds don't pay the
 * cost of resolving `@capacitor/core` at startup.
 */

import { formatPrompt } from "./chat_templates";
import type {
  BackendGenerateOptions,
  BackendGenerateResult,
  BackendLoadOptions,
  LocalLLMBackend,
} from "./backend";
import type { ChatMessage } from "../client";
import type { ModelCatalogEntry } from "./model_catalog";

interface LiteRTPluginShape {
  isAvailable(): Promise<{ available: boolean }>;
  initModel(opts: {
    modelPath: string;
    enableVision?: boolean;
    maxNumImages?: number;
  }): Promise<{ handle: string; supportsVision?: boolean; contextWindow?: number }>;
  generate(opts: {
    handle: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    stop?: string[];
    /** Base64 strings without `data:` prefix. */
    images?: string[];
  }): Promise<void>;
  cancel(opts: { handle: string }): Promise<void>;
  unloadModel(opts: { handle: string }): Promise<void>;
  addListener(
    eventName: "token" | "done" | "error",
    listener: (e: Record<string, unknown>) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  removeAllListeners(): Promise<void>;
}

export class LiteRTBackend implements LocalLLMBackend {
  readonly id = "litert" as const;
  readonly ready: Promise<void>;

  private plugin: LiteRTPluginShape | null = null;
  private handle: string | null = null;
  private supportsVision = false;
  private pluginReady: Promise<LiteRTPluginShape>;

  constructor() {
    this.pluginReady = this.loadPlugin();
    this.ready = this.pluginReady.then(() => undefined);
  }

  private async loadPlugin(): Promise<LiteRTPluginShape> {
    // Plugin is scaffolded under capacitor-plugins/; users install it via
    // `npm install file:./capacitor-plugins/litert-lm` after
    // `npx cap add android`. Route the specifier through a variable +
    // @vite-ignore so neither Vite nor Vitest tries to statically resolve
    // it at build time.
    const pkg = "@skillos/capacitor-litert-lm";
    const mod = await import(/* @vite-ignore */ pkg).catch(() => {
      throw new Error(
        "LiteRT plugin not installed. Install the native app or switch to wllama-local.",
      );
    });
    const plugin = (mod as { LiteRTLM?: LiteRTPluginShape }).LiteRTLM;
    if (!plugin) throw new Error("LiteRT plugin export missing");
    this.plugin = plugin;
    const { available } = await plugin.isAvailable();
    if (!available) {
      throw new Error(
        "LiteRT-LM unavailable on this platform (Android-only). Use wllama.",
      );
    }
    return plugin;
  }

  async load(opts: BackendLoadOptions): Promise<void> {
    const plugin = await this.pluginReady;
    if (!opts.nativePath) {
      throw new Error(
        "LiteRT requires a native file path. Did scripts/export-model-to-cache.ts run?",
      );
    }
    // Gemma 4 E2B/E4B is multimodal; request the vision modality at load
    // time when the model declares it. Other models stay text-only and
    // skip the wiring overhead. We rely on the catalog entry's `vision`
    // flag — see model_catalog.ts.
    const enableVision = isVisionCapable(opts.entry);
    const result = await plugin.initModel({
      modelPath: opts.nativePath,
      enableVision,
      maxNumImages: enableVision ? 4 : undefined,
    });
    this.handle = result.handle;
    this.supportsVision = Boolean(result.supportsVision ?? enableVision);
  }

  async generate(opts: BackendGenerateOptions): Promise<BackendGenerateResult> {
    const plugin = await this.pluginReady;
    if (!this.handle) throw new Error("LiteRT: no model loaded");
    const handle = this.handle;
    const { prompt, stop } = formatPrompt(opts.template, opts.messages);
    const combinedStop = [...stop, ...(opts.stop ?? [])];
    // Pull image data URLs off the trailing user message and strip the
    // `data:image/...;base64,` prefix — the plugin expects raw base64.
    // Only forwarded when the loaded model actually supports vision.
    const images = this.supportsVision ? extractImagePayloads(opts.messages) : [];

    let text = "";
    let finishReason = "stop";
    const tokenListener = await plugin.addListener("token", (e) => {
      if (e.handle !== handle) return;
      const delta = String(e.delta ?? "");
      if (!delta) return;
      text += delta;
      opts.onToken?.(delta);
    });

    const donePromise = new Promise<void>((resolve, reject) => {
      let resolved = false;
      const settle = (fn: () => void) => {
        if (resolved) return;
        resolved = true;
        fn();
      };
      plugin
        .addListener("done", (e) => {
          if (e.handle !== handle) return;
          if (typeof e.finishReason === "string") finishReason = e.finishReason;
          if (typeof e.text === "string" && e.text.length > text.length) {
            text = e.text;
          }
          settle(() => resolve());
        })
        .catch(reject);
      plugin
        .addListener("error", (e) => {
          if (e.handle !== handle) return;
          const msg = String(e.message ?? "litert error");
          settle(() => reject(new Error(msg)));
        })
        .catch(reject);
    });

    const abortHandler = async () => {
      await plugin.cancel({ handle }).catch(() => {});
    };
    opts.signal?.addEventListener("abort", abortHandler);

    try {
      await plugin.generate({
        handle,
        prompt,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        stop: combinedStop,
        ...(images.length > 0 ? { images } : {}),
      });
      await donePromise;
    } finally {
      await tokenListener.remove().catch(() => {});
      opts.signal?.removeEventListener("abort", abortHandler);
    }
    return { text, finishReason };
  }

  async unload(): Promise<void> {
    if (!this.plugin || !this.handle) return;
    try {
      await this.plugin.unloadModel({ handle: this.handle });
    } catch {
      /* ignore */
    }
    this.handle = null;
    await this.plugin.removeAllListeners().catch(() => {});
  }
}

/**
 * Returns true when we're on Android native Capacitor with the LiteRT plugin
 * linked and reporting available. Cheap enough to call synchronously during
 * backend selection.
 */
export async function isLiteRTSupported(): Promise<boolean> {
  try {
    // Check Capacitor is native first to avoid loading the plugin on web.
    const cap = (globalThis as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    if (!cap?.isNativePlatform?.()) return false;
    if (cap?.getPlatform?.() !== "android") return false;
    const pkg = "@skillos/capacitor-litert-lm";
    const mod = await import(/* @vite-ignore */ pkg).catch(() => null);
    if (!mod) return false;
    const plugin = (mod as { LiteRTLM?: LiteRTPluginShape }).LiteRTLM;
    if (!plugin) return false;
    const { available } = await plugin.isAvailable();
    return available;
  } catch {
    return false;
  }
}

/* ──────────────────────────────────────────────────────────────────── */
/*                          Vision helpers                              */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * True when the loaded model declares vision support. Catalog entries opt
 * in via `vision: true`, plus a defensive heuristic on model id (Gemma 4
 * E2B/E4B is multimodal).
 *
 * Exported for tests.
 */
export function isVisionCapable(entry: ModelCatalogEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.vision === true) return true;
  // Defensive heuristic: id-based detection for catalog entries authored
  // before the `vision` flag landed. Gemma 4 E-series ships multimodal.
  const id = (entry.id ?? "").toLowerCase();
  return /^gemma-?4(?:-e[24]b)?/.test(id);
}

/**
 * Pull base64 image payloads off the trailing user message. The cloud
 * client uses data URLs (`data:image/jpeg;base64,...`); the LiteRT plugin
 * wants the raw base64 only. We strip the prefix here and skip anything
 * that doesn't look like an image data URL — http(s) remote URLs would
 * require the plugin to fetch them, which we don't support today.
 *
 * Exported for tests.
 */
export function extractImagePayloads(messages: ChatMessage[]): string[] {
  // Walk from the end so multi-turn convos with assistant rebuttals still
  // hit the most-recent user message's images.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (!m.images || m.images.length === 0) return [];
    const out: string[] = [];
    for (const url of m.images) {
      const b64 = stripDataUrlPrefix(url);
      if (b64) out.push(b64);
    }
    return out;
  }
  return [];
}

function stripDataUrlPrefix(url: string): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    return comma >= 0 ? url.slice(comma + 1) : null;
  }
  // Treat anything else as either a raw base64 already (caller's choice)
  // or an unsupported remote URL we can't safely forward to the plugin.
  // Reject http(s) URLs explicitly to keep the privacy invariant
  // (CLAUDE.md §9.3) — the plugin would otherwise fetch them.
  if (url.startsWith("http://") || url.startsWith("https://")) return null;
  return url;
}
