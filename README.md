# trade

Run sealed trade cartridges from the terminal. Each cartridge bundles domain knowledge with deterministic validators — the LLM proposes, code enforces.

Three production cartridges: electricista (IEC 60364), plomero (plumbing diagnostics), pintor (painting quotes).

Part of the [Evolving Agents](https://github.com/EvolvingAgentsLabs) ecosystem.

## Install

```bash
git clone https://github.com/EvolvingAgentsLabs/skillos_mini.git
cd skillos_mini
pip install pyyaml    # only runtime dependency
```

## Use

```bash
# List available cartridges
trade list

# Run a diagnosis
trade electricista "panel has exposed wiring and no RCD"

# Run a quote
trade plomero "urgencia: water leak under kitchen sink"

# Portfolio quote
trade pintor "3 bedrooms, latex paint, smooth walls, antes/despues"

# Force a specific flow
trade electricista --flow quote_only "install new circuit for AC unit"
```

### Web terminal (dev mode)

```bash
cd mobile && npm install
npm run dev          # http://localhost:5173 — terminal chat UI
```

### Run tests

```bash
cd mobile && npm test    # 278 vitest cases
```

## How it works

A cartridge is a self-contained domain package:

```
cartridges/trade-electricista/
  cartridge.yaml            manifest + flows
  agents/*.md               LLM prompts (diagnosis, quoting)
  schemas/*.schema.json     typed contracts between agents
  validators/*.py           deterministic rules (IEC 60364)
  data/*.json               local material prices (Uruguay)
```

The LLM fills structured slots. Validators enforce trade-specific rules in code. The result is a diagnosis, work plan, or quote with regulatory compliance baked in.

## Architecture

Cartridge runtime, LLM stack, provider abstraction, and data flow:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

Write a cartridge: [docs/TUTORIAL.md](docs/TUTORIAL.md)
End-user guide: [docs/USAGE.md](docs/USAGE.md)
Dev guide: [CLAUDE.md](CLAUDE.md)

## License

Apache 2.0
