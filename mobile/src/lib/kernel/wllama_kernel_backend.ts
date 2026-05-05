/**
 * wllama_kernel_backend.ts
 *
 * Backend implementation for the llm_os kernel Sampler. The kernel's
 * Sampler expects a Backend with tokenize/detokenize/decode/
 * samplingInit/samplingAccept/getLogits/kvClear methods (see
 * `kernel/sampler.js` JSDoc Backend typedef). In skillos_mini, wllama
 * runs inside a Web Worker (mobile/src/lib/llm/local/wllama_worker.ts),
 * so the main thread cannot call wllama directly. This module provides
 * a proxy class that forwards each Backend call across the worker
 * message channel.
 *
 * The proxy is paired with a small extension to wllama_worker.ts that
 * handles the kernel-* message types. See the bottom of this file for
 * the exact message contract.
 */

export interface KernelBackendOptions {
  /** Worker that hosts the wllama instance. The worker must already
   *  have a model loaded (via the existing `load` message). */
  worker: Worker;
  /** Timeout per call (default 30s). Sampler usually issues many short
   *  calls per opcode, so this is per-call not per-opcode. */
  callTimeoutMs?: number;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

let nextId = 0;

/**
 * WllamaKernelBackend
 *
 * A llm_os kernel Backend that proxies to a wllama instance running
 * inside the same Worker that wllama_backend.ts uses for the existing
 * chat flow. Both code paths can coexist — they share the same model.
 *
 * Usage:
 *
 *   const backend = new WllamaKernelBackend({ worker });
 *   const cartridge = new Cartridge(manifest);
 *   await cartridge.build(s => backend.tokenize(s));
 *   const sampler = new Sampler(backend, cartridge.trie);
 *   const result = await sampler.generate(prompt, { allowedOpcodes });
 */
export class WllamaKernelBackend {
  private worker: Worker;
  private callTimeoutMs: number;
  private pending = new Map<string, PendingCall>();
  private listening = false;

  constructor(opts: KernelBackendOptions) {
    this.worker = opts.worker;
    this.callTimeoutMs = opts.callTimeoutMs ?? 30000;
  }

  private ensureListener(): void {
    if (this.listening) return;
    this.listening = true;
    this.worker.addEventListener('message', (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== 'object') return;
      // Only consume kernelResult / kernelError messages. Other message
      // types (token/done/error from the existing chat flow) pass through
      // untouched — they're handled by wllama_backend.ts's own listener.
      if (data.type === 'kernelResult' && typeof data.id === 'string') {
        const p = this.pending.get(data.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(data.id);
          p.resolve(data.result);
        }
      } else if (data.type === 'kernelError' && typeof data.id === 'string') {
        const p = this.pending.get(data.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(data.id);
          p.reject(new Error(data.message ?? 'kernel call failed'));
        }
      }
    });
  }

  private call<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    this.ensureListener();
    const id = `k${++nextId}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`WllamaKernelBackend: ${method} timed out after ${this.callTimeoutMs}ms`));
      }, this.callTimeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.worker.postMessage({ type: `kernel${method[0].toUpperCase()}${method.slice(1)}`, id, ...args });
    });
  }

  // ── Backend interface ─────────────────────────────────────────────

  tokenize(text: string): Promise<number[]> {
    return this.call<number[]>('tokenize', { text });
  }

  detokenize(tokens: number[]): Promise<Uint8Array> {
    return this.call<Uint8Array>('detokenize', { tokens });
  }

  decode(tokens: number[], opts: object = {}): Promise<unknown> {
    return this.call<unknown>('decode', { tokens, opts });
  }

  samplingInit(opts: { temp?: number; top_k?: number; top_p?: number }): Promise<unknown> {
    return this.call<unknown>('samplingInit', { opts });
  }

  samplingAccept(tokens: number[]): Promise<unknown> {
    return this.call<unknown>('samplingAccept', { tokens });
  }

  getLogits(idx: number): Promise<Array<{ token: number; p: number }>> {
    return this.call<Array<{ token: number; p: number }>>('getLogits', { idx });
  }

  kvClear(): Promise<unknown> {
    return this.call<unknown>('kvClear');
  }
}

/**
 * ── Worker-side message contract ──────────────────────────────────
 *
 * The proxy posts these inbound message types; wllama_worker.ts must
 * handle them and reply with kernelResult or kernelError.
 *
 * Inbound (main thread → worker):
 *   { type: "kernelTokenize",       id, text }
 *   { type: "kernelDetokenize",     id, tokens }
 *   { type: "kernelDecode",         id, tokens, opts }
 *   { type: "kernelSamplingInit",   id, opts }
 *   { type: "kernelSamplingAccept", id, tokens }
 *   { type: "kernelGetLogits",      id, idx }
 *   { type: "kernelKvClear",        id }
 *
 * Outbound (worker → main thread):
 *   { type: "kernelResult", id, result }
 *   { type: "kernelError",  id, message }
 *
 * Each kernel* handler in the worker calls the corresponding wllama
 * method and posts kernelResult with the return value (or kernelError
 * on exception). All handlers are thin pass-throughs — wllama already
 * exposes the Backend interface natively; the worker is just relaying
 * postMessage calls.
 *
 * The handler implementation lives in wllama_worker.ts as an additive
 * extension: it uses the same `wllama` instance the chat flow uses, so
 * a single loaded model serves both paths. See
 * docs/llm-os-kernel-integration.md PR 3 for the wiring.
 */
