# skillos_mini

> **On-device, mobile-first agentic OS for tradespeople.**
> Capture photos of a job, get an AI-assisted diagnosis, send a branded PDF
> report or quote to your client by WhatsApp. Everything runs on the phone.
> Photos never leave the device until *you* share them.

[![tests](https://img.shields.io/badge/tests-278%20passing-brightgreen)]()
[![Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

---

## What this is

skillos_mini is two things at once:

1. **A reusable on-device runtime** — Svelte 5 + Capacitor + on-device LLM
   (Gemma 4 via LiteRT on Android, wllama WASM elsewhere) wrapped around
   the **cartridge model**: sealed per-domain bundles with JSON-Schema
   contracts and **deterministic validators** that enforce rules in code,
   not in prompts.

2. **A trade-app vertical** for Spanish-speaking tradespeople (Uruguay
   first), with three production cartridges:
   - **electricista** — IEC 60364 / UTE compliance + repair safety.
   - **plomero** — urgencia-first vision diagnostic + obra quoting.
   - **pintor** — auto portfolio (antes/después) + presupuesto por m².

The runtime is the moat. The cartridges are how it ships.

---

## Why this matters now (April 2026)

Anthropic shipped Agent Skills as a first-class concept; Google AI Edge
Gallery shipped Agent Skills on-device with Gemma 4. **"Skills as markdown"
is now a commodity.** What still isn't commodity:

- Sealed cartridge bundles with **deterministic validators** in code.
  Gemma 4 proposes problem categories; `compliance_checker.py` enforces
  IEC 60364. The LLM never decides "is RCD required" — that's a table
  lookup.
- A real on-device flow that produces a **printable, branded PDF** the
  trade can send to the client by WhatsApp without a server.
- A multimodal vision diagnosis that runs **on the phone**, with photos
  that never leave the device until the trade explicitly shares them.

That's what skillos_mini ships.

---

## Demo loop in 60 seconds

```
1. Open app → onboarding picks "Electricista" → fills profile (name,
   matrícula UTE, phone, RUT, logo).

2. HomeScreen shows an electricista-blue banner with "Nuevo trabajo" CTA.

3. Tap "Nuevo trabajo" → camera shutter → take 1–3 fotos.

4. Tap "Continuar" → "Auto-diagnóstico" runs Gemma 4 vision on-device →
   fills diagnosis textareas in es-UY. Trade edits and dictates more
   via the 🎤 button (live STT).

5. Tap "Generar reporte" → pdfmake renders a PDF on-device with the
   trade's logo + matrícula in the header, before/after photo rows,
   work-done summary, warranty + IEC 60364 disclaimer in the footer.

6. Tap "Compartir por WhatsApp" → @capacitor/share fires the system
   sheet → WhatsApp opens with the PDF attached.

7. Job persists in IndexedDB. Tomorrow it shows up under "Trabajos
   recientes" — tap to re-share, or filter by status.

8. Switch to Pintor → same data layout, but Library defaults to
   portfolio mode (antes/después grid). Same engine, different surface,
   zero code change in the cartridge.
```

The whole loop runs **without any backend**. The model download CDN and
the cartridge data refresh URL are the only outbound calls allowed at
app start.

---

## What's in the box

### Three production cartridges

| Cartridge | Default flow | Validators | Local data |
|---|---|---|---|
| `trade-electricista` | `intervention`, `quote_only` | `compliance_checker.py` (IEC 60364), `repair_safety.py` | Genrod, Sica, Roker, Plastix |
| `trade-plomero` | `urgencia` (default), `obra` | `plumbing_checker.py` (slope ≥ 1%, fixture diameters, pressure-test) | FV, Loto, Hidromet, Rotoplas |
| `trade-pintor` | `presupuesto`, `trabajo` | `painting_sanity.py` (drying time, coverage, prep gate) | Sherwin Williams, Inca, Sinteplast, Kolor |

Plus a `_shared/` library of common schemas and agent prompts the
cartridges depend on (`photo_set`, `diagnosis`, `work_plan`, `quote`,
`execution_trace`, `client_report`, `client_message`).

### Provider abstraction

The shell and runtime never import Capacitor APIs directly. Five
provider interfaces live in `mobile/src/lib/providers/`:

- `MediaProvider` — `capturePhoto`, `recordVoice`, capability probes.
- `StorageProvider` — `saveBlob` / `getBlob` / `deleteBlob`, IndexedDB / FS.
- `ShareProvider` — `sharePDF(uri, {channel: "whatsapp" | …})`.
- `GeoProvider` — `getPosition` (opt-in only, never default).
- `SpeechProvider` — `transcribe(audioUri)` + live `listen()` for STT.

Three implementations per interface: **Capacitor** (production Android),
**Web** (dev/preview in Chrome), **Mock** (Vitest). The shell calls
`getProviders()` and gets the right one for the platform.

### LLM stack

- Cloud: OpenAI-compatible providers (Gemini OpenAI compat, OpenRouter
  with GPT-4V or Claude). Multimodal `ChatMessage.images` is rewritten
  into the `content: [{type:"text"},{type:"image_url"}]` array shape.
- Local: **LiteRT-LM 0.2** on Android with **Gemma 4 E2B/E4B vision**.
  When the loaded model declares `vision: true`, the plugin enables the
  vision modality on session creation, decodes base64 photos to Bitmaps,
  wraps as MPImages, and attaches via `addImage()` before generation.
- WASM fallback: wllama (text-only) for older Android and desktop browsers.

### Runtime

- **Cartridge runtime** (TS port of the original Python `cartridge_runtime.py`):
  manifest parser, blackboard, schema validators (Ajv), agent prompt
  composer, flow execution, fallback routing.
- **Validators-builtin** registry: domain validators ship as `.py` source
  of truth + TS port keyed by filename (so the mobile runtime can execute
  them in-browser).
- **Job store**: a job = a `BlackboardRecord`. CRUD + `listJobsForCartridge`
  / `resumeStepFor` / `defaultClientReport` / `defaultQuote`.

### UI shell

Five screens (CLAUDE.md §5):

- **Home** — recipe grid + active-cartridge banner + jobs list.
- **Capture** — fullscreen shutter, role chip, voice annotation.
- **Job** — vertical timeline of blackboard entries.
- **Quote / Report** — split editor + live PDF preview.
- **Library** — list mode (default) or portfolio mode (pintor).

Plus a `Settings` sheet with editable profile + cartridge picker.

---

## Repo layout

```
skillos_mini/
├── CLAUDE.md                        ← Source-of-truth dev guide. Read first.
├── README.md                        ← This file.
├── docs/
│   ├── ARCHITECTURE.md              ← System architecture + mermaid diagrams.
│   ├── TUTORIAL.md                  ← Build your first cartridge in 30 min.
│   └── USAGE.md                     ← End-user guide for tradespeople.
├── cartridges/
│   ├── _shared/                     ← Common schemas + agent prompts.
│   ├── trade-electricista/
│   ├── trade-plomero/
│   ├── trade-pintor/
│   ├── residential-electrical/      ← Original IEC 60364 design cartridge.
│   ├── cooking/  demo/  learn/      ← Legacy non-trade cartridges.
└── mobile/
    ├── capacitor-plugins/litert-lm/ ← Native LiteRT-LM Android plugin.
    ├── src/
    │   ├── lib/
    │   │   ├── cartridge/           ← Runtime + validators.
    │   │   ├── llm/                 ← Cloud + local LLM clients.
    │   │   ├── providers/           ← Media/Storage/Share/Geo/Speech.
    │   │   ├── report/              ← pdf.ts + quote_pdf.ts.
    │   │   ├── state/               ← Svelte 5 rune stores.
    │   │   └── storage/             ← IndexedDB.
    │   └── components/              ← TradeFlowSheet, JobsList, etc.
    └── tests/                       ← 278 vitest cases.
```

## Quick start

```bash
git clone https://github.com/EvolvingAgentsLabs/skillos_mini.git
cd skillos_mini/mobile
npm install
npm run seed         # Seeds cartridges into a manifest the app reads at boot.
npm run dev          # Vite dev server. Open http://localhost:5173.
npm test             # 278 vitest cases.
npm run check        # svelte-check (TypeScript + Svelte).
```

Build the Android APK:

```bash
cd mobile
npx cap add android  # only first time
npx cap sync android
npx cap open android # opens Android Studio
```

See [`docs/USAGE.md`](docs/USAGE.md) to use the app, or
[`docs/TUTORIAL.md`](docs/TUTORIAL.md) to author your own cartridge.

## What's not built yet

- iOS app (CLAUDE.md §3.3 — gated until Capacitor LiteRT iOS lands).
- Cloud sync / backup (planned for v1.1).
- Dataset upload pipeline (planned for v1.2 — see CLAUDE.md §10).
- Live token streaming in the trade-flow Review screen (the LLM call
  itself streams; the UI surfaces only the final transcript today).

## Status

- **278 / 278** vitest cases passing.
- **0** svelte-check errors.
- v0.1.0 (M2 milestone in [`CLAUDE.md`](CLAUDE.md) §8) is feature-complete
  in code; pending real-device validation against the §9.1 performance
  budgets.

## License

Apache 2.0 for the runtime.
Trade cartridges with audited regulatory validators may be dual-licensed
in the future (open-core pattern) — see [`CLAUDE.md`](CLAUDE.md) §13.

## Reading order

1. [`CLAUDE.md`](CLAUDE.md) — source-of-truth development guide. Read this
   first. Section §1–§4 is the *why*; §6–§8 is *what to do next*.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture +
   data flow diagrams.
3. [`docs/USAGE.md`](docs/USAGE.md) — end-user walkthrough.
4. [`docs/TUTORIAL.md`](docs/TUTORIAL.md) — author your own cartridge.
