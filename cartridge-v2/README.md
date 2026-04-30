# skillos_mini — Cartridge v2

> **Status**: design + reference implementation. v1 cartridges in `skillos_mini/cartridges/` were a POC and remain on disk as a reference (the rules they encode are being ported, not deleted). v2 is the architecture going forward.
>
> **Authorization**: this re-architecture is the strategic redirect captured in this conversation (2026-04-29). It supersedes skillos_mini/CLAUDE.md §6 (the v1 three-cartridges concrete spec). The CLAUDE.md decision-log entry will be added in a follow-up edit once you've reviewed the shape.

---

## 1. The pivot in one paragraph

A v1 cartridge is a directory of code: `cartridge.yaml` manifest, `agents/*.md` prompts, `schemas/*.schema.json`, `validators/*.py`, `flows/*.flow.md`, `data/*.{md,json}`. An engineer is required to ship one. A v2 cartridge is a **hierarchical tree of pure markdown**, plus optional `data/*.json` for bulk reference data. The cartridge encodes domain *knowledge*; the cartridge does **not** encode domain *rules*. Rules live in a single shared **JS tool library** that ships with the runtime and is reused across every cartridge. A new cartridge can therefore be authored by a domain expert + a cloud LLM in one session ("define mode") without an engineer; an on-device small model walks it and calls library tools at runtime ("use mode"). The deterministic-validator moat doesn't disappear — it relocates from per-cartridge Python/TS into a shared, generic, audit-once TS library.

---

## 2. Two modes

### 2.1 Define mode (cloud, big model)

A domain expert sits with a big cloud LLM (Claude Opus / Gemini Pro). They describe their trade in prose:

> "I'm an electrician in Uruguay. When I show up to a residential job, I take photos of the panel, ID the problem, write a quote in UYU, do the work, and hand the client a PDF. The big risks I check for are: undersized wire for the breaker, RCD missing in wet rooms, broken insulation, overloaded outlets..."

The cloud LLM, given:

- The domain description (above)
- The **`runtime/define-mode.md` spec** (this repo)
- The **`tool-library/README.md` index** of available tools
- Optionally: a previous v2 cartridge as a few-shot exemplar (electricista is the canonical one)

...produces a directory of pure markdown matching the v2 cartridge format spec. No JSON schemas, no Python validators. Every place where a deterministic rule applies, the cartridge embeds a `tool-call` block referencing a tool in the shared library. If a needed tool doesn't exist, the cartridge declares it as an `unmet_tool_request` — a signal to the runtime maintainer that the library should grow.

### 2.2 Use mode (on-device, small model)

A small on-device LLM (target: Gemma 4 E2B via LiteRT-LM on Snapdragon NPU) runs a generic **navigator** (`runtime/use-mode.md`). The navigator:

1. Loads a cartridge's `MANIFEST.md` and `index.md`
2. Routes the user's task to the right entry point in the cartridge tree
3. Walks the markdown — reading docs, extracting facts, following links — until it has enough
4. **Whenever it encounters a `tool-call` block, it stops, invokes the JS tool from the shared library with the declared args, and treats the deterministic result as ground truth** (the LLM never overrides it)
5. Composes the final artifact (a PDF quote, a client report, etc.) by calling tool-library helpers (`pdf.render`, `share.toWhatsApp`, etc.)

The small model is responsible for *language, judgment, narrative*. The library is responsible for *math, lookups, format compliance, regulatory rules*. The cartridge is the script that wires them together.

---

## 3. The two-mode invariant

```
  define mode               use mode
  ───────────                ──────────
  domain expert      ╔════════════════╗   on-device user
        +            ║   v2 cartridge ║         ↓
  cloud LLM          ║  (pure markdown ║   small LLM (Gemma 4)
       ↓             ║   + data.json) ║         ↓
   produces ────────►║                ║◄─── walks + invokes
                     ╚════════════════╝             ↓
                            ↑↓                shared JS tool library
                     calls into shared        (units, pricing, electrical,
                     tool library library      plumbing, painting, pdf,
                     for tool inventory        share, photo, safety...)
```

**The cartridge is the only artifact that crosses the mode boundary.** It's authored in the cloud and consumed on the device. Both modes share the same tool-library inventory by construction — the define-mode LLM only references tools that exist; the use-mode runtime only invokes those tools. This is the contract that makes regulated trades safe: the cartridge can lie in prose, but a `tool-call` to `electrical.checkWireGauge` always returns the IEC 60364 truth.

---

## 4. Why this is more powerful than v1

| Concern | v1 (pipeline + per-cartridge validators) | v2 (markdown + shared library) |
|---|---|---|
| Authoring a new trade | Engineer writes Python validators, JSON schemas, agent prompts, cartridge.yaml. Weeks of work. | Domain expert + cloud LLM produces markdown in one session. Engineer reviews/extends the shared library only if a needed tool is missing. |
| Updating a rule (e.g., new IEC norm) | Edit one cartridge's validator. Other cartridges with similar rules drift. | Edit one tool in the shared library. Every cartridge that calls it is updated by construction. |
| Reusing a rule across trades | Copy-paste validator code. | Already shared — `units.formatCurrency` is one function. |
| Cartridge testability | Per-cartridge Python tests. | Library tests cover all rules; cartridge tests cover the markdown-walk path. |
| What the small model decides | Implicit — the prompt has all the rules and might violate them. | Bounded — the small model picks branches and writes prose; rules are tool calls it cannot bypass. |
| Distribution | Bundled per-cartridge code in the APK. | Cartridges are pure-text downloads (small, cacheable, refreshable from GitHub Pages). Library updates ship in app updates. |
| Audit surface | Audit N validator files per cartridge. | Audit one library. Cartridge content is reviewable as prose. |
| Domain expert can read the cartridge | No — Python/JSON. | Yes — prose with structured tool calls. The cartridge IS the documentation. |

---

## 5. The tool library is the moat

skillos_mini/CLAUDE.md §2 stated the v1 differentiator as "sealed per-domain bundles with deterministic Python/TS validators." That moat survives the pivot — it just moves location:

- **v1 moat**: per-cartridge `validators/*.py`. Each cartridge ships its own audit-required code. New trades need new validators.
- **v2 moat**: one **shared TS tool library**, audited once, reused across every cartridge — including cartridges authored by third parties (a vet, a building inspector, a field technician). The cartridge is replaceable; the library is durable.

The library is the IP. It contains:

- IEC 60364 electrical compliance logic (wire gauge tables, RCD requirements, breaker margins)
- Plumbing standards (drain slope, pressure ratings, fixture sizing)
- Painting standards (drying times, coverage, surface prep checks)
- Currency, units, tax rules per region
- PDF rendering with regulatory footers
- Photo metadata (EXIF, geo, scrubber)
- Safety hazard scoring

Future regulated verticals (vet móvil, edilicio, auditoría energética) extend the library in their own modules without forking the runtime. The runtime + library is a platform; cartridges are apps.

---

## 6. Cartridge format: pure markdown

A v2 cartridge is a directory:

```
cartridges/<name>/
├── MANIFEST.md          # frontmatter + cartridge metadata + tool requirements
├── index.md             # entry point — first doc the navigator reads
├── <stage1>/            # e.g., diagnosis, walkthrough
│   ├── index.md         # sub-tree entry
│   └── *.md             # leaves with tool-call annotations
├── <stage2>/            # e.g., quote, planning
│   └── ...
├── <stage3>/            # e.g., report, share
│   └── ...
└── data/                # optional bulk reference data
    └── *.json
```

Key rules:

1. **Every `.md` file has YAML frontmatter** with at minimum: `id`, `title`, `purpose`. Other useful fields: `entry_intents`, `prerequisites`, `produces`, `next_candidates`, `tools_required`, `tools_optional`, `confidence`.
2. **Cross-references between docs use the `id`**, not the path. The navigator builds a frontmatter index at session start (cheap — frontmatter only) and resolves ids at link time. This makes the cartridge resilient to reorganization.
3. **Wherever a deterministic rule applies, embed a `tool-call` block.** The navigator sees this block, halts the LLM, invokes the tool, and inserts a `tool-result` block immediately after. The result is treated as ground truth.
4. **The `tool-call` block is YAML**:
   ````
   ```tool-call
   tool: <library>.<function>
   args:
     <key>: <value>
   ```
   ````
5. **No JSON schemas, no per-cartridge validators, no `cartridge.yaml`**. All structure is in MANIFEST.md frontmatter.
6. **Bulk reference data** (price lists, materials, brand catalogs) lives in `data/*.json`. Tools read these via the cartridge-data interface (see §7 of `tool-library/README.md`). Markdown stays pure-prose; data stays structured.

See `cartridges/electricista/` for the canonical example.

---

## 7. Tool-call annotation in markdown — example

A leaf doc in the electricista cartridge for the case "wire is undersized for the breaker":

````markdown
---
id: cable_subdimensionado
title: Cable subdimensionado para el breaker
purpose: Diagnose undersized wire for the installed breaker; quantify hazard.
entry_intents:
  - cable que se calienta
  - tomacorrientes con marcas de quemado
prerequisites: [photo_of_panel, photo_of_outlet]
produces: [diagnosis_entry]
next_candidates: [quote/build, sin_rcd_ambiente_humedo]
tools_required: [electrical.checkWireGauge, safety.classify]
confidence: 0.92
---

# Cable subdimensionado

Cuando la sección del cable es menor a la requerida para el breaker instalado,
el cable se sobrecalienta progresivamente bajo carga. Es una de las causas
más frecuentes de incendios eléctricos residenciales en Uruguay.

## Cómo diagnosticarlo desde la foto

1. Identificá el amperaje del breaker que protege el circuito (impreso en la
   carcasa del térmico).
2. Identificá la sección del cable saliente (marcado en el aislante: 1.5mm²,
   2.5mm², 4mm², 6mm², 10mm²).
3. Medí o estimá la longitud del circuito hasta la carga más lejana.
4. Llamá a la herramienta para que compare contra IEC 60364-5-52:

```tool-call
tool: electrical.checkWireGauge
args:
  breaker_amps: 32
  wire_section_mm2: 1.5
  circuit_length_m: 12
  ambient_temp_c: 30
```

Si el resultado es `verdict: fail`, marcá el problema con severidad alta y
clasificá el peligro:

```tool-call
tool: safety.classify
args:
  hazard: fire
  evidence: undersized_wire_for_breaker
  proximity_to_combustible: high
```

## Qué incluir en la diagnosis

- Categoría: `cable_subdimensionado`
- Cita la regla violada (la herramienta devuelve la referencia IEC).
- Explicación al cliente: el cable se calienta cuando hay carga porque es
  muy fino para el térmico que tiene puesto. Riesgo de incendio.
- Acción: cambiar a la sección que devuelve la herramienta como mínima
  requerida; o bajar el térmico al amperaje correcto para la sección actual
  (sólo si la carga lo permite — confirmar con `electrical.maxLoadForSection`).
````

When the use-mode navigator processes this leaf:

1. Reads the prose. The small model decides "yes, this matches the user's photos".
2. Hits the first `tool-call` block. Stops. Extracts `tool: electrical.checkWireGauge`, `args: {...}`. The args may be filled in by the model from the photo's EXIF/measurements, or by another tool call earlier in the walk that read the breaker label from the image.
3. Invokes `electrical.checkWireGauge(...)` from the JS library. Gets back `{verdict: "fail", required_min_mm2: 6, reason: "...", ref: "IEC 60364-5-52 Table B.52.4"}`.
4. Inserts a `tool-result` block in the working transcript:
   ````
   ```tool-result
   tool: electrical.checkWireGauge
   verdict: fail
   required_min_mm2: 6
   reason: "1.5mm² insufficient for 32A breaker at 12m; required 6mm²"
   ref: "IEC 60364-5-52 Table B.52.4"
   ```
   ````
5. Continues. The result is now context for the model's prose. The model writes "se requiere recablear el circuito a 6mm² (IEC 60364-5-52 Table B.52.4)". The model didn't compute the gauge — it just narrated the tool's verdict.

The deterministic safety guarantee is end-to-end: the small model never decides what wire size is legal.

---

## 8. MANIFEST.md format

````markdown
---
type: cartridge
version: 2
id: electricista
title: Electricista residencial — Uruguay
language: es-UY
description: >
  Diagnóstico, presupuesto y ejecución de intervenciones eléctricas
  residenciales con cumplimiento IEC 60364 (subset Uruguay).

entry_intents:
  - electricista
  - trabajo eléctrico
  - revisar instalación
  - presupuesto eléctrico
  - falla eléctrica

entry_index: index.md

# Tools the cartridge calls. The runtime verifies all of these exist
# in the shared tool library at load time and refuses to load if any
# are missing — closes the contract gap.
tools_required:
  - electrical.checkWireGauge
  - electrical.checkRCDRequired
  - electrical.maxLoadForSection
  - electrical.computeBreakerMargin
  - electrical.lookupNorm
  - safety.classify
  - units.formatCurrency
  - pricing.lineItemTotal
  - pricing.applyTax
  - pdf.renderQuote
  - pdf.renderReport
  - photo.extractEXIF
  - share.toWhatsApp

tools_optional:
  - photo.scrubPII

# Bulk reference data files this cartridge ships with. Tools read
# them via the cartridge-data interface — see tool-library/README.md §7.
data:
  - data/materials_uy.json
  - data/labor_rates_uy.json

# Region/currency/locale. The runtime passes these to tools that
# need them (units.formatCurrency, pricing.applyTax, etc.).
locale:
  region: UY
  currency: UYU
  tax_rate: 0.22
  voltage_v: 230
  frequency_hz: 50

# Cartridge-level confidence. Higher = the navigator should trust it
# more in disambiguation. Set by the define-mode author or the
# dream engine; updated based on use-mode outcomes over time.
confidence: 0.85

# Set true if this cartridge was generated by define mode (cloud LLM
# from a domain-expert session) rather than hand-curated by an engineer.
generated: true
generated_by: claude-opus-4-7
generated_at: 2026-04-29T15:00:00-03:00
---

# Electricista — cartridge overview

(Free-prose section: high-level orientation for a human reading the
cartridge. The use-mode navigator does NOT need to read this — it
loads frontmatter + index.md only.)
````

The frontmatter is the only structured contract. Everything below it is for humans (and the cloud LLM in define mode reading exemplars).

---

## 9. v1 → v2 migration

### 9.1 What the v1 cartridges contain (today)

`cartridges/trade-electricista/`:

- `cartridge.yaml` — manifest with flows, agents list, validators list, ui block, hooks, locale vars.
- `agents/{vision-diagnoser,quote-builder,report-composer}.md` — prompts that emit JSON via `<produces>` blocks.
- `schemas/*.schema.json` — JSON schemas for the blackboard keys.
- `validators/{compliance_checker,repair_safety}.py` — Python rule checks.
- `flows/{intervention,quote_only}.flow.md` — declarative agent sequences.
- `data/{materials_uy.json, labor_rates_uy.json, problem_codes.md, ute_norms.md}` — reference data.

### 9.2 Where each piece goes in v2

| v1 artifact | v2 destination |
|---|---|
| `cartridge.yaml` (manifest) | `MANIFEST.md` frontmatter |
| `cartridge.yaml` (flows) | The cartridge's tree structure (folder names imply stages); `entry_intents` in MANIFEST.md routes to entries |
| `cartridge.yaml` (ui block) | Stays in mobile app config — UI is runtime, not cartridge content |
| `cartridge.yaml` (locale vars) | `MANIFEST.md` frontmatter `locale:` block |
| `agents/*.md` (prompts) | Dissolved. Prose merges into stage docs. The cartridge has no "agents" — there is one navigator per device, parameterized by the cartridge's tree |
| `schemas/*.schema.json` | Removed. Tool returns and PDF templates carry the structure. The blackboard, when needed, is implicit in tool-result content |
| `validators/*.py` | Ported into `tool-library/<module>.ts` as deterministic functions. The cartridge calls them via `tool-call` blocks |
| `flows/*.flow.md` | Removed. The cartridge tree IS the flow — `index.md` → stage subdirectories → leaves. Branching is done by the navigator at link-resolution time |
| `data/*.json` | Stays as-is in `cartridge/data/*.json` |
| `data/problem_codes.md` (the table) | Dissolved into individual `diagnosis/<code>.md` leaves, one per code |
| `data/ute_norms.md` | Either: a leaf doc in `cartridge/diagnosis/_norms.md` for advisory text, OR (preferred) a tool `electrical.lookupNorm(code)` that returns norm text |

### 9.3 Migration order (proposed, pending approval)

This is the sequence I'd recommend after you sign off on v2:

1. **Build the shared tool library to parity with v1 validators** (port `compliance_checker.py` and `repair_safety.py` into `tool-library/electrical.ts`). Tests for parity: feed the v1 validators and v2 tool the same inputs; outputs must match.
2. **Author the v2 electricista cartridge** (in this repo — already done as the reference example).
3. **Run the v2 cartridge through the same intervention scenarios v1 handles.** Dogfood until the small-model walk + tool calls produce a quote+PDF indistinguishable from v1's pipeline output for representative cases.
4. **Author v2 plomero and pintor cartridges** — same pattern.
5. **Switch mobile app's cartridge resolver** from `cartridges/` (v1) to `cartridge-v2/cartridges/` (v2).
6. **Archive v1.** Move `skillos_mini/cartridges/` → `skillos_mini/cartridges-v1-archive/`. Remove from default mobile imports. Keep in repo for reference.

This is **not** included in this initial v2 landing because:
- (1) is non-trivial (rule porting + parity tests);
- (5) requires retargeting `mobile/src/lib/cartridge/` runtime code;
- These are separate PRs and benefit from being staged.

The v2 directory in this commit is sufficient to:
- Review the architecture
- Run define mode end-to-end (you can hand the README to Claude Opus and produce a 4th cartridge today)
- Prototype use mode in a notebook against the example cartridges

---

## 10. Cross-project alignment (memory-as-cartridge)

The v2 cartridge format is **the same shape that skillos / llmunix-dreamos / skillos_plugin already emit as long-term memory**. Specifically:

- `skillos/system/memory/strategies/level_*/<slug>.md` files have rich frontmatter (`id`, `hierarchy_level`, `title`, `trigger_goals`, `confidence`, cross-links via `strat_L<N>_<slug>`). That is **exactly** the v2 cartridge format with one difference: skillos memory uses `hierarchy_level` while v2 cartridges use directory nesting. They're isomorphic.
- `_negative_constraints.md` (NCs) is structurally identical to a `cartridge/safety/` sub-tree.
- `_dream_journal.md` is the cartridge's changelog.

This means **every dream-engine output is automatically a v2 cartridge**, with one tiny adapter (a generated `MANIFEST.md` pointing at the existing strategies tree). See `cross-project/examples/skillos-self-knowledge.cartridge.md` for the concrete adapter.

The same use-mode navigator (`runtime/use-mode.md`) walks both kinds of cartridges. With one execution model, you get:

- A trade-app on a phone (electricista, plomero, pintor): cartridges authored by domain experts via define mode.
- A self-knowledge interface on a developer's machine: cartridges = the system's own consolidated memory.
- A governance-history interface: cartridges = sysctl audit reports.

Same runtime. Same library. Different cartridges. That's the platform.

---

## 11. What this commit contains

```
skillos_mini/cartridge-v2/
├── README.md                            # this file
├── MIGRATION_PLAN.md                    # v1 → v2 PR-by-PR migration sequence
├── runtime/
│   ├── define-mode.md                   # cloud-LLM cartridge author spec
│   └── use-mode.md                      # on-device navigator+tool-caller spec
├── tool-library/
│   ├── README.md                        # library spec, contract, capability model
│   ├── types.ts                         # shared types (ToolContext, results)
│   ├── electrical.ts                    # IEC 60364 (parity port of v1 compliance_checker)
│   ├── plumbing.ts                      # plumbing rules (slope, diameters, pressure)
│   ├── painting.ts                      # drying times, coverage, surface prep
│   ├── safety.ts                        # generic hazard classification
│   ├── units.ts                         # generic units, currency formatting
│   ├── pricing.ts                       # generic pricing, line items, tax, totals
│   ├── pdf.ts                           # PDF render — STUB, real impl in migration step 5
│   └── share.ts                         # native share — STUB, real impl in migration step 5
└── cartridges/
    ├── electricista/                    # canonical v2 cartridge
    │   ├── MANIFEST.md
    │   ├── index.md
    │   ├── diagnosis/
    │   │   ├── cable_subdimensionado.md
    │   │   └── sin_rcd_ambiente_humedo.md
    │   ├── quote/build.md
    │   ├── report/compose.md
    │   └── data/materials_uy.json
    ├── plomero/                         # compact v2 cartridge
    │   ├── MANIFEST.md
    │   ├── index.md
    │   ├── diagnosis/desague_obstruido.md
    │   └── quote/build.md
    └── pintor/                          # compact v2 cartridge
        ├── MANIFEST.md
        ├── index.md
        ├── walkthrough/measure.md
        └── quote/build.md
```

## 12. What this commit does NOT do

- Touch any v1 cartridge in `skillos_mini/cartridges/` (POC-frozen).
- Touch `skillos_mini/mobile/src/`. The runtime specs in `runtime/` are markdown design docs; integrating them into the Capacitor/Svelte app is the next PR.
- Update `skillos_mini/CLAUDE.md`. That edit is queued for after you review v2 — last attempt was rejected and I want to align wording with your intent.
- Implement the cloud-LLM define-mode harness. The spec describes the prompt + workflow; implementing it as a callable command line is mechanical follow-up.

---

## 13. Open architectural questions

These deserve your input before I extend further:

| # | Question |
|---|---|
| AQ1 | **Tool registry**: should `tool-library/index.ts` enumerate every tool with type signatures (a generated registry), or is the per-module export pattern enough? Auto-generated registry catches typos in cartridge `tools_required:` at load time |
| AQ2 | **Cartridge sandboxing**: should cartridges declare a `capabilities:` block (e.g., needs camera, needs network, needs share) and the runtime enforce capability gates? Today the implicit model is "tools_required is the capability list" |
| AQ3 | **Define-mode trust model**: a cloud LLM authors a cartridge for a regulated trade. Who reviews? Workflow options: (a) human review required before install, (b) automated diff against a known-good baseline cartridge, (c) self-test (cartridge ships with its own use-mode walk transcript that must reproduce). Recommend (a) for v1 and stage (c) for v1.2 |
| AQ4 | **Cartridge updates over the air**: a regulated cartridge gets a rule fix. We push a new cartridge version. Today the data-refresh model exists; should cartridge-text refresh follow the same channel (GitHub Pages JSON manifest), or do regulated cartridges go through Play Store updates only for accountability? |
| AQ5 | **Cartridge signing**: cryptographic signature on the MANIFEST.md so a tampered cartridge fails to load. Critical if cartridges become network-deliverable. Probably v1.1 |
