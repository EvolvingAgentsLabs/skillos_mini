# trade

On-device trade assistant for Android. Describe what you need in natural language — the app routes your goal to a cartridge, walks a document tree, executes deterministic safety checks, and lets a small local LLM reason adaptively within guardrails.

Three production cartridges: electricista (IEC 60364), plomero (plumbing diagnostics), pintor (painting quotes).

Part of the [Evolving Agents](https://github.com/EvolvingAgentsLabs) ecosystem.

## How it works

A **v2 cartridge** is a directory of markdown documents. Each document contains prose (the knowledge), tool-call blocks (mandatory checks), and an optional available-tools whitelist (adaptive checks the LLM may invoke). The **Navigator** walks this tree:

```
User: "panel has exposed wiring and no RCD"

    ┌─────────────────────────────────────────────────────┐
    │ Navigator loads MANIFEST.md                         │
    │   → routes to: diagnosis_cableado.md                │
    │   → executes mandatory: electrical.checkWireGauge   │
    │   → LLM sees results + available-tools whitelist    │
    │   → LLM calls: safety.checkRCD (adaptive)          │
    │   → LLM picks next doc or says DONE                │
    │   → COMPOSING: LLM synthesizes final diagnosis     │
    └─────────────────────────────────────────────────────┘

Output: "Cable 2.5mm² para térmico 32A: FALLA. Sin RCD: PELIGRO.
         Recomendar recableado 4mm² + instalación diferencial 30mA."
```

The LLM (Gemma 4 on-device) never generates tool implementations — it only picks links, decides which optional checks to run, and synthesizes prose. All safety rules live in TypeScript functions that execute deterministically.

## Why this works with small models

The Navigator is designed for models with 2B-4B parameters running on a phone NPU:

| What the LLM does | Token budget | Why it's easy |
|---|---|---|
| Pick the next document to visit | ~20 tokens | Choose from 2-5 options |
| Decide which tools to call | ~50 tokens | Structured `<tool_call>` format |
| Synthesize a final report | ~200 tokens | All data already computed by tools |

What the LLM does NOT do:
- Generate tool implementations (they're pre-built in TypeScript)
- Compute electrical formulas (the tool library does that)
- Remember session context (the blackboard stores everything)
- Validate safety rules (deterministic validators enforce compliance)

The document prose serves as **in-context knowledge** — the LLM reads the markdown and uses it as a guide. This is the equivalent of giving a 2B model a reference manual open to the right page.

## Install

```bash
git clone https://github.com/EvolvingAgentsLabs/skillos_mini.git
cd skillos_mini/mobile && npm install
```

## Use

```bash
# Start dev server
npm run dev          # http://localhost:5173

# Run tests
npm test             # 355 vitest cases

# Type check
npx svelte-check
```

In the chat UI, type goals in natural language:

```
"panel has exposed wiring and no RCD"
"urgencia: water leak under kitchen sink"
"3 bedrooms, latex paint, smooth walls"
```

The goal router matches a cartridge automatically. The Navigator walks the document tree, executes checks, and synthesizes output — all on-device.

## Cartridge v2 format

A cartridge is a directory with markdown documents:

```
cartridges/electricista/
├── MANIFEST.md          # Entry point: id, tools_required, locale
├── index.md             # Routes user intents to diagnosis docs
├── cable_subdimensionado.md   # Diagnosis: mandatory checks + adaptive tools
├── sin_rcd.md           # Another diagnosis path
├── presupuesto.md       # Quote generation with pricing tools
└── data/
    └── materials_uy.json
```

Each document is plain markdown with embedded blocks:

````markdown
---
id: cable_subdimensionado
title: Cable subdimensionado
produces: diagnosis
---

# Diagnóstico: Cable subdimensionado

El cable instalado no soporta la carga del circuito.

```tool-call
tool: electrical.checkWireGauge
args:
  breaker_amps: ${ctx.breaker_amps}
  wire_section_mm2: ${ctx.wire_section_mm2}
  circuit_length_m: ${ctx.circuit_length_m}
```

Si el resultado es FALLA, verificar protecciones adicionales.

```available-tools
tools:
  - electrical.checkCircuitBreaker
  - safety.checkRCD
max_calls: 3
purpose: "Run additional checks based on the diagnosis results"
```

Opciones: [Presupuesto recableado](#presupuesto)
````

**`tool-call` blocks** execute deterministically — the Navigator parses them, resolves `${ctx.X}` from the session blackboard, and invokes the TypeScript function. No LLM involved.

**`available-tools` blocks** declare what the LLM *may* call. After mandatory tools run, the LLM sees the results and decides whether to call additional checks. The whitelist prevents hallucinated tool names.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ UI Layer (Svelte 5 + Capacitor)                          │
├──────────────────────────────────────────────────────────┤
│ Navigator State Machine (TypeScript)                     │
│   IDLE → LOADING → ROUTING → WALKING → COMPOSING → DONE │
├──────────────────────────────────────────────────────────┤
│ LLM (Gemma 4 E2B via LiteRT — on-device, no internet)   │
│   Roles: route, pick-next, adaptive tool calls, compose  │
├──────────────────────────────────────────────────────────┤
│ Tool Library (TypeScript — deterministic, no LLM)        │
│   electrical · safety · pricing · plumbing · painting    │
└──────────────────────────────────────────────────────────┘
```

Two inference modes:
- **Local** (Gemma 4 E2B via LiteRT) — on-device, no internet required. Default.
- **Cloud** (Gemini) — fallback for older devices.

Full architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
Write a cartridge: [docs/TUTORIAL.md](docs/TUTORIAL.md)
End-user guide: [docs/USAGE.md](docs/USAGE.md)
Dev guide: [CLAUDE.md](CLAUDE.md)

## What's possible

Because the LLM is guided by documents and all computation is in deterministic tools:

- **Regulatory compliance by construction** — IEC 60364 wire gauge checks can't be hallucinated away
- **Adaptive diagnostics** — the LLM decides what additional checks to run based on symptoms
- **Works offline** — entire flow runs on-device with a 1.5GB model
- **Auditable** — every tool call is logged with args, results, and timing
- **Extensible** — new trade verticals are just new markdown directories, no code changes

## License

Apache 2.0
