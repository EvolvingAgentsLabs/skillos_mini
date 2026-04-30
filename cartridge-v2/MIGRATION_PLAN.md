# v1 → v2 Cartridge Migration Plan

> **Why this is a multi-PR sequence, not a single commit**: v1 cartridges
> are wired into ~3000 lines of mobile/ runtime code (`registry.ts`,
> `runner.ts`, `validators_builtin.ts`, `types.ts`) and 25+ Svelte
> components. Squash-migrating breaks the app. The plan below stages the
> transition so each PR is reversible and the app stays functional through
> the whole sequence.
>
> **Authorization**: this plan is the *plan*. Each step below requires its
> own PR review per skillos_mini/CLAUDE.md §12.

---

## 0. Current state (verified 2026-04-29)

### 0.1 What's already done (this commit)

- `cartridge-v2/` directory created
- v2 architecture spec (`cartridge-v2/README.md`)
- Define-mode + use-mode runtime specs
- Shared TS tool library: `electrical.ts` (parity-port of v1
  `compliance_checker.py`), `plumbing.ts`, `painting.ts`, `safety.ts`,
  `units.ts`, `pricing.ts`, `pdf.ts` (stub), `share.ts` (stub), `types.ts`
- Three v2 cartridges in pure markdown: `electricista` (canonical, ~10 files),
  `plomero` (compact), `pintor` (compact)
- Cross-project memory-as-cartridge examples in `cartridge-v2/cross-project/`
- skillos_mini/CLAUDE.md updated: §16 (Cartridge v2), §6 marked v1-POC,
  §13 decision log row added

### 0.2 What is still wired to v1 in mobile/

```
mobile/src/lib/cartridge/
├── blackboard.ts                 (107 lines)  v1 blackboard model
├── blackboard_chat_adapter.ts    (247 lines)  v1 blackboard ↔ chat
├── registry.ts                   (440 lines)  scans cartridges/<id>/cartridge.yaml
├── registry_mutations.ts         (232 lines)  CRUD on v1 cartridges
├── routing.ts                    ( 94 lines)  intent → agent routing (v1)
├── runner.ts                     (991 lines)  pipeline executor (the heaviest one)
├── scaffold.ts                   (116 lines)  CartridgeWizard scaffolding (v1 shape)
├── types.ts                      (182 lines)  CartridgeManifest + dependents
├── validators.ts                 ( 67 lines)  schema validator factory
└── validators_builtin.ts         (621 lines)  TS port of v1 Python validators
                                                 — IEC rules already in TS!

mobile/src/components/
  ~25 Svelte components import CartridgeRegistry, CartridgeManifest,
  CartridgeUIAction (theme tokens, primary_action, hooks).

mobile/src/lib/{evals,llm,memory,report}/
  All consume v1 CartridgeManifest in some way.
```

### 0.3 Key insight: v1's validators_builtin.ts is *already TS*

When v1 was authored, the rules were ported from Python (`compliance_checker.py`)
into TypeScript (`validators_builtin.ts`, 621 lines). So the actual rule
logic is already TS — what's "per-cartridge" is the *keying* (one builtin
function per JSON schema filename). The v2 `tool-library/electrical.ts`
re-organizes the same logic as a shared, signature-typed library.

**Implication**: the rule-porting work is mostly *re-organization*, not
re-implementation. Parity tests are the audit gate.

---

## 1. Migration steps (PR-by-PR)

Each step lists: scope, files touched, parity gates, reversibility, est. effort.

### Step 1 — Tool-library parity port

**Scope**: ensure every rule in `validators_builtin.ts` exists in the
shared `tool-library/` with identical input/output behavior.

**Files touched** (skillos_mini/cartridge-v2/tool-library/):
- `electrical.ts` (extend if any v1 rule is missing)
- `plumbing.ts` (compact today; expand to full v1 parity)
- `painting.ts` (compact today; expand to full v1 parity)
- New: `tool-library/__tests__/parity.spec.ts` — table of
  `(input, v1_output, v2_output)` triples; assert v1 == v2.

**Reference for parity**: `mobile/src/lib/cartridge/validators_builtin.ts`
(621 lines). Each function in there maps to a tool in the new library.

**Parity gates**:
- 100% of v1 fixtures (in `mobile/src/lib/cartridge/__tests__/` or
  `mobile/__tests__/`) replayed against v2 tools must match outputs.
- New: minimum 6 fixtures per regulatory tool (3 pass, 3 fail) per CLAUDE.md §9.2.
- `npm run check` + `npm test` green.

**Reversibility**: trivial — pure additive. Tool library compiles
independent of mobile/ wiring.

**Estimated effort**: 1-2 days.

### Step 2 — Author / refine v2 trade cartridges

**Scope**: bring `cartridges/electricista/`, `cartridges/plomero/`,
`cartridges/pintor/` (in `cartridge-v2/`) up to operational completeness.
Today they are reference shapes; production-ready cartridges need:

- Every problem code from v1 `cartridges/trade-electricista/data/problem_codes.md`
  has a corresponding `cartridges/electricista/diagnosis/<code>.md` leaf.
- Plomero: full diagnosis sub-tree (urgencia + obra), full quote sub-tree.
- Pintor: full walkthrough + execution + portfolio sub-trees.
- Every cartridge has its own `data/*.json` populated with the same
  material/labor data v1 ships with.

**Files touched**: `cartridge-v2/cartridges/{id}/**/*.{md,json}`.

**Reversibility**: trivial — additive markdown.

**Estimated effort**: 2-3 days, mostly content authoring. Could be
delegated to define-mode (cloud LLM + a real electrician/plomero/pintor
reviewer). This validates define-mode itself.

### Step 3 — Build v2 registry + runner in mobile/, side-by-side with v1

**Scope**: create `mobile/src/lib/cartridge-v2/` with:

- `registry.ts` — scans `cartridge-v2/cartridges/<id>/MANIFEST.md` (NOT
  `cartridge.yaml`). Returns a new `CartridgeManifestV2` type.
- `runner.ts` — implements the use-mode navigator from
  `cartridge-v2/runtime/use-mode.md`. Walks markdown tree, parses
  tool-call blocks, invokes tools from `tool-library/`, accumulates
  tool-result blocks.
- `nav_trace.ts` — emits the session trace per use-mode §7.
- `tool_invoker.ts` — bridges navigator to the static tool library.
- `frontmatter_index.ts` — phase 0 frontmatter scan.

**Files touched**:
- New `mobile/src/lib/cartridge-v2/` directory.
- New `mobile/src/lib/tool-library/` directory — compiled copy of
  `cartridge-v2/tool-library/` (or symlinked / build-step copied).
- No changes to `mobile/src/lib/cartridge/` (v1 untouched).
- No changes to UI components yet.

**Parity gates**:
- v2 runner can load the v2 electricista cartridge.
- v2 runner can produce the same diagnosis / quote / report content as v1
  runner, given the same photos + user task. (Vitest harness:
  `__tests__/parity_runner.spec.ts`.)
- npm run check + npm test green.

**Reversibility**: trivial — additive code, never imported from existing
modules unless explicitly opted in.

**Estimated effort**: 1-2 weeks. The runner is the main work — porting the
use-mode spec to executable TS with vitest coverage.

### Step 4 — Compatibility adapter (v2 → v1 manifest shape)

**Scope**: a small adapter so existing UI components can consume v2
cartridges as if they were v1 manifests, during the transition.

**Files touched**:
- New `mobile/src/lib/cartridge-v2/compat_adapter.ts` — converts a
  `CartridgeManifestV2` into a synthetic `CartridgeManifest` with
  `ui.brand_color`, `ui.primary_action`, `entry_intents`, etc.
- `mobile/src/lib/cartridge-v2/registry.ts` — exposes both `CartridgeManifestV2`
  and the adapted `CartridgeManifest` shape.

**Why**: TradeBanner, HomeScreen, Onboarding, TradeChip read
`CartridgeManifest.ui` for theme tokens and primary_action. We can either
(a) make every component dual-aware (lots of churn), or (b) adapter once,
all components stay v1-shaped. Option (b) ships faster; option (a) is
cleaner long-term but step-7 (drop v1) gives us option (a) anyway.

**Reversibility**: trivial — adapter is one file, removable.

**Estimated effort**: 2-3 days.

### Step 5 — Wire pdf/share tool implementations

**Scope**: replace the stubs in `cartridge-v2/tool-library/pdf.ts` and
`share.ts` with real implementations using pdfmake and `@capacitor/share`
(per CLAUDE.md §7.5, §7.6).

**Files touched**:
- `cartridge-v2/tool-library/pdf.ts` — real impl
- `cartridge-v2/tool-library/share.ts` — real impl
- Possibly `mobile/src/lib/report/quote_pdf.ts` — refactor to be reused by
  the tool-library impl rather than duplicating template logic.

**Parity gates**:
- v2 cartridge end-to-end walks (electricista intervention) produce a real
  PDF on device.
- Share-to-WhatsApp opens the share sheet with the file attached.
- Visual diff against v1 PDF output is acceptable (template parity, not
  byte-exact).

**Reversibility**: medium — touches existing `mobile/src/lib/report/`. Stash
or revert if visual diff fails.

**Estimated effort**: 3-5 days.

### Step 6 — Dual-load via feature flag

**Scope**: at app start, the cartridge resolver loads BOTH v1 and v2
cartridges. A user setting (or build flag) decides which is *active* by
default. Switching between them is as simple as changing the flag.

**Files touched**:
- `mobile/src/lib/state/active_cartridge.svelte.ts` — extend to track
  active cartridge type (v1 / v2).
- `mobile/src/lib/cartridge/registry.ts` (v1) and
  `mobile/src/lib/cartridge-v2/registry.ts` (v2) — both load on startup.
- One settings UI to toggle.

**Parity gates**:
- An app build with `CARTRIDGE_VERSION=v2` runs v2 cartridges end-to-end.
- An app build with `CARTRIDGE_VERSION=v1` (default for now) runs v1
  cartridges as today.
- All existing tests pass.

**Reversibility**: easy — flip the flag.

**Estimated effort**: 2-3 days.

### Step 7 — Dogfood v2 with M2 testers

**Scope**: ship a build with `CARTRIDGE_VERSION=v2` to the 3-5 testers from
M2 (CLAUDE.md §8). Run real intervention scenarios. Compare output PDFs and
walk traces against v1 output for the same scenarios.

**Files touched**: typically none in code; bug fixes in v2 cartridges or
tool library as issues surface.

**Parity gates**:
- ≥ 90% of test scenarios produce equivalent output (PDFs visually similar,
  diagnosis and quote lines line up).
- No safety regression: every v1 `verdict: fail` continues to be a v2
  `verdict: fail` (high confidence — the rules are the same, just relocated).
- Tester subjective feedback: walk feels at least as fast as v1 pipeline.

**Reversibility**: rebuild with `CARTRIDGE_VERSION=v1` if v2 underperforms.

**Estimated effort**: 1-2 weeks of in-field testing + iteration.

### Step 8 — Switch default to v2

**Scope**: flip `CARTRIDGE_VERSION` default to v2. v1 still loadable for
compatibility with existing user data (in case any user has v1 work in flight).

**Files touched**:
- One config file change (the default flag).
- Release notes / store listing update.

**Reversibility**: medium — the build with v2-default is shipped. Rollback
requires a new build. Hold a hotfix branch ready.

**Estimated effort**: 1 day for the change; hold for ~2 weeks of production
traffic before declaring stable.

### Step 9 — Drop v1 code paths

**Scope**: only after Step 8 has been stable in production for 2+ weeks
(zero v1 fallback events in telemetry):

- Remove `mobile/src/lib/cartridge/` (v1 runtime — ~3000 lines).
- Rename `mobile/src/lib/cartridge-v2/` → `mobile/src/lib/cartridge/`.
- Update all imports: `$lib/cartridge-v2/...` → `$lib/cartridge/...`.
- Move `cartridges/` → `cartridges-v1-archive/` at repo root.
- Move `cartridge-v2/cartridges/` → `cartridges/` at repo root.
- Update `cartridge-v2/` README and any cross-references.
- Drop the compatibility adapter (`compat_adapter.ts`) — components are now
  natively v2.
- Refactor UI components that previously read v1 `manifest.ui` to read v2
  MANIFEST frontmatter directly.

**Files touched**: large — but mechanical (find/replace + delete). Vitest
coverage from Steps 1-3 is the safety net.

**Parity gates**:
- `npm run check` + `npm test` green.
- Manual smoke test of all five screens (CLAUDE.md §5).
- Production telemetry shows no errors after deploy.

**Reversibility**: hard. v1 code paths are gone. The pre-Step-9 build is
the rollback artifact. Do not skip the 2-week stability soak.

**Estimated effort**: 3-5 days for the mechanical part; 2-week soak required
before merge.

---

## 2. Parallel work (does not block migration)

The following can land independently of the migration sequence:

- **Define-mode implementation**: build a CLI / Claude Code skill that runs
  the define-mode prompt against a domain expert interview transcript and
  emits a v2 cartridge directory. Tests itself by reproducing the
  electricista cartridge from a synthetic interview.
- **Memory-cartridge runtime in skillos / llmunix-dreamos**: a slash command
  that walks a memory cartridge (`cartridge-v2/cross-project/examples/skillos-self-knowledge.cartridge.md`).
  This lives in those repos, not in skillos_mini.
- **Cross-cartridge composition**: a tool `cartridge.subwalk(cartridge_id, query)`
  that lets one cartridge invoke another as a knowledge tool. Useful when a
  trade cartridge wants advisory knowledge from a memory cartridge. Plan
  this for v2.1.

---

## 3. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| v2 navigator latency on Gemma 4 exceeds CLAUDE.md §9.1 budgets | medium | Step 7 dogfooding catches this; fallback is v1 via flag. Early signal: vitest harness with mocked Gemma4 latency. |
| Tool-library parity gap missed in tests | medium | Step 1 parity tests are exhaustive against v1 fixtures + new fixtures (6 per tool). Block step 3 until parity is 100%. |
| UI components break on v2 manifest shape | high | Compat adapter (Step 4) avoids touching components until Step 9. By then they have 2+ months of v2 traces to inform refactors. |
| v2 cartridge content quality regression vs v1 | medium-high | The v2 cartridges in this commit are reference, not production. Step 2 closes the gap. Define-mode + reviewer interview is the production-quality path. |
| Define-mode produces unsafe cartridges | high if unmanaged | Mandatory human review before install (per cartridge-v2/runtime/define-mode.md §7). Cartridge signing in v1.1 closes the loop further. |
| Migration sequence stalls and v1+v2 coexist long-term | medium | Set Step 8 deadline. If 2+ months from start, escalate. Dual-runtime is a maintenance tax. |
| Dataset pipeline (v1.2) gets coupled to v1 cartridge format | low | The v1.2 pipeline (CLAUDE.md §10) is designed today against v2 traces. Avoid hardcoding v1-shape. |

---

## 4. Estimated total effort

- Step 1: 1-2 days (tool library parity + tests)
- Step 2: 2-3 days (cartridge content authoring) — can parallelize with Step 1
- Step 3: 1-2 weeks (v2 registry + runner in mobile/) — biggest piece
- Step 4: 2-3 days (compat adapter)
- Step 5: 3-5 days (pdf/share real impls)
- Step 6: 2-3 days (feature flag)
- Step 7: 1-2 weeks (dogfooding) — calendar time, not engineering time
- Step 8: 1 day + 2-week soak
- Step 9: 3-5 days + 2-week soak (already counted above)

**Calendar estimate**: 2 months from Step 1 start to Step 9 merge,
assuming sequential PRs and no major issues in dogfooding.

**Engineering effort (hands-on)**: ~25-35 person-days.

---

## 5. Decision points where Matias is required

- **After Step 1**: confirm parity test results before proceeding to Step 3.
- **After Step 2**: confirm v2 cartridge content quality before dogfooding.
- **Before Step 6**: confirm rollout strategy (feature flag default,
  initial cohort).
- **Before Step 8**: confirm production cutover timing.
- **Before Step 9**: confirm soak period passed clean and v1 rollback is
  no longer needed.

---

## 6. What this migration does NOT do

- Touch the dataset pipeline (v1.2 — out of MVP per CLAUDE.md §3.3, §10).
- Add network calls to the tool library (CLAUDE.md §9.3 invariant).
- Change the five-screen UI shell structure (CLAUDE.md §5).
- Add iOS support (CLAUDE.md §3.2 — v1.0 is Android-only).
- Add a backend (CLAUDE.md §3.2 — no backend in MVP).

The migration is *cartridge-shape* and *runtime* only. Strategic
constraints from CLAUDE.md §1-§4 hold.
