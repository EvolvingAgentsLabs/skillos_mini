/**
 * LiteRT-LM Capacitor plugin definitions.
 *
 * Wraps Google's LiteRT-LM Android SDK (com.google.ai.edge:litertlm) for
 * on-device Gemma inference. iOS implementation is pending Google's Swift
 * SDK (currently "in dev" upstream as of 2026-04).
 */

import type { PluginListenerHandle } from "@capacitor/core";

export interface InitModelOptions {
  /** Absolute path to a `.litertlm` file on the device. */
  modelPath: string;
  /**
   * Enable the vision modality on session creation so subsequent
   * generate() calls can include images. Required for Gemma 4 E2B/E4B
   * (multimodal). Default false for text-only models — skipping the
   * vision wiring saves KV-cache and init time.
   */
  enableVision?: boolean;
  /**
   * Maximum number of images the plugin will accept per generate() call.
   * Defaults to 4. Higher values trade KV-cache memory for capability.
   */
  maxNumImages?: number;
}

export interface InitModelResult {
  /** Opaque handle used in subsequent calls. */
  handle: string;
  /** Device-side context window size, if the model reports one. */
  contextWindow?: number;
  /** True when the loaded model supports image inputs. */
  supportsVision?: boolean;
}

export interface GenerateOptions {
  handle: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Stop strings — the plugin applies them via LiteRT's sampler config. */
  stop?: string[];
  /**
   * Optional image inputs (Gemma 4 vision). Each entry is a base64-encoded
   * image WITHOUT the `data:image/...;base64,` prefix. The plugin decodes
   * them natively to Bitmaps and adds them to the session before
   * generation.
   *
   * Ignored when the model was loaded with `enableVision !== true` or
   * when the model does not support vision.
   */
  images?: string[];
}

export interface TokenEvent {
  handle: string;
  /** Incremental text delta since the last event. */
  delta: string;
}

export interface DoneEvent {
  handle: string;
  /** Final full text. Matches the concatenation of all deltas. */
  text: string;
  /** "stop" | "length" | "abort" | backend-specific. */
  finishReason: string;
}

export interface ErrorEvent {
  handle: string;
  message: string;
}

export interface LiteRTPlugin {
  /** Load a `.litertlm` model from disk. Returns an opaque handle. */
  initModel(options: InitModelOptions): Promise<InitModelResult>;

  /**
   * Start streaming generation. Tokens arrive via the `token` event; the
   * returned promise resolves when the plugin emits `done` (and rejects on
   * `error`). Call `cancel()` to abort.
   */
  generate(options: GenerateOptions): Promise<void>;

  /** Abort an in-flight generation. No-op if nothing is running. */
  cancel(options: { handle: string }): Promise<void>;

  /** Unload the model and free native memory. */
  unloadModel(options: { handle: string }): Promise<void>;

  /** Synchronous availability probe — returns false on iOS + web. */
  isAvailable(): Promise<{ available: boolean }>;

  // Event surface
  addListener(
    eventName: "token",
    listener: (event: TokenEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "done",
    listener: (event: DoneEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "error",
    listener: (event: ErrorEvent) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
