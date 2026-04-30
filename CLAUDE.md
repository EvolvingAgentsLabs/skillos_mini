# skillos_mini — Development Guide

> **Read this file at the start of every work session.**
> It is the source of truth for *why* we are building, *what* we are building,
> and *what not to build*. If this guide and the code disagree, this guide wins
> and the code should be brought into line. If this guide and a user request
> disagree, escalate to Matias before proceeding.

---

## 1. Mission

`skillos_mini` is the on-device, mobile-first runtime of the SkillOS family —
a port of the original `skillos` desktop framework to small local LLMs (Gemma 4,
wllama, LiteRT) running on the user's phone, with sealed cartridges that
enforce domain rules deterministically (not via prompt).

The repo serves **two purposes** simultaneously:

1. **A reusable runtime** (the cartridge model + UI shell + capture + report
   stack) that future verticals can build on with zero changes to the core.
2. **The first commercial vertical**: a trade-app for Spanish-speaking
   tradespeople (Uruguay first, LatAm next), starting with three trades —
   electricista, plomero, pintor.

Both purposes must be served at once. When in doubt: keep the runtime generic,
keep the trade-app concrete.

## 2. Strategic Context (why this, why now)

- **April 2026**: Anthropic shipped Agent Skills as a first-class concept.
  Google AI Edge Gallery shipped Agent Skills on-device with Gemma 4. The
  SKILL.md format is now an industry standard.
- **Our differentiator is NOT "skills as markdown"** — that is now commodity.
  Our differentiator is **cartridges**: sealed per-domain bundles with
  JSON-Schema contracts and **deterministic Python/TS validators** that
  enforce rules without trusting the LLM. This is what makes us safe for
  regulated trades.
- **On-device frontier just opened**: Gemma 4 E2B runs in <1.5GB with native
  vision and reliable function calling. LiteRT-LM gives ~31 dec tok/s on
  Snapdragon NPU. The window to ship a production-grade on-device agentic
  app for a regulated vertical is open *now* and will narrow as Google adds
  more trade templates to Edge Gallery.
- **The trade-app vertical is the proof point**: it demonstrates the cartridge
  moat in a real, regulated, multimodal context, while generating real revenue
  and (eventually) a unique multimodal dataset of skilled manual work.

## 3. Vertical Decision: Oficios (Android-only MVP)

### 3.1 The three trades

Picked based on simulated and (to-be-validated) real interviews:

| Trade | Killer feature | Validation intensity | Cartridge basis |
|---|---|---|---|
| **electricista** | Dated PDF + auto-quote | Strict (IEC 60364, UTE norms) | Adapt `cartridges/residential-electrical/` |
| **plomero** | Vision diagnostic + local materials list | Moderate (slope, diameters, pressure) | New |
| **pintor** | Auto portfolio + fast quote per m² | Soft (best practices, drying times) | New |

The trio spans three validation regimes deliberately — it stress-tests how
flexible the cartridge framework needs to be.

### 3.2 Distribution: Android-only via Capacitor. No backend. No PWA.

| Decided | Rationale |
|---|---|
| Android native via Capacitor 6 | Real filesystem for ~1.5GB Gemma 4 weights, NPU acceleration via existing `capacitor-plugins/litert-lm`, ~85% trade users in LatAm are Android |
| **No backend in MVP** | PDFs go directly to the user's WhatsApp via `@capacitor/share`. No servers, no auth, no GDPR exposure for us. Privacy-by-default real |
| **No Vercel / no PWA viewer** | The PDF *is* the deliverable to the client. They view it in WhatsApp/Drive |
| **No iOS in MVP** | LiteRT-LM iOS plugin not ready; wllama-only iOS would be ~5x slower vision; revisit at M12+ |
| Cloud LLM fallback: **off by default** | The whole point is on-device. Cloud is opt-in per cartridge, never automatic |

### 3.3 What we are NOT building in MVP (explicit list)

These have been considered and rejected for v1.0. Do not add without explicit
re-decision:

- ❌ Any kind of backend server (auth, sync, storage)
- ❌ Backup to Google Drive (planned for v1.1)
- ❌ Dataset upload pipeline (planned for v1.2 — see §10)
- ❌ Multi-device sync
- ❌ Web/PWA distribution (the `mobile/` folder Vite dev server is for testing only)
- ❌ iOS app
- ❌ Cloud LLM as default provider
- ❌ Real-time collaboration
- ❌ User accounts (the device IS the account)
- ❌ Push notifications (v1.1)
- ❌ Telemetry to external services (local-only telemetry to SQLite, exportable)

## 4. Architectural Principles (Non-Negotiable)

These four abstractions exist to keep the trade-app and the runtime separable.
**Violating them silently couples the app to the runtime and kills the
"future verticals" thesis.**

### 4.1 Cartridge-driven everything

If a behavior is "specific to electricista", it lives in `cartridges/trade-electricista/`,
**not** in app code. This includes labels, copy, colors, icons, flow order,
default actions, validators, schemas, prompt templates, and local data files.

The `cartridge.yaml` schema is being extended with a `ui:` block:

```yaml
ui:
  brand_color: "#2563EB"
  emoji: "⚡"
  primary_action:
    label: "Nuevo trabajo"
    flow: intervention
    icon: bolt
  secondary_actions:
    - label: "Presupuestar obra"
      flow: quote_only
      icon: clipboard
```

Plus a `hooks:` block:

```yaml
hooks:
  on_quote_generated:
    - send_to_blackboard: client_message
  on_job_closed:
    - generate_report: true
    - prompt_corpus_consent: false  # off until v1.2
```

The shell consumes both. The cartridge knows nothing about Capacitor or Svelte.

### 4.2 Schema-driven UI

Every form/editor in the app is generated from a JSON Schema + an optional
`ui-hints.json` per schema. We already have `mobile/src/components/editors/`
and `mobile/src/components/renderers/` — extend that pattern, do not write
hand-coded forms per cartridge.

### 4.3 Provider-agnostic data layer

The shell and cartridge runtime do not import Capacitor APIs directly. They
go through interfaces in `mobile/src/lib/providers/`:

```ts
interface MediaProvider { capturePhoto(opts), recordVoice() }
interface StorageProvider { saveBlob(uri, bytes), getBlob(uri) }
interface ShareProvider { sharePDF(uri, channel?: 'whatsapp'|'email'|'drive') }
interface GeoProvider { getPosition() }
interface SpeechProvider { transcribe(audioUri) }
```

Implementations:
- `CapacitorMediaProvider` — production
- `WebMediaProvider` — browser dev/preview
- `MockMediaProvider` — Vitest

This makes vitest testing trivial and unblocks future iOS/desktop ports.

### 4.4 On-device first, escape hatch documented

Every LLM call goes through the existing `mobile/src/lib/llm/build_provider.ts`
which already supports local-first routing. **Do not add a code path that
bypasses this** to call cloud directly. If a cartridge needs cloud (e.g., for
a complex flow), it sets `preferred_tier: cloud` in `cartridge.yaml` —
explicit, auditable, reversible.

## 5. The Five Screens (UI Shell Spec)

The shell exposes exactly five screens. New cartridges do not add screens —
they configure the existing ones.

### 5.1 Home

- Header: logo + settings + stats
- Primary action button (label/flow from active cartridge)
- Secondary actions if cartridge declares them
- Active jobs list (status-coded)
- Drafts and Closed sections (collapsed)

### 5.2 Capture

- Fullscreen camera, large shutter
- Auto-inferred role chip (`before` | `during` | `after` | `detail`) based on flow position; tap-to-change
- Side controls: voice annotation, flashlight, geo toggle, undo
- **No immediate form**. Annotations happen later, on the Job screen
- Discreet mode: hide app chrome on capture so the user can take photos in front of clients without it looking like they are filling forms

### 5.3 Job (the expediente)

Vertical timeline of all blackboard entries for a single project run.
Each entry expandable, AI-generated entries flagged with `✨ sugerido — editá`,
all entries editable. Action buttons at the bottom for the next flow step.

### 5.4 Quote/Report (split editor + preview)

Same screen, two modes (`quote` and `report`). Top half: schema-driven form.
Bottom half: live PDF preview. Bottom action bar: Share via WhatsApp / Email
/ Save.

### 5.5 Library

- Default: list of past jobs, filterable by date/client/cartridge
- Toggle: portfolio mode (grid antes/después) — relevant for pintor primarily
- Tap-through to read-only Job view

### 5.6 Cross-cutting

- **Trade chip** in app header: shows active cartridge with brand color and
  emoji. Tap to switch trades (if multiple installed).
- Theme tokens (`--brand`, `--accent`) come from active cartridge.

## 6. The Three Cartridges (Concrete Specs)

> **⚠ v1 POC — superseded.** This section describes the v1 (pipeline +
> per-cartridge Python validators + JSON schemas) cartridge model. As of
> 2026-04-29 the architecture forward is **Cartridge v2** (pure markdown +
> shared TS tool library + define/use modes). See **§16** for v2 and
> `cartridge-v2/` for the reference implementation.
>
> The v1 cartridges in `cartridges/` remain on disk and are still wired
> into `mobile/` until the migration PR sequence completes
> (`cartridge-v2/MIGRATION_PLAN.md`). Read this section as historical
> reference; do not extend v1 cartridges with new code — author v2
> equivalents instead.

Each cartridge follows the existing pattern in
`cartridges/residential-electrical/`:

```
cartridges/trade-{name}/
├── cartridge.yaml          # manifest with `ui:` and `hooks:` extensions
├── agents/
│   ├── *.md                # frontmatter + prompt + <produces>{...}</produces>
├── schemas/
│   ├── *.schema.json       # JSON Schema draft-07
├── validators/
│   ├── *.py                # deterministic, no LLM
├── data/                   # NEW: local knowledge files
│   ├── materials_uy.json
│   ├── labor_rates_uy.json
│   └── *.md                # reference notes
└── ui-hints.json           # form rendering hints per schema
```

### 6.1 Common schemas (shared across cartridges, lifted to `cartridges/_shared/`)

- `photo_set.schema.json` — `[{uri, taken_at, geo?, exif, role, annotations?}]`
- `diagnosis.schema.json` — `{trade, severity:1-5, problem_categories[], visual_evidence_refs[], confidence, hazards[]}`
- `work_plan.schema.json` — `{steps[], estimated_hours, materials[{sku?, name, qty, unit}], safety_notes[], requires_permit?}`
- `execution_trace.schema.json` — `{actions[{step_ref, started_at, ended_at, photos_refs[], notes, deviation?}]}`
- `quote.schema.json` — `{description, line_items[{name, qty, unit, unit_price, total}], labor_hours, labor_rate, subtotal, tax, total, valid_until}`
- `client_report.schema.json` — `{summary, before_photos[], after_photos[], work_done[], warranty_terms?, follow_up?, professional_disclaimer}`

### 6.2 Common agents

- `vision-diagnoser.md` — multimodal: takes photos + cartridge tone, emits diagnosis
- `quote-builder.md` — takes diagnosis + cartridge data files, emits quote
- `report-composer.md` — takes the full blackboard, emits client_report
- `client-message-writer.md` — short messages for client during execution

### 6.3 Per-trade specifics

#### electricista (`cartridges/trade-electricista/`)

- Default flow: `intervention` (capture → diagnose → quote → execute → close → report)
- Validators:
  - Inherit `compliance_checker.py` from `residential-electrical`
  - Add `repair_safety.py`: assert "power-off documented" before any execution step that touches live circuits, RCD post-repair on wet rooms
- Data files:
  - `materials_uy.json`: Genrod, Sica, Roker, Plastix — cables by gauge with reference prices
  - `labor_rates_uy.json`: matriculado vs no-matriculado hourly rates
  - `ute_norms.md`: relevant UTE norm references
- UI:
  - Brand color `#2563EB` (azul UTE-ish)
  - Emoji `⚡`

#### plomero (`cartridges/trade-plomero/`)

- Two flows:
  - `urgencia` (default): capture_problem → diagnose → notify_client → execute → close
  - `obra`: full quote-first cycle
- Validators:
  - `plumbing_checker.py`: drain slope ≥1%, fixture diameters (40mm lavabo, 50mm shower, 110mm toilet), test pressure documented for new pipes in obra flow
- Data files:
  - `materials_uy.json`: FV, Loto, Hidromet, Rotoplas — fittings by diameter
  - `common_problems.md`: symptom → likely cause heuristics (NOT used for diagnosis directly — fed as context to vision-diagnoser)
- UI:
  - Brand color `#0EA5E9`
  - Emoji `🔧`
  - Primary action: "Atender llamada"

#### pintor (`cartridges/trade-pintor/`)

- Two flows:
  - `presupuesto` (visit): walkthrough → measure → assess → quote → share
  - `trabajo` (execution after approval): execute_log → portfolio_compose → share + add_to_portfolio
- Validators:
  - `painting_sanity.py`: drying time between coats per declared product, m²/litre coverage sanity check, warn if no surface-prep photo
- Data files:
  - `paint_brands_uy.json`: Sherwin Williams, Inca, Sinteplast, Kolor — products, m²/L, drying times
  - `surface_types.md`: yeso, mampostería, hormigón, madera, metal — prep requirements
- UI:
  - Brand color `#F59E0B`
  - Emoji `🎨`
  - Library default: portfolio mode (grid)

### 6.4 Cartridge data file refresh strategy

Data files are NOT bundled-only. The app checks for updates on launch when
WiFi available, fetches from a trusted GitHub-Pages-hosted JSON manifest,
and refreshes if newer. This means we can ship updated price lists and new
products without releasing a new APK. The manifest URL is hardcoded
per-cartridge in `cartridge.yaml`. **No backend required** — GitHub Pages /
Cloudflare Pages serves static JSON.

## 7. New Components to Build (in dependency order)

### 7.1 Provider interfaces (week 2, foundational)

`mobile/src/lib/providers/` — the four interfaces from §4.3 + Capacitor and
Web implementations + Mock for tests. **Build this first**, retrofit existing
code to use the interfaces.

### 7.2 PhotoCapture component (week 2)

`mobile/src/components/PhotoCapture.svelte` — wraps `MediaProvider.capturePhoto`,
writes blob to IndexedDB via existing `db.ts`, emits a typed `PhotoRef` to the
current blackboard. Props: `role`, `auto_geo`, `auto_voice_annotation`.

### 7.3 Vision pipeline integration (week 2-3)

Extend `mobile/src/lib/llm/local/chat_templates.ts` to support multimodal
prompts (image inputs). Wire through `litert_backend.ts` (uses Gemma 4 vision
natively) and `wllama_backend.ts` (text-only fallback — emit a warning
upstream when used with a vision-required agent).

### 7.4 Voice annotation (week 3)

`SpeechProvider` interface + `@capacitor-community/speech-recognition` impl.
On-device transcription only. Falls back to "voice memo" (audio file attached
to photo) if STT unavailable on the device.

### 7.5 PDF generator (week 3-4)

`mobile/src/lib/report/pdf.ts` — uses `pdfmake` (lighter than jsPDF for our
use). Templates per cartridge live in `cartridges/trade-*/templates/*.pdf.json`
(pdfmake docdef format). Templates can reference blackboard entries via a
small expression syntax (`{{client_report.summary}}`).

### 7.6 Share integration (week 4)

`ShareProvider` Capacitor impl wraps `@capacitor/share`. WhatsApp gets first-class
support: pre-fills the share sheet with the client's number if it's in the
project's metadata, otherwise opens generic share.

### 7.7 Trade-shell glue (week 4-5)

The five screens consume the cartridge's `ui:` block to configure themselves.
Refactor existing `HomeScreen`, `BrainScreen`, `LibraryScreen` to read from
the active cartridge instead of hardcoded labels.

### 7.8 Onboarding (week 7-8)

`mobile/src/components/Onboarding.svelte` already exists — extend with:
- Trade selection (which cartridges to install)
- Logo + business data capture (for branded PDFs)
- One guided simulated job per selected trade
- Model download with WiFi gate and clear "this AI runs on your phone" copy

## 8. Roadmap (12 weeks, milestones with definition-of-done)

Each milestone ends with a tagged release: `v0.X.Y`. Tag at end of milestone,
not mid-milestone.

| M | Weeks | Goal | Definition of Done |
|---|---|---|---|
| **M1** | 1 | Validation + lock decisions | 3 real interviews logged, naming chosen, advisors identified for each trade |
| **M2** | 2-4 | Electricista MVP | `trade-electricista` cartridge committed, PhotoCapture works, Gemma 4 E2B vision via LiteRT runs on real device, PDF generates and shares to WhatsApp, APK distributed to 3-5 testers via Firebase App Distribution. **Tag `v0.1.0`** |
| **M3** | 5-6 | Plomero + Pintor cartridges | Both cartridges committed with their data files filled by advisors, both flows tested end-to-end, voice annotation working. **Tag `v0.2.0`** |
| **M4** | 7-8 | Onboarding + polish | Trade-selection onboarding, branded PDFs (logo+fiscal data), bug fixes batch 1, 15 testers total (5/trade). **Tag `v0.3.0`** |
| **M5** | 9-10 | Hardening + local telemetry | Local telemetry (SQLite + CSV export), bug fixes batch 2, store assets (icon, screenshots, video, listing copy in es-UY) prepared. **Tag `v0.9.0` (release candidate)** |
| **M6** | 11-12 | Play Store launch | Closed → Open → Production track on Play, GitHub Pages landing live, LinkedIn launch post, 50 real-user installs target. **Tag `v1.0.0`** |
| v1.1 | 13-16 | Backup + refinement | Google Drive backup (OAuth, no backend), 4th trade based on demand, bug fixes |
| v1.2 | 17-22 | Dataset opt-in | PII scrubber, upload pipeline, consent UI, incentive scheme. See §10 |

### 8.1 Per-PR definition-of-done

Every PR must:

- Pass `npm run check` (svelte-check, no errors)
- Pass `npm test` (vitest suite, currently 129 tests)
- Add tests for any new validator or new schema
- Update this `CLAUDE.md` if it changes architecture or principles
- Not introduce new dependencies without `// dep-justification: <reason>` comment in package.json change

## 9. Quality Gates

### 9.1 Performance budgets

These are hard limits. Bench in CI on a reference Android emulator (Pixel 6
profile) before each tagged release:

| Metric | Budget | Rationale |
|---|---|---|
| Cold app start to Home interactive | <2 s | Field use, intermittent attention |
| Photo capture to preview | <500 ms | Daniel: "que sea rápido" |
| Vision diagnosis (1 photo, Gemma 4 E2B, NPU) | <8 s | Mauricio's urgency window |
| PDF generation (5 photos report) | <3 s | Editing flow stays responsive |
| Model download size on first launch | <2 GB | Mid-range Android storage |
| App install size (without model) | <60 MB | Play Store norms |

### 9.2 Test coverage targets

- Cartridge runtime: maintain or improve current coverage (baseline 129 tests)
- Each new validator: minimum 6 fixtures (3 pass, 3 fail), explicit failure messages
- Each new schema: 1 happy-path + 1 schema-rejection test
- Each new screen: 1 vitest + happy-dom render test minimum

### 9.3 Privacy invariants (do not break)

- No network call from the app makes outbound traffic that includes user
  blackboard contents until the user has completed a "share" or (v1.2)
  "contribute to dataset" action.
- The model download URL and the cartridge data refresh URL are the **only**
  outbound calls allowed at app start, and both go to publicly cacheable
  static resources.
- Telemetry is local-only until v1.2.

## 10. Dataset Strategy (v1.2 — design now, build later)

**Do not implement in MVP.** This section exists so we design the data
schemas and consent flows correctly *now*, even though the upload pipeline
ships months later.

### 10.1 Three consent layers (independent toggles)

1. **Anonymous usage telemetry** — opt-in, default off. Events only, no content.
2. **Dataset contribution** — opt-in per job, default off. Photos (PII-scrubbed
   on-device) + diagnosis + plan + execution trace + validator outcomes.
   Excludes client identity, client address, monetary amounts (those go in
   aggregate-only buckets).
3. **Public case study** — opt-in per job, requires client consent too. For
   marketing/portfolio.

### 10.2 PII scrubber (v1.2 component, design today)

On-device pipeline before any upload:
- Face detection + blur (MediaPipe Face Detector, ~5MB)
- OCR text-in-image + redact numbers/addresses (Gemma 4 vision)
- User reviews scrubbed output before upload — full veto

### 10.3 Server stack (v1.2)

- Cloudflare R2 + Cloudflare Worker for upload endpoint (target $0–20/mo)
- Neon Postgres (free tier) for consent log + metadata
- Two buckets: `raw/` (admin only), `curated/` (public via HuggingFace Datasets)
- Token-based auth, no user accounts (token issued per upload session)

### 10.4 Incentive scheme (decision pending, options in priority order)

1. **App credits**: N contributed jobs → 1 month premium / N watermark-free PDFs
2. **Co-op fund**: revenue-share when dataset is licensed; needs legal entity
3. **Direct payment per accepted job**: simple, scales poorly, sweetener for first 50

Start with #1 in v1.2, plan #2 for v2.0 with 500+ users.

## 11. Generic-Runtime Strategy

The trade-app is the first vertical. The runtime must stay reusable for the
next ones (vet móvil, inspectores de obra, auditoría energética, Histora field
service, etc.).

### 11.1 Don't extract packages prematurely

Until v1.0 ships and the second vertical starts, **keep the monorepo flat**.
Premature monorepo extraction adds tooling burden without proven need.

### 11.2 Code respecting the abstractions, even in monolith

Even though we are not extracting `packages/trade-shell/`, `packages/capture-kit/`,
`packages/report-kit/` yet, write code as if those boundaries existed:

- `mobile/src/lib/providers/` — already separated (§4.3)
- `mobile/src/lib/cartridge/` — already separated (do not let UI code leak in)
- `mobile/src/lib/report/` — keep PDF / share / template logic together
- `mobile/src/lib/capture/` — keep camera / voice / geo / scrubber logic together
- `mobile/src/components/` — split: `shell/` (universal) vs `cartridge/` (any
  cartridge-specific component goes here, but ideally none exist)

### 11.3 The "second-vertical readiness" test

After v1.0 ships, when an opportunity for a second vertical appears (e.g.,
Histora field service), measure: how long does it take to produce a working
prototype using only `cartridges/<new-vertical>/`, no app code changes?

- **Target**: <2 weeks for a working prototype, <6 weeks for production.
- If it takes longer, the abstractions leaked. Refactor before adding the
  next vertical.

## 12. Guardrails for Claude Code (escalation triggers)

When working on this repo, Claude Code should **stop and ask Matias** before:

- Adding any backend dependency, server, or external API the app calls at
  runtime (other than the model download CDN and the cartridge data refresh
  URL).
- Adding a new top-level dependency to `package.json`.
- Bypassing the cartridge model (writing trade-specific logic in app code).
- Bypassing the schema-driven UI (hand-coding a form for a specific cartridge).
- Bypassing the provider interfaces (importing Capacitor APIs in shell or
  runtime code).
- Calling cloud LLMs by default for any flow.
- Touching the dataset/upload pipeline before v1.2 is greenlit.
- Adding iOS-specific code before M12.
- Making any design choice that affects the privacy invariants in §9.3.
- Extracting packages / restructuring the monorepo.
- Changing this CLAUDE.md substantively (typos and clarifications are fine).

When in doubt: ship narrower, escalate sooner. The cost of a 5-minute
clarification is much lower than the cost of unwinding a coupled architecture.

## 13. Decision Log (do not re-litigate)

These decisions are closed. Reopen only with new evidence:

| Decision | Date | Rationale (short) |
|---|---|---|
| Mobile-first, on-device | 2026-04 | Frontier opened with Gemma 4; cartridges differentiate |
| Three trades, not one | 2026-04 | Stress-tests genericity; covers three validation regimes |
| Android-only MVP | 2026-04 | LiteRT plugin ready, ~85% LatAm trade users on Android |
| No backend in MVP | 2026-04 | PDF + WhatsApp share = full delivery loop, zero infra cost |
| No iOS until M12+ | 2026-04 | LiteRT iOS not ready; wllama-only would underdeliver |
| Cartridge-driven everything | 2026-04 | The "second vertical readiness" test is a real product requirement |
| Dataset pipeline = v1.2 | 2026-04 | Need usage volume + scrubber maturity before turning it on |
| Apache 2.0 for runtime | inherited | OK for moat (the moat is in the cartridges + data, not the runtime) |
| Cartridges potentially dual-licensed | 2026-04 | Open core for skeletons, AGPL+commercial for audited regulated cartridges (decision deferred until first commercial inquiry) |
| **Cartridge v2 model authorized** | **2026-04-29** | **Pure-markdown cartridges + shared TS tool library + two modes (define on cloud big-model, use on-device small-model). v1 (pipeline + per-cartridge Python validators) is POC and supersedes upon mobile/ migration. The differentiator shifts from per-cartridge validators to a shared library audited once. New cartridges no longer require an engineer per trade. Reference implementation in `cartridge-v2/`. Migration plan in `cartridge-v2/MIGRATION_PLAN.md`. See §16.** |

## 14. Open Questions (need Matias' input before coding)

| # | Question | Blocks |
|---|---|---|
| Q1 | Final app name (currently "SkillOS" in `capacitor.config.ts`) — needs a consumer-friendly name in es-UY tested with advisors | M1 |
| Q2 | Naming convention for cartridge data refresh URLs (own domain? GitHub Pages? Subdomain per trade?) | M3 |
| Q3 | Branded PDF template — minimum data captured at onboarding (logo, business name, RUT, matriculation status, contact info)? | M2 (footer of first PDF) |
| Q4 | Disclaimer copy for non-matriculated electricista users — PDF footer and legal review needed | M2 |
| Q5 | Pricing model decision: free + watermark vs paid premium vs co-op? Mauricio anchored at $500 UYU/mo (~$12) | M5 |
| Q6 | Provisional patent filing window: cartridge-with-deterministic-validator + trade-journey-with-corpus-capture + dual-mode dataset generation. File before public Play Store launch? | M5 |

## 15. How to use this document

**Claude Code**: read this file completely at the start of every session. If
you are about to do something that any section forbids or that requires
escalation per §12, stop and ask. Cite section numbers in commit messages
when a decision implements a rule from this guide
(e.g., `feat: add ShareProvider interface (impl §4.3)`).

**Matias**: this file is the contract between the long-term strategy
(established across April 2026 conversations) and day-to-day execution. When
strategy changes, update this file *first*, then the code. When code drifts
from this file, the file wins by default — escalate if you disagree.

**Future contributors**: read §1-§4 to understand *why*; read §16 for the
v2 cartridge model (the architecture forward); read §6-§8 for v1 historical
context only; read §12-§13 to know *what is already decided*.

---

## 16. Cartridge v2 (architecture forward)

> **Status (2026-04-29)**: design + reference implementation in
> `cartridge-v2/`. Mobile/ migration pending — see `cartridge-v2/MIGRATION_PLAN.md`.

### 16.1 The pivot

A v1 cartridge is a directory of code: `cartridge.yaml` manifest, agent
prompts, JSON schemas, **per-cartridge Python validators** (`compliance_checker.py`,
`repair_safety.py`), declarative flows. An engineer is required to ship one.

A v2 cartridge is a **hierarchical tree of pure markdown**, plus optional
`data/*.json` for bulk reference data. The cartridge encodes domain *knowledge*;
the cartridge does **not** encode domain *rules*. Rules live in a single
**shared TS tool library** (`cartridge-v2/tool-library/`) audited once and
reused across every cartridge.

A new cartridge can therefore be authored by a domain expert + a cloud LLM
in one session ("define mode", `cartridge-v2/runtime/define-mode.md`) without
an engineer; an on-device small model (Gemma 4 E2B target) walks it and calls
library tools at runtime ("use mode", `cartridge-v2/runtime/use-mode.md`).

The deterministic-validator moat doesn't disappear — it relocates from
per-cartridge Python into a shared, generic, audit-once TS library. **Same
moat, more leverageable.**

### 16.2 Key v2 files (under `cartridge-v2/`)

- `README.md` — full architecture
- `runtime/define-mode.md` — cloud-LLM cartridge author spec
- `runtime/use-mode.md` — on-device navigator + tool-caller spec
- `tool-library/` — shared TS determinism layer:
  - `electrical.ts` (ports v1 `compliance_checker.py` IEC 60364 rules)
  - `plumbing.ts`, `painting.ts`, `safety.ts`, `units.ts`, `pricing.ts`,
    `pdf.ts`, `share.ts` (stubs until mobile/ wiring), `types.ts`
- `cartridges/electricista/` — canonical pure-markdown cartridge: MANIFEST +
  index + diagnosis leaves + quote/build + report/compose + materials data
- `cartridges/plomero/`, `cartridges/pintor/` — compact v2 cartridges
- `MIGRATION_PLAN.md` — v1 → v2 migration sequence (multi-PR, do not collapse)

### 16.3 Cross-project alignment (memory-as-cartridge)

The v2 cartridge format is **the same shape that skillos / llmunix-dreamos /
skillos_plugin already emit as long-term memory** (frontmatter + cross-links
+ confidence + trigger_goals). The same use-mode navigator walks both
hand-authored trade cartridges and dream-engine memory cartridges. See
`cartridge-v2/cross-project/` for cross-project manifest examples.

This means the runtime is one engine; the cartridges are interchangeable —
authored by a domain expert via define mode, OR generated by the dream engine
from accumulated traces. Same shape, different sources.

### 16.4 What §16 supersedes from earlier sections

- **§4.1** ("Cartridge-driven everything") — the principle stays. The
  *implementation* changes: v2 still puts trade-specific behavior in the
  cartridge, but as pure markdown + tool calls, not Python validators.
- **§6** ("The Three Cartridges (Concrete Specs)") — entirely v1. New work
  goes to `cartridge-v2/cartridges/{electricista,plomero,pintor}/`.
- **§7.1** (provider interfaces, week 2) — still applies to v1; v2 will
  consume the same provider interfaces from its tool library implementations
  during mobile/ wiring.
- **§9.2** test coverage targets — v2 tool library tests are *additional* to
  the existing 129 vitest baseline; cartridge-content tests for v2 are
  walk-replay tests rather than per-cartridge fixture tests.
- **§12** escalation triggers — **still binding**. The v2 pivot itself was
  the escalation. Future bypasses still need authorization.
- **§13** decision log — see new row "Cartridge v2 model authorized
  (2026-04-29)".

### 16.5 What §16 does NOT change

- **§2** (strategic context) — the moat thesis is intact; v2 strengthens it.
- **§3** (vertical decision: oficios, Android-only, no backend) — unchanged.
- **§4.2** (schema-driven UI) — v2 uses MANIFEST.md frontmatter + cartridge
  prose to drive UI; the principle is the same, the vehicle is different.
- **§4.3** (provider-agnostic data layer) — v2 tool library implementations
  call through the same provider interfaces.
- **§4.4** (on-device first) — v2 *strengthens* this: define mode runs on
  cloud, use mode runs on device; the architectural separation is now
  explicit, not implicit.
- **§9.3** (privacy invariants) — unchanged. v2 tool library has no
  `network.*` tools in v1.0.
- **§10** (dataset strategy v1.2) — unchanged. v2 nav traces feed the same
  consent-gated pipeline.

### 16.6 Migration sequence (high level)

See `cartridge-v2/MIGRATION_PLAN.md` for the full PR-by-PR plan. Summary:

1. **Build shared tool library to v1 parity** — port `compliance_checker.py`
   and `repair_safety.py` rules to TS, with parity tests against v1 fixtures.
2. **Author v2 trade cartridges** (electricista canonical; plomero/pintor
   compact) — done in `cartridge-v2/cartridges/`.
3. **Build v2 registry + runner in mobile/** — alongside (not replacing) v1
   registry. Dual-load both. Adapter that exposes v2 cartridges as
   v1-shaped CartridgeManifest for UI components during transition.
4. **Make UI components dual-aware** — TradeBanner, HomeScreen, Onboarding,
   TradeChip read from either v1 or v2 active-cartridge. Style tokens come
   from MANIFEST locale/ui equivalent.
5. **Dogfood v2 cartridges in production scenarios** with 3-5 testers
   (M2 cohort). Verify parity for every v1 intervention scenario.
6. **Switch default cartridge resolver to v2** behind a feature flag.
   Promote to default when stable.
7. **Archive v1**: move `cartridges/` → `cartridges-v1-archive/`. Drop v1
   registry+runner code paths. Tag release.

This is **multiple PRs** (estimated 6-10), not one. Squash-merging the
sequence into one PR would couple the migration risk and is forbidden.

### 16.7 Why v1 stays on disk during transition

`mobile/src/lib/cartridge/registry.ts` hardcodes `cartridges/` as the scan
root and `cartridge.yaml` as the manifest filename. 25+ Svelte components
import `CartridgeManifest` (v1 shape). Until those are dual-aware,
removing v1 cartridges from disk catastrophically breaks the build. The
migration plan accommodates this; do not try to short-circuit it.

---

*Last updated: 2026-04-29. Source-of-truth conversation: Matias Molinas
strategy session (Apr 2026), preserved in chat history under "skillos_mini
trade-app vertical". Cartridge v2 architecture added 2026-04-29 — see §16.*


