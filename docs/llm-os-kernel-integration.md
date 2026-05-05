# Integrating the llm_os kernel into skillos_mini

**Status:** in progress (May 2026). Kernel vendored at [`mobile/src/lib/kernel/`](../mobile/src/lib/kernel/). v2-manifest → kernel-manifest adapter landed in commit `ed0abcc` (PR 2). Not yet wired into [`runGoal`](../mobile/src/lib/llm/run_goal.ts) — that is PR 3, which needs the worker bridge work below.

## Why

The current skillos_mini path emits tool calls via instruction-tuned prompts and parses them back with regex + JSON-repair (`tool_parser.ts`). It works, but allows malformed emissions — the parser handles five tool-call shapes (A/A2/B/C/D) precisely because the model sometimes drifts.

The llm_os kernel makes drift **physically impossible** at the sampler level: token-trie grammar enforces every emission to match a registered opcode. No retries, no shape-handling, no parser fallback — invalid tokens are never sampled.

Per CLAUDE.md §4.4 ("on-device first") and §9.3 (privacy invariants), this is a strict improvement. No new I/O, no new dependencies, deterministic output.

## What's wired

- [`mobile/src/lib/kernel/`](../mobile/src/lib/kernel/) — vendored snapshot of `llm_os/kernel/` (commit `08aca1b`). See [VENDORED.md](../mobile/src/lib/kernel/VENDORED.md) for refresh policy.
- [`mobile/src/lib/kernel/v2_adapter.ts`](../mobile/src/lib/kernel/v2_adapter.ts) — **PR 2, landed**. Pure TS: takes a v2 cartridge's parsed manifest data + per-method JSON Schemas and produces a kernel-format manifest. Cross-products enum-constrained args to synthesize concrete opcode strings. Reports methods with non-enumerable required args as `skipped` so callers know which methods can use kernel-mode and which must fall back to the regex parser. Test at [`mobile/tests/v2_kernel_adapter.spec.ts`](../mobile/tests/v2_kernel_adapter.spec.ts).
- [`cartridge-v2/cartridges/vision/`](../cartridge-v2/cartridges/vision/) — vision cartridge spec, status: `design`.

## What's not wired (the actual integration work remaining)

1. ~~**Cartridge format adapter.**~~ **DONE in PR 2** (commit `ed0abcc`). [`v2_adapter.ts`](../mobile/src/lib/kernel/v2_adapter.ts) does the translation. Methods with required non-enum args are reported as `skipped` — those need either schema tightening (add enums) or future kernel templated-opcode support.

2. **wllama bridge.** The kernel's `Sampler` expects a `wllama` instance with `tokenize`, `detokenize`, `decode`, `samplingInit`, `samplingAccept`, `getLogits`, `kvClear`. Skillos_mini's [`wllama_backend.ts`](../mobile/src/lib/llm/local/wllama_backend.ts) wraps `@wllama/wllama` inside a Web Worker (see [`wllama_worker.ts`](../mobile/src/lib/llm/local/wllama_worker.ts)) — methods are not directly callable from the main thread. The kernel sampler in turn doesn't know about workers. This is the actual blocker for PR 3:
   - **Option A:** add a worker proxy that exposes `tokenize`/`decode`/`getLogits`/`samplingInit`/`samplingAccept`/`kvClear` over the existing worker message channel. Kernel sampler talks to the proxy as if it were wllama.
   - **Option B:** refactor the kernel sampler upstream (`llm_os/kernel/sampler.js`) to take a backend-agnostic interface, then implement that interface for both raw wllama (browser demo) and worker-bridged wllama (skillos_mini).
   - **Recommendation: B.** Keeps the kernel transport-agnostic and avoids a one-off bridge in skillos_mini. Lands as a future PR on `llm_os/kernel/`. Until then, PR 3 is gated.

3. **`runGoal` rewrite path.** Currently `runGoal` does:
   ```
   chat -> raw text -> tool_parser -> {tool_call, args} -> dispatch -> result -> chat
   ```
   The kernel-driven path:
   ```
   sampler.generate(prompt, allowedSet) -> opcode text -> parseOpcode -> dispatch -> formatResult -> prompt += result -> sampler.generate
   ```
   Replace the `chat → tool_parser` loop with `sampler.generate → parseOpcode`. Keep the existing `LLMProvider` interface — kernel sits *underneath* it.

4. **Phase control hookup.** The kernel exposes `cartridge.methodIndices('m1', 'm2')` for run-time-state-dependent phase control. Skillos_mini agents don't currently use phase control — every method is always allowed. Phase control becomes a per-cartridge optional feature: cartridges that want it declare `phase` rules in the v2 MANIFEST, the adapter synthesizes the index sets per state.

5. **Fallback when tokenizer is incompatible.** LFM 2.5 350M is the canonical "works well" model. Other tokenizers (Qwen, Gemma) tokenize `<|call|>` etc. as multi-token sequences → trie's valid-next set rarely intersects top-K logits → fallback fires every step. Need either (a) a tokenizer-compatibility check at model load that warns the user, (b) `kernel/sampler.js` improvement to pull a wider logit window, or (c) graceful fallback to the regex parser path when fallback rate exceeds a threshold. **(a) for now**, (b) is upstream work in `llm_os/kernel/`.

## Tetris demo as Gallery skill — blocked, not impossible

The naive version "drop the llm_os Tetris demo's URL into a Gallery skill iframe" doesn't work today because:

- **CSP**: [`skill-host.html`](../mobile/public/iframe/skill-host.html) has `script-src 'self' blob:` — the Tetris demo imports wllama from `cdn.jsdelivr.net`, which the CSP blocks.
- **Cross-origin isolation**: wllama needs `SharedArrayBuffer`, which requires COOP/COEP headers on the *parent document*. The Capacitor app doesn't send those today.
- **Origin separation**: the Gallery skill iframe is null-origin (sandboxed), but wllama's WASM loader doesn't reliably work in null-origin contexts.

To make this work:
1. Either serve the Tetris demo as part of skillos_mini's own asset bundle (copy `llm_os/demo/tetris-browser/` into `mobile/public/demos/tetris/`) and make it openable in a *new tab*, not an iframe.
2. Or ship a different "external skill" launcher type that opens skills in their own window with their own headers, bypassing the iframe sandbox.

**Option 1 is cleaner.** It's an additive feature, no infrastructure changes. Add it after the kernel-under-runGoal work lands.

## Migration sequence

Following CLAUDE.md §16.6's pattern (multi-PR, do not collapse):

1. **PR 1 — kernel vendoring + design docs.** This PR. No code paths changed; kernel is on disk but unused. (THIS PR.)
2. **PR 2 — v2 adapter + wllama bridge.** Pure additive; new files only. Vitest harness against the existing tetris cartridge (synthetic test that builds the kernel cartridge from the v2 manifest and asserts opcode set parity).
3. **PR 3 — kernel mode flag in `runGoal`.** Default off. Both code paths exist; kernel mode is opt-in via an env var or per-cartridge config.
4. **PR 4 — kernel mode default for v2 cartridges using LFM 2.5.** Old code path stays as fallback for non-LFM tokenizers. Telemetry compares fallback rates.
5. **PR 5 — vision cartridge implementation** (separate from kernel work). Pick one backend per CLAUDE.md §12 escalation; LiteRT Gemma 4 E2B is approved (already in [`litert_backend.ts`](../mobile/src/lib/llm/local/litert_backend.ts)). Cloud backends defer until §12 explicitly authorizes.
6. **PR 6 — Tetris demo as bundled static asset + new-tab launcher.** Cosmetic; demonstrates llm_os/skillos_mini integration end-to-end.
7. **PR 7 — kernel mode default everywhere; deprecate the regex parser.** Only after PR 4 telemetry shows kernel mode is at least as reliable as the regex parser on real cartridge runs.

Each PR independently mergeable. PRs 5 and 6 can run in parallel with 3-4.

## CLAUDE.md compliance checklist

- [x] No new top-level npm dep (§12). Kernel is pure JS, ESM, zero deps.
- [x] No outbound network at runtime (§9.3). Kernel is text-in / token-out.
- [x] No cloud-by-default (§4.4). Vision cartridge is opt-in tier; kernel doesn't change provider routing.
- [x] No bypass of cartridge model (§12). The kernel sits *beneath* the cartridge model — every kernel call corresponds to a declared method on a registered cartridge.
- [x] No iOS-specific code (§12). Pure web/JS.
- [x] No package extraction (§12). Kernel is vendored, not extracted.
- [x] CLAUDE.md unchanged so far — section 16 still describes v2 as authoritative; this work is additive infrastructure under the v2 model.

## Open questions for Matias

1. **Authorize PR 5's LiteRT Gemma 4 E2B vision backend?** Already on the supported list; no new dep. Just needs sign-off to wire it through the cartridge.
2. **Authorize PR 6 (bundling llm_os Tetris demo as static asset)?** Adds ~300 KB to the APK; gives a demonstrable "look, an LLM-OS plays Tetris on your phone" moment for marketing.
3. **Cloud vision opt-in?** Q5/Q6 of CLAUDE.md §14 are open. Vision cartridge MANIFEST defaults to local; cloud backends stay unimplemented until that's settled.

## Provenance

Designed alongside the llm_os kernel extraction (commit `08aca1b` on llm_os branch `feat/kernel-extraction`). Architectural rationale in `c:/evolvingagents/projects/Project_llm_os_as_kernel/output/01_synthesis.md` and `03_skillos_mini_migration.md` (sibling repo).
