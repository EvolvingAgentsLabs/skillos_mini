# Testing the LLM-OS kernel integration

End-to-end test paths across all three sibling repos. After running these, you'll have validated the kernel pattern from `llm_os` working under `skillos_mini`'s wllama runtime, with cartridges that match `skillos_robot`'s real-world challenge.

## Prerequisites

- Node 18+ (for TypeScript / vitest / Vite)
- Python 3 (for the static-asset COOP/COEP server in llm_os demos)
- A modern Chromium-based browser (Chrome 133+) for SharedArrayBuffer
- Network access on first run to download the LFM 2.5 model (~230 MB, then cached)

## Test 1 — Unit tests of the v2 → kernel manifest adapter

```bash
cd c:/evolvingagents/skillos_mini/mobile
npm install               # if you haven't already
npm test -- v2_kernel_adapter
```

**Expected:** 8 tests pass. Covers empty / single-arg / multi-arg / non-enum / Tetris-shape cases plus the full report shape. This validates [`v2_adapter.ts`](mobile/src/lib/kernel/v2_adapter.ts) against deterministic inputs.

## Test 2 — Tetris demo (skillos_mini bundle)

```bash
cd c:/evolvingagents/skillos_mini/mobile
npm run dev
```

Browser → <http://localhost:5173/demos/index.html> → **▶ Tetris** → click **Load Model** → wait for download → click **Auto Play**.

**Expected:** A 350M LLM plays Tetris by emitting grammar-constrained `<|call|>tetris.move {...}<|/call|>` opcodes. The trace panel shows opcodes streaming, board updates, score climbs.

## Test 3 — Scavenger demo (the skillos_robot proxy)

Same dev server. Browser → <http://localhost:5173/demos/index.html> → **▶ Scavenger** → **Load Model** → **Auto Play**.

**Expected:** The LLM finds the red cube, picks it up, navigates to the blue square. The compiled-state shape (objects with bearings + distances) is the same shape `skillos_robot`'s SceneGraph emits — this demo is the JS proxy of the real-world challenge.

## Test 4 — Kernel-mode runner (PR 3 validation)

Same dev server. Browser → <http://localhost:5173/demos/index.html> → **▶ Kernel-mode runner**.

1. Click **Load Model** (~230 MB, cached after first run).
2. Pick cartridge: **echo** (smallest test).
3. Goal: `Say hello once, then halt with status success.`
4. Click **Run**.

**Expected:** Multi-turn loop completes in 2–3 turns. Trace shows:

```
── turn 1 ──
  <|call|>echo.say {"text":"hello"}<|/call|>
  <|result|>{"ok":true,"echoed":"hello"}<|/result|>
── turn 2 ──
  <|halt|>status=success
Done. status=success · turns=2 · tokens=N · fallback=0
```

This validates the full kernel-mode dispatch loop end-to-end: `Cartridge.build()` → `Sampler.generate()` → `parseOpcode()` → tool dispatch → `formatResult()` → next turn → `<|halt|>`.

**Try also:** switch cartridge to **tetris**, set goal to `Observe the board, then halt.` Click Run. Expect: `<|call|>tetris.observe {}<|/call|>` → result → `<|halt|>status=success`.

If the **fallback** counter is high (>50% of tokens), the model's tokenizer doesn't treat `<|call|>` as a single token — see [docs/llm-os-kernel-integration.md](docs/llm-os-kernel-integration.md) "tokenizer compatibility" notes.

## Test 5 — llm_os browser demos (upstream)

```bash
cd c:/evolvingagents/llm_os/demo/tetris-browser
python3 serve.py             # http://localhost:8888
```

```bash
cd c:/evolvingagents/llm_os/demo/scavenger-browser
python3 serve.py             # http://localhost:8889
```

Same model, same kernel — these are the source-of-truth versions. The skillos_mini bundles (Test 2 + 3) should behave identically.

## Test 6 — skillos_robot cartridge adapter, demo mode

```bash
cd c:/evolvingagents/RoClaw       # local folder still RoClaw; remote is skillos_robot
npm install
npm run cartridge:demo
```

This starts the WebSocket cartridge adapter on `ws://localhost:7424/cartridge` with FRESH stub subsystems registered: a SceneGraph pre-seeded with red_cube + blue_square, a ReactiveController, and a HierarchicalPlanner with stub inference. All 5 cartridge methods return structurally-correct data without needing real ESP32 hardware.

In a second terminal, smoke-test with a Node WebSocket client:

```bash
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:7424/cartridge');
const inflight = new Map();

function call(method, args) {
  return new Promise((resolve, reject) => {
    const id = 'r' + Math.random().toString(36).slice(2);
    inflight.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, type: 'call', cartridge: 'robot', method, args }));
  });
}
ws.on('message', d => {
  const m = JSON.parse(d.toString());
  if (m.type === 'progress') return;
  const p = inflight.get(m.id);
  if (p) { inflight.delete(m.id); m.ok ? p.resolve(m.result) : p.reject(m.error); }
});
ws.on('open', async () => {
  console.log('observe:', JSON.stringify(await call('observe', {}), null, 2));
  console.log('describe:', JSON.stringify(await call('describe', {}), null, 2));
  console.log('set_speed:', JSON.stringify(await call('set_speed', { max: 'slow' }), null, 2));
  console.log('navigate:', JSON.stringify(await call('navigate', { goal: 'red_cube' }), null, 2));
  console.log('stop:', JSON.stringify(await call('stop', {}), null, 2));
  ws.close();
});
"
```

**Expected:**
- `observe` returns `{robot: {position, heading_deg}, objects: [{label: red_cube, ...}, {label: blue_square, ...}], object_count: 2}`
- `describe` returns `{text: \"A red cube and a blue square...\", age_ms: <small>}`
- `set_speed` returns `{tier: \"slow\", cruise_speed: 90, ...}` and the next `set_speed` call would see the mutation
- `navigate` returns `{goal, trace_id, step_count: 2, steps: [...], execution: \"integrator_responsibility\"}`
- `stop` returns `{ok: false, error: {code: \"HARDWARE_UNAVAILABLE\", ...}}` unless you started with `--robot-host <ip>` to a real ESP32

## Test 7 — Real `stop` end-to-end (with hardware)

```bash
npm run cartridge:demo -- --robot-host 192.168.1.100
```

The same smoke-test client's `stop` call now sends a real STOP frame (opcode 0x07) over UDP to the ESP32. The firmware safety layer halts motors within one tick.

**Expected:** `stop` returns `{ok: true, result: {stopped: true, opcode: \"STOP\", frame_bytes: 6}}` and the robot physically stops if it was moving.

## What is NOT yet wired (be honest)

- **Production v2 cartridges through kernel-mode in runGoal.** The `KernelRunner` module ([src/lib/kernel/runner.ts](mobile/src/lib/kernel/runner.ts)) is built and tested via the kernel-mode demo (Test 4), but it is not yet swapped into [`mobile/src/lib/llm/run_goal.ts`](mobile/src/lib/llm/run_goal.ts). Production cartridges (electricista, plomero, pintor) still go through the regex-based tool_parser path. PR 3 in [docs/llm-os-kernel-integration.md](docs/llm-os-kernel-integration.md) sketches the swap; doing it well requires careful integration with the existing `LLMProvider` interface and is its own focused session.
- **Vision cartridge backends.** [`cartridge-v2/cartridges/vision/`](cartridge-v2/cartridges/vision/) is `status: design`. The kernel can host it once a backend implementation lands — pending [CLAUDE.md §12](CLAUDE.md) authorization.
- **Robot adapter wired into the running main process.** `cartridge:demo` (Test 6) runs with FRESH stub subsystems. To have cartridge methods affect the running robot's actual SceneGraph / motors, the integrator wiring described in [src/cartridge/README.md](../RoClaw/src/cartridge/README.md) "Integration" section needs to land in `src/index.ts`. That refactor (exposing the running SceneGraph / ReactiveController / Planner from the existing main entry) is straightforward but follows on from this work.

## Where everything lives

| Surface | Location | Status |
|---|---|---|
| Kernel module (vendored) | [mobile/src/lib/kernel/](mobile/src/lib/kernel/) | shipped |
| KernelRunner (multi-turn loop) | [mobile/src/lib/kernel/runner.ts](mobile/src/lib/kernel/runner.ts) | shipped |
| v2 manifest adapter | [mobile/src/lib/kernel/v2_adapter.ts](mobile/src/lib/kernel/v2_adapter.ts) | shipped + tests |
| WllamaKernelBackend | [mobile/src/lib/kernel/wllama_kernel_backend.ts](mobile/src/lib/kernel/wllama_kernel_backend.ts) | shipped |
| wllama worker kernel handlers | [mobile/src/lib/llm/local/wllama_worker.ts](mobile/src/lib/llm/local/wllama_worker.ts) | shipped (additive) |
| Bundled demos | [mobile/public/demos/](mobile/public/demos/) | tetris + scavenger + kernel-mode |
| Vision cartridge spec | [cartridge-v2/cartridges/vision/](cartridge-v2/cartridges/vision/) | design only |
| Integration plan | [docs/llm-os-kernel-integration.md](docs/llm-os-kernel-integration.md) | up to date |
| Robot cartridge adapter | [`../RoClaw/src/cartridge/`](../RoClaw/src/cartridge/) | 5/5 methods wired |
| Robot cartridge demo CLI | [`../RoClaw/src/cartridge/demo_cli.ts`](../RoClaw/src/cartridge/demo_cli.ts) | shipped |
| Scavenger real-world doc | [`../RoClaw/src/cartridge/scavenger-challenge.md`](../RoClaw/src/cartridge/scavenger-challenge.md) | shipped |
