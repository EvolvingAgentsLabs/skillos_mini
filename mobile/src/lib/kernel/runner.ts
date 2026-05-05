/**
 * runner.ts
 *
 * KernelRunner — multi-turn agentic loop driven by the llm_os kernel
 * Sampler instead of the regex-based tool_parser.
 *
 * This is the kernel-mode counterpart to `mobile/src/lib/llm/run_goal.ts`.
 * It exposes the same general shape (system prompt + goal + tool
 * handlers + event stream) but enforces the ISA grammar at sample time
 * via a token-trie cartridge — invalid opcodes are physically
 * impossible to emit, so there's no parser, no JSON repair, no retry.
 *
 * KernelRunner is decoupled from the wllama worker plumbing. Pass it a
 * Backend implementation (e.g. WllamaKernelBackend wrapping the wllama
 * worker, or wllama directly for tests). The Sampler instance is
 * constructed inside.
 */

import type { Cartridge } from "./cartridge.js";
import { Sampler } from "./sampler.js";
import { parseOpcode, formatResult } from "./dispatch.js";

export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<unknown> | unknown;

export type KernelRunnerEvent =
  | { type: "turn-start"; turn: number }
  | { type: "opcode"; turn: number; cartridge: string; method: string; args: Record<string, unknown>; raw: string }
  | { type: "tool-result"; turn: number; method: string; result: unknown }
  | { type: "halt"; turn: number; status: string }
  | { type: "stalled"; turn: number; reason: string }
  | { type: "fallback"; turn: number; steps: number; total: number }
  | { type: "error"; turn: number; error: string };

export interface KernelRunnerOptions {
  cartridge: Cartridge;
  /** Backend implementing the Sampler's expected interface
   *  (tokenize / detokenize / decode / samplingInit / samplingAccept /
   *  getLogits / kvClear). WllamaKernelBackend is the canonical impl. */
  backend: import("./sampler.js").Backend;
  /** Tool handlers keyed by method name. Called with parsed args; return
   *  value is JSON.stringified into the <|result|>...<|/result|> block. */
  tools: Record<string, ToolHandler>;
  /** Function that builds the initial prompt from the user-supplied goal.
   *  Typically wraps the goal in the model's chat template + system prompt. */
  buildInitialPrompt: (goal: string) => string;
  /** Optional phase-control callback. Returns the Set of opcode indices
   *  legal at this turn given turn number and accumulated history. If
   *  omitted, all method opcodes + halt opcodes are allowed every turn. */
  phaseControl?: (ctx: { turn: number; history: string }) => Set<number> | undefined;
  /** Max turns before forcing halt. Default 20. */
  maxTurns?: number;
  /** Sampler temperature (default 0.5). */
  temperature?: number;
  /** Max tokens per generation step. Default 200. */
  maxTokensPerTurn?: number;
  /** Window threshold (chars) at which to slide the prompt window. */
  promptCharWindow?: number;
  /** Event sink. */
  onEvent?: (e: KernelRunnerEvent) => void;
  /** Abort signal. */
  signal?: AbortSignal;
}

export interface KernelRunnerResult {
  /** Final halt status, or "max-turns" if we exhausted maxTurns without halting. */
  status: "success" | "failure" | "partial" | "max-turns" | "aborted" | "stalled" | "error";
  /** Full turn-by-turn trace. Useful for tests and replay. */
  trace: KernelRunnerEvent[];
  /** Number of turns executed. */
  turns: number;
}

const DEFAULT_MAX_TURNS = 20;
const DEFAULT_TEMP = 0.5;
const DEFAULT_MAX_TOKENS = 200;
const DEFAULT_WINDOW = 6000;

/**
 * Runs a kernel-mode loop to completion.
 *
 * Yields events through opts.onEvent and accumulates them in `trace`. The
 * loop terminates on:
 *   - `<|halt|>` opcode emission (success/failure/partial)
 *   - sampler stall (no valid next token)
 *   - max-turns reached
 *   - signal aborted
 *   - tool handler throws
 *
 * Per turn:
 *   1. (optional) phase control returns allowed opcode index set
 *   2. sampler.generate(prompt, {allowedOpcodes})
 *   3. parseOpcode(text) → {type, cartridge, method, args} | {type:halt}
 *   4. on call: invoke tool handler, format result, append to prompt
 *   5. on halt: return
 *   6. slide prompt window if too long
 */
export async function runKernelLoop(
  goal: string,
  opts: KernelRunnerOptions,
): Promise<KernelRunnerResult> {
  const trace: KernelRunnerEvent[] = [];
  const emit = (e: KernelRunnerEvent) => { trace.push(e); opts.onEvent?.(e); };

  const cartridge = opts.cartridge;
  if (!cartridge.trie) {
    throw new Error("KernelRunner: cartridge.build() must be called before runKernelLoop");
  }

  const sampler = new Sampler(opts.backend, cartridge.trie, {
    temp: opts.temperature ?? DEFAULT_TEMP,
  });

  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const maxTokens = opts.maxTokensPerTurn ?? DEFAULT_MAX_TOKENS;
  const promptWindow = opts.promptCharWindow ?? DEFAULT_WINDOW;

  const basePrompt = opts.buildInitialPrompt(goal);
  let prompt = basePrompt;

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (opts.signal?.aborted) {
      return { status: "aborted", trace, turns: turn - 1 };
    }
    emit({ type: "turn-start", turn });

    const allowed = opts.phaseControl
      ? opts.phaseControl({ turn, history: prompt })
      : undefined;

    let result;
    try {
      result = await sampler.generate(prompt, { maxTokens, allowedOpcodes: allowed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "error", turn, error: `sampler.generate failed: ${msg}` });
      return { status: "error", trace, turns: turn };
    }

    if (result.fellBackSteps > 0) {
      emit({ type: "fallback", turn, steps: result.fellBackSteps, total: result.tokens.length });
    }
    if (result.stalled) {
      emit({ type: "stalled", turn, reason: "no valid next token" });
      return { status: "stalled", trace, turns: turn };
    }
    if (!result.text.trim()) {
      emit({ type: "error", turn, error: "empty output" });
      return { status: "error", trace, turns: turn };
    }

    const op = parseOpcode(result.text);

    if (op.type === "halt") {
      emit({ type: "halt", turn, status: op.status });
      const halt = op.status === "success" || op.status === "failure" || op.status === "partial"
        ? op.status
        : "partial";
      return { status: halt, trace, turns: turn };
    }

    if (op.type === "call") {
      emit({
        type: "opcode", turn,
        cartridge: op.cartridge,
        method: op.method,
        args: op.args ?? {},
        raw: result.text.trim(),
      });

      const handler = opts.tools[op.method];
      if (!handler) {
        const errResult = { error: `no handler for method: ${op.method}` };
        emit({ type: "tool-result", turn, method: op.method, result: errResult });
        prompt += result.text + formatResult(errResult);
        continue;
      }

      let toolResult: unknown;
      try {
        toolResult = await handler(op.args ?? {});
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toolResult = { error: msg };
      }
      emit({ type: "tool-result", turn, method: op.method, result: toolResult });

      prompt += result.text + formatResult(toolResult);

      if (prompt.length > promptWindow) {
        // Sliding window: keep base prompt + last turn's output+result.
        prompt = basePrompt + result.text + formatResult(toolResult);
        sampler.resetKv();
      }
      continue;
    }

    // Unknown opcode shape (shouldn't happen if trie is correct).
    emit({ type: "error", turn, error: `parseOpcode returned unknown: ${result.text.slice(0, 200)}` });
    return { status: "error", trace, turns: turn };
  }

  return { status: "max-turns", trace, turns: maxTurns };
}
