# Shared JS Tool Library — Spec

> **Position**: this library is the **only place** deterministic rules live in the v2 architecture. v1's per-cartridge `validators/*.py` are ported here and shared across every cartridge. The library is the moat.

---

## 1. What this is

A TypeScript library that ships with the skillos_mini runtime (bundled into the APK or, where appropriate, refreshable from a trusted CDN). It exposes **tools** — pure functions with typed signatures and stable contracts — that cartridges call via `tool-call` blocks in their markdown.

Cartridges declare which tools they need in `MANIFEST.md` (`tools_required:`). The runtime verifies all declared tools exist before loading the cartridge. Tools that don't exist cause cartridge load failure; cartridges cannot reach into the host runtime to bypass.

---

## 2. Why a library, not per-cartridge code

| | Per-cartridge code (v1) | Shared library (v2) |
|---|---|---|
| Audit | N codebases per N cartridges | One codebase, audited once |
| Cross-trade rule reuse | Copy-paste | Import |
| Update propagation | Edit N cartridges | Edit one tool |
| New cartridge cost | Engineer required | Domain expert + cloud LLM |
| Determinism contract | Per-cartridge convention | Library is the contract |
| Safety review | Per cartridge | Per library version |

The library is the durable IP. Cartridges are interchangeable.

---

## 3. Module taxonomy

| Module | Scope | Domain |
|---|---|---|
| `units` | Generic unit conversion, formatting | All trades |
| `pricing` | Currency math, line items, tax, totals | All trades |
| `pdf` | Render PDFs from blackboard data via templates | All trades |
| `share` | Share files via WhatsApp / email / Drive | All trades |
| `photo` | EXIF, geo, dimension extraction, optional PII scrub | All trades |
| `safety` | Hazard classification, severity scoring, escalation triggers | All trades |
| `electrical` | IEC 60364 subset, RCD rules, breaker margins, wire gauge tables | Electricista |
| `plumbing` | Slope, diameter, pressure, fixture sizing | Plomero |
| `painting` | Drying times, coverage rates, surface prep checks | Pintor |
| (future) `vet` | Animal vital signs, drug dosing | Vet móvil |
| (future) `building` | Structural heuristics, code refs | Inspector edilicio |

A new vertical adds a domain-specific module; cross-cutting tools (units, pricing, pdf, share, photo, safety) are reused without modification.

---

## 4. Tool contract

Every tool exported by the library:

1. **Is a pure function** (no global state, no side effects beyond declared capabilities).
2. **Has a stable typed signature** in TypeScript. Cartridges declare args by name; the runtime validates types before invocation.
3. **Returns a structured result** with at minimum: `verdict` (`pass` | `fail` | `warn` | `info`), and either trade-specific fields or a `result` payload.
4. **Cites references**: rules-based tools include a `ref` field pointing to the relevant norm or table (e.g., `"IEC 60364-5-52 Table B.52.4"`). Audit-ability requires this.
5. **Is idempotent**: same args → same result, every time. No randomness, no clock-dependence except for explicitly time-aware tools (`pricing.applyTax` may take a date arg if rates change).
6. **Fails closed**: ambiguous inputs return `verdict: warn` with `ambiguous: true`, never a confident `pass`.
7. **Is documented in this README** and individually with TSDoc comments.

### 4.1 Result shape

A canonical result for a regulatory tool:

```typescript
interface RegulatoryToolResult {
  verdict: 'pass' | 'fail' | 'warn' | 'info';
  reason: string;                  // human-readable, navigator surfaces in prose
  ref: string;                     // norm/table reference
  required?: Record<string, any>;  // what would make it pass
  ambiguous?: boolean;             // if true, navigator should escalate
  severity?: 'low' | 'medium' | 'high';
  evidence?: string;               // what was checked
}
```

A canonical result for a computation tool:

```typescript
interface ComputationToolResult {
  verdict: 'info';
  result: Record<string, any>;     // the computed values
  inputs_normalized: Record<string, any>;  // for audit traceability
}
```

A canonical result for a side-effecting tool (pdf, share):

```typescript
interface ActionToolResult {
  verdict: 'pass' | 'fail';
  uri?: string;                    // file URI or share confirmation
  error?: string;
}
```

---

## 5. Capability model

Some tools have side effects: `pdf.renderQuote` writes a file, `share.toWhatsApp` opens the share sheet, `photo.extractEXIF` reads from the device's media library. These are gated by capabilities the runtime grants per cartridge.

A cartridge declares capabilities implicitly through `tools_required`:

| Tool prefix | Implies capability | Granted on first use? |
|---|---|---|
| `pdf.*` | Filesystem write | Yes (sandbox to cartridge output dir) |
| `share.*` | Native share sheet | User-initiated (button tap) |
| `photo.*` | Camera + media library read | OS permission prompt at install |
| `geo.*` | Location | OS permission prompt at install |
| `network.*` | Outbound HTTP | NEVER without explicit user consent — see §6 |

The runtime maintains an audit log of every tool call: cartridge id, tool name, args, result, timestamp. Local-only by default; uploadable with consent (per CLAUDE.md §10 future v1.2 dataset pipeline).

---

## 6. Privacy + offline-first invariants

Per skillos_mini/CLAUDE.md §9.3 (privacy invariants), the library:

- **Has no `network.*` tools** in v1. Period. The whole architecture is offline-first.
- **`share.toWhatsApp` is not a network call** — it hands off to the OS share sheet. The user controls what happens next.
- **`photo.scrubPII`** runs entirely on-device. No uploads.
- **`pricing.*`** tools never call out to a price API. Bulk price data lives in cartridge `data/*.json`, refreshable through the cartridge-data channel (which IS a network call, but explicitly user-initiated and pulls only static JSON from a known CDN).
- **The library never spawns background tasks.** Every tool call is synchronous to the caller's await.

If a future cartridge needs a network-bound tool (e.g., real-time weather for a painter), it must be added as a separate `network.*` module, gated explicitly by capability, and reviewed against the privacy invariants.

---

## 7. Cartridge-data interface

Tools that need bulk reference data (e.g., `pricing.lineItemTotal` with material lookup) read from the active cartridge's `data/*.json` files. The runtime injects a cartridge-scoped data accessor at tool invocation time:

```typescript
interface CartridgeDataAccessor {
  read<T>(path: string): T;        // throws if not declared in MANIFEST data:
  has(path: string): boolean;
}
```

A tool that needs material price data:

```typescript
export function lineItemTotal(args: {
  material_id: string;
  qty: number;
  unit: string;
}, ctx: ToolContext): ComputationToolResult {
  const materials = ctx.cartridgeData.read<Material[]>('data/materials_uy.json');
  const m = materials.find(x => x.id === args.material_id);
  if (!m) return { verdict: 'info', result: {}, inputs_normalized: { error: 'unknown_material' } };
  return {
    verdict: 'info',
    result: { unit_price: m.price, total: m.price * args.qty, currency: m.currency },
    inputs_normalized: args,
  };
}
```

The cartridge author doesn't have to write data accessor code. They write the JSON file and reference its path in MANIFEST `data:`; the runtime wires it through.

---

## 8. Testing strategy

Per skillos_mini/CLAUDE.md §9.2:

- **Every regulatory tool has minimum 6 fixtures** (3 pass, 3 fail), with explicit failure reasons covering the rule's branch coverage.
- **Every computation tool has happy-path + edge cases** (zero, negative, ambiguous units).
- **Cross-trade tools** (`units.formatCurrency`, `pricing.applyTax`) get tested against multiple locales.
- **Library tests run in vitest in CI** alongside the rest of the mobile/ test suite. Maintain or improve current 129-test baseline.
- **Parity tests** during v1→v2 migration: feed v1 Python validators and v2 TS tools the same input fixtures; outputs must match. Block migration on any divergence.

---

## 9. Versioning

The library follows semver:

- **Patch** (1.0.0 → 1.0.1): bug fix, no contract change. All cartridges still load.
- **Minor** (1.0.0 → 1.1.0): new tools added, no removals or signature changes. Cartridges declaring new tools require ≥1.1.0; older cartridges still load.
- **Major** (1.0.0 → 2.0.0): tool removed or signature broken. Cartridges declaring removed/changed tools fail to load on v2.0.0+. Migration required.

Cartridges declare the minimum library version they require:

```yaml
tools_required:
  - electrical.checkWireGauge
library_min_version: "1.2.0"
```

The runtime checks this at load and refuses cartridges that need a newer library than installed.

---

## 10. Tool inventory (v0.1 — what's in this commit)

### `units.ts` — generic units

- `units.formatCurrency(amount, currency, locale?)` → formatted string
- `units.convertLength(value, from, to)` → number
- `units.convertArea(value, from, to)` → number
- `units.parseNumber(input, locale?)` → number | null

### `pricing.ts` — generic pricing

- `pricing.lineItemTotal(material_id, qty, unit, cartridgeData)` → unit_price, total
- `pricing.applyTax(subtotal, tax_rate)` → tax_amount, total
- `pricing.computeMargin(cost, sale_price)` → margin_pct
- `pricing.formatQuote(line_items, labor, tax_rate, currency)` → structured quote breakdown

### `safety.ts` — hazard classification

- `safety.classify(hazard, evidence, context?)` → severity, requires_immediate_action, escalation
- `safety.combineHazards(hazards[])` → aggregate severity, ranked list

### `electrical.ts` — IEC 60364 (subset, Uruguay)

- `electrical.checkWireGauge(breaker_amps, wire_section_mm2, circuit_length_m, ambient_temp_c?)` → verdict, required_min_mm2, ref
- `electrical.checkRCDRequired(room_type, has_rcd, rcd_sensitivity_ma?)` → verdict, ref
- `electrical.maxLoadForSection(section_mm2, length_m, ambient_temp_c?)` → max_amps
- `electrical.computeBreakerMargin(load_amps, breaker_amps)` → margin_pct, verdict
- `electrical.checkDedicatedCircuit(declared_dedicated, load_count, loads_description?)` → verdict (parity port of v1 compliance_checker dedicated-circuit rule)
- `electrical.checkLoadAgainstBreaker(total_watts, voltage_v?, breaker_amps)` → verdict (parity port of v1 compliance_checker watts-based dimensioning rule)
- `electrical.lookupNorm(code)` → norm text, source

### `plumbing.ts` — plumbing rules

- `plumbing.checkSlope(length_m, drop_cm, application)` → verdict, required_min_pct, ref
- `plumbing.fixtureDiameter(fixture_type)` → required_diameter_mm, ref
- `plumbing.testPressure(material, system_type)` → required_pressure_bar, hold_time_min, ref

### `painting.ts` — painting rules

- `painting.dryingTime(brand, product, conditions)` → recoat_min_h, full_cure_h, ref
- `painting.coverage(brand, product, surface_type)` → m2_per_litre, ref
- `painting.checkSurfacePrep(surface_type, prep_steps_taken)` → verdict, missing_steps

### Future modules (not in this commit, declared for orientation)

- `pdf.ts` — pdfmake wrappers per template
- `share.ts` — `@capacitor/share` wrappers
- `photo.ts` — EXIF + PII scrub
- `geo.ts` — capacitor geolocation wrapper

`pdf` and `share` are deferred to the runtime-integration PR (when v2 wires into mobile/). The cartridges in this commit reference them in `tool-call` blocks; the runtime stub will return `verdict: pass, uri: 'mock://...'` until wired.

---

## 11. Open contract questions (need engineering review)

| # | Question |
|---|---|
| TQ1 | **Async tools**: `pdf.render` may take 1–2s. Tool calls in cartridge are written as if synchronous. Do we (a) allow async tools and the navigator awaits, or (b) require all tools to complete <100ms and offload PDF rendering to a non-tool host call? Recommend (a) — simpler mental model. |
| TQ2 | **Tool composition**: a cartridge wants a result that's a function of two tools (`A(x) → y, B(y) → z`). Today this requires two `tool-call` blocks. Should we add a `compose:` tool that chains? Defer until needed. |
| TQ3 | **Tool versioning per call**: when the library updates a tool's behavior, do cartridges pin to a specific version per tool (`tool: electrical.checkWireGauge@1.0`), or only at library level? Pin at library level for v1; revisit if/when a tool's contract changes. |
| TQ4 | **Cartridge-data refresh** (when materials_uy.json updates): the library reads the active cartridge's data files. If the cartridge data refreshes mid-session, do we hot-reload or pin to the version at session start? Pin at session start (consistency); refresh on next session. |
