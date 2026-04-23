# skillos_mini

SkillOS port for **mobile + small local LLMs**. Split from [EvolvingAgentsLabs/skillos](https://github.com/EvolvingAgentsLabs/skillos) on 2026-04-23, where the original repo continues as the desktop console runtime for big cloud LLMs.

## What lives here

- **`mobile/`** — TypeScript + Svelte 5 + Vite + Capacitor app. Ports the full SkillOS runtime (Blackboard, CartridgeRegistry, CartridgeRunner, ajv validators, LLM tool-call loop, Gallery skills in a sandboxed iframe) to the browser and phone. On-device LLM via wllama WASM everywhere + LiteRT-LM Capacitor plugin on Android. Smart routing (local-first with cloud fallback on validation failure). Full in-app authoring. LLM-powered compaction, run checkpoint + resume, offline queue.
- **`cartridges/`** — Sealed per-domain bundles (agents + JSON Schemas + deterministic Python validators). Reference cartridges: `cooking`, `residential-electrical` (IEC 60364), `demo` (11 Gallery JS skills), `learn` (JS subagents + persistent knowledge).
- **`cartridge_runtime.py`** — Python runtime for cartridges (CartridgeRegistry, CartridgeRunner, Blackboard). Gemma-native: closed-set router, `<produces>{…}</produces>` contract with schema-validated retry.
- **`compactor.py`** — LLM-powered context compaction for long-running sessions with small-context models.
- **`experiments/gemma4-skills/`** — Gemma-specific JS skill loader + Node.js executor.
- **`run_aorta_gemma.py`, `run_echoq_gemma.py`** — Gemma-specific scenario runners.
- **`projects/Project_aorta_gemma*`, `projects/Project_echo_q_gemma*`** — Gemma scenario outputs (v1–v4).
- **`docs/mobile.md`, `docs/tutorial-mobile.md`, `docs/tutorial-gemma4-colab.md`, `docs/cartridges.md`, `docs/js-skills.md`, `docs/tutorial-js-subagents.md`** — domain docs.

## Quick start — mobile

```bash
cd mobile
npm install
npm test                 # 129 passing tests across 24 spec files
npm run dev              # open http://localhost:5173 in Chrome, toggle device emulation
```

## Quick start — cartridges (Python)

```bash
# List installed cartridges
python -m cartridge_runtime --list

# Run the cooking cartridge against a goal
python -m cartridge_runtime cooking \
    "Plan meals for next week, 2 adults, vegetarian, Mediterranean"

# Residential electrical design with IEC 60364 compliance checking
python -m cartridge_runtime residential-electrical \
    "Design electrical for a 3-BR apartment"

# Run the cartridge test suite
pytest tests/test_cartridge_runtime.py
```

## Related

- **[EvolvingAgentsLabs/skillos](https://github.com/EvolvingAgentsLabs/skillos)** — Desktop console + big cloud LLMs (Claude Code, Qwen, Gemini). Pure Markdown OS framework, Cognitive Pipeline, dialects, SmartMemory, RoClaw robot integration.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
