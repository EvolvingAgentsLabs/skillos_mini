# trade

On-device trade assistant for Android. Describe what you need in natural language — the app routes your goal to a sealed cartridge, runs it locally, and enforces trade regulations in code.

Three production cartridges: electricista (IEC 60364), plomero (plumbing diagnostics), pintor (painting quotes).

Part of the [Evolving Agents](https://github.com/EvolvingAgentsLabs) ecosystem.

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
npm test             # 278 vitest cases

# Type check
npx svelte-check
```

In the chat UI, type goals in natural language:

```
"panel has exposed wiring and no RCD"
"urgencia: water leak under kitchen sink"
"3 bedrooms, latex paint, smooth walls"
```

The goal router matches a cartridge automatically. Follow-up questions work within the same session — the blackboard context carries over.

## How it works

A **v2 cartridge** is a directory of markdown documents with embedded tool-call blocks. The Navigator walks the document tree, executes tools deterministically, and only asks the on-device LLM to pick the next link or synthesize prose. The LLM never generates tool calls — compliance rules live in a shared TypeScript tool library (`electrical.ts`, `safety.ts`, `pricing.ts`, etc.).

```
User task → Navigator loads MANIFEST.md → routes to entry doc
  → walks docs (parse tool-calls, resolve args, invoke tools)
  → LLM picks next cross-ref or says DONE
  → outputs diagnosis/quote/report
```

Two inference modes:
- **Local** (Gemma 4 E2B via LiteRT) — on-device, no internet required. Default.
- **Cloud** (Gemini) — fallback for older devices.

## Architecture

Cartridge runtime, LLM stack, provider abstraction, and data flow:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Write a cartridge: [docs/TUTORIAL.md](docs/TUTORIAL.md)
End-user guide: [docs/USAGE.md](docs/USAGE.md)
Dev guide: [CLAUDE.md](CLAUDE.md)

## License

Apache 2.0
