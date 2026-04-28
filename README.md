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

A cartridge is a self-contained domain package: YAML manifest, markdown agent prompts, JSON schemas for typed contracts, and deterministic validators that enforce trade-specific rules. The LLM fills structured slots. Validators enforce regulations in code. The result is a diagnosis, work plan, or quote with compliance baked in.

Two inference modes:
- **Cloud** (Gemini) — default, higher quality.
- **Local** (Wllama/LiteRT) — on-device, no internet required.

## Architecture

Cartridge runtime, LLM stack, provider abstraction, and data flow:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Write a cartridge: [docs/TUTORIAL.md](docs/TUTORIAL.md)
End-user guide: [docs/USAGE.md](docs/USAGE.md)
Dev guide: [CLAUDE.md](CLAUDE.md)

## License

Apache 2.0
