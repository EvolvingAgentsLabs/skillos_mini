# Tutorial: Write a v2 Cartridge

> Build a complete trade cartridge in 20 minutes. By the end you'll have a
> working `trade-gasista` cartridge that diagnoses gas installations, runs
> safety checks, lets the LLM adaptively probe further, and produces a
> client-facing report — all running on-device with Gemma 4.

We model a **gasista** (gas-installation tradesperson) as the worked
example. The same recipe applies to any vertical: herrero, carpintero,
jardinero, vet movil, field service — anything that fits the "go onsite,
diagnose, propose, deliver" loop.

---

## Prerequisites

```bash
cd skillos_mini/mobile
npm install
npm test             # confirm 355 passing
npx svelte-check     # confirm 0 errors
```

---

## 1. Create the cartridge directory

v2 cartridges live under `cartridge-v2/cartridges/<name>/`:

```bash
mkdir -p cartridge-v2/cartridges/gasista
```

Layout we'll build:

```
cartridge-v2/cartridges/gasista/
├── MANIFEST.md              # Entry point + metadata
├── index.md                 # Intent router
├── fuga_gas.md              # Diagnosis path: gas leak
├── regulador_vencido.md     # Diagnosis path: expired regulator
├── presupuesto.md           # Quote with pricing tools
└── data/
    └── materials_uy.json    # Local prices
```

---

## 2. Write MANIFEST.md

The manifest declares the cartridge identity, required tools, and locale:

```markdown
---
type: cartridge
version: 2
id: gasista
title: Gasista
language: es-UY
description: Cartridge para gasistas. Inspección de instalaciones de gas, detección de fugas, presupuesto.
entry_intents:
  - gasista
  - olor a gas
  - revisar instalacion de gas
  - fuga de gas
  - regulador
entry_index: index.md
tools_required:
  - safety.classify
  - pricing.lineItemTotal
  - pricing.applyTax
tools_optional:
  - safety.combineHazards
locale:
  region: UY
  currency: UYU
  language: es-UY
navigation:
  max_hops: 8
produces: informe
confidence: 0.85
---

Cartridge para gasistas matriculados MIEM-DNETN en Uruguay.
```

**Key fields:**
- `tools_required` — tools the Navigator verifies exist at load time
- `tools_optional` — tools available but not mandatory
- `entry_index` — the document that handles intent routing
- `produces` — what the COMPOSING phase generates ("informe", "presupuesto", "diagnosis")
- `locale` — passed to every tool as context (for currency formatting, etc.)

---

## 3. Write the index router

`index.md` maps user intents to diagnosis documents:

```markdown
---
id: index
title: Índice Gasista
routes:
  - intent: fuga de gas
    next: fuga_gas
  - intent: regulador vencido
    next: regulador_vencido
  - intent: olor a gas
    next: fuga_gas
  - intent: presupuesto
    next: presupuesto
---

Bienvenido. ¿Cuál es el problema con la instalación de gas?

Opciones: [Fuga de gas](#fuga_gas) | [Regulador vencido](#regulador_vencido)
```

The Navigator shows the `routes` list to the LLM. The LLM picks the best
match for the user's natural-language input.

---

## 4. Write a diagnosis document with mandatory + adaptive tools

This is where the power of v2 shows. `fuga_gas.md`:

```markdown
---
id: fuga_gas
title: Diagnóstico Fuga de Gas
produces: diagnosis
next_candidates:
  - presupuesto
---

# Fuga de Gas

Procedimiento de diagnóstico para fuga de gas domiciliaria.

## Verificación obligatoria

Clasificar el nivel de riesgo según los síntomas reportados.

```tool-call
tool: safety.classify
args:
  description: ${ctx.user_description}
  trade: gasista
  environment: ${ctx.environment | default(residential)}
```

## Verificaciones adicionales

Según los síntomas y el resultado de la clasificación inicial,
ejecutar verificaciones complementarias. Si hay olor persistente o
el ambiente es cerrado, verificar ventilación. Si hay corrosión
visible, verificar antigüedad del regulador.

```available-tools
tools:
  - safety.combineHazards
max_calls: 2
purpose: "Combinar peligros detectados si la clasificación inicial indica riesgo alto"
```

## Siguiente paso

Si se confirma fuga o riesgo alto: [Presupuesto reparación](#presupuesto)
```

**How this works at runtime:**

1. `safety.classify` runs deterministically with the user's description
2. The LLM reads the prose ("Si hay olor persistente...") as guidance
3. The LLM sees `available-tools` and decides whether to call `safety.combineHazards`
4. The LLM picks `#presupuesto` as next step (or DONE if the case is simple)

The prose is the **guardrail** — it tells the LLM *when* to use the adaptive
tools, without requiring the LLM to implement the logic.

---

## 5. Write a quote document with pricing tools

`presupuesto.md`:

```markdown
---
id: presupuesto
title: Presupuesto Reparación
produces: quote
---

# Presupuesto

Generar presupuesto basado en el diagnóstico realizado.

```tool-call
tool: pricing.lineItemTotal
args:
  items: ${ctx.repair_items | default(["regulador_standard"])}
  currency: UYU
  data_source: materials_uy
```

```tool-call
tool: pricing.applyTax
args:
  subtotal: ${tool_results.last.subtotal}
  tax_rate: 0.22
```

Presupuesto generado. El Navigator compondrá el informe final al cliente.
```

No cross-refs and no `available-tools` — this is a terminal document.
After the tools run, the Navigator enters COMPOSING and synthesizes
the final output using all accumulated results.

---

## 6. Add data files

`data/materials_uy.json`:

```json
{
  "currency": "UYU",
  "updated_at": "2026-05-01",
  "materials": [
    { "sku": "REG-MOLA", "name": "Regulador baja presión", "unit_price": 1850 },
    { "sku": "MAN-FL-50", "name": "Manguera flexible inox 50cm", "unit_price": 980 },
    { "sku": "DETEC-GAS", "name": "Detector de gas con alarma", "unit_price": 3200 }
  ]
}
```

Tools like `pricing.lineItemTotal` can reference this file by ID.

---

## 7. Register custom tools (if needed)

If your cartridge needs domain-specific tools not in the shared library,
add them to `mobile/src/lib/tool-library/`:

```typescript
// mobile/src/lib/tool-library/gas.ts
import type { ToolContext, ToolResult } from './types';

export function checkRegulatorAge(
  args: Record<string, unknown>,
  ctx: ToolContext
): ToolResult {
  const yearInstalled = Number(args.year_installed);
  const maxAge = 5; // MIEM-DNETN: regulators expire after 5 years
  const currentYear = new Date().getFullYear();
  const age = currentYear - yearInstalled;

  return {
    verdict: age > maxAge ? 'fail' : 'pass',
    reason: age > maxAge
      ? `Regulador de ${yearInstalled} — ${age} años, máximo permitido ${maxAge}`
      : `Regulador dentro de vida útil (${age} años)`,
    ref: 'MIEM-DNETN Art. 23',
    age,
    max_age: maxAge,
  };
}
```

Register it in the tool registry when setting up the Navigator:

```typescript
import * as gas from '../tool-library/gas';
registerModule(registry, 'gas', gas);
```

Then reference it in your cartridge documents:

```markdown
```tool-call
tool: gas.checkRegulatorAge
args:
  year_installed: ${ctx.regulator_year}
```
```

---

## 8. Test your cartridge

Write a test that walks the cartridge with a mock LLM:

```typescript
import { describe, expect, it } from 'vitest';
import { Navigator } from '../src/lib/cartridge-v2/navigator';
import { createToolRegistry, registerModule } from '../src/lib/cartridge-v2/tool_invoker';
import * as safety from '../src/lib/tool-library/safety';
import * as pricing from '../src/lib/tool-library/pricing';

describe('gasista cartridge walk', () => {
  it('routes fuga intent and produces diagnosis', async () => {
    const registry = createToolRegistry();
    registerModule(registry, 'safety', safety);
    registerModule(registry, 'pricing', pricing);

    const nav = new Navigator(
      {
        infer: async () => 'fuga_gas', // mock LLM always picks fuga
        readFile: async (path) => { /* load from cartridge dir */ },
      },
      {
        basePath: 'cartridge-v2/cartridges/gasista',
        docPaths: ['index.md', 'fuga_gas.md', 'presupuesto.md'],
        userTask: 'Hay olor a gas en la cocina',
        registry,
      }
    );

    const state = await nav.run();
    expect(state.phase).toBe('done');
    expect(state.toolResults.length).toBeGreaterThan(0);
  });
});
```

---

## 9. Run and verify

```bash
cd mobile
npm test                  # all tests pass
npx svelte-check          # 0 type errors
```

---

## Cartridge design patterns

### Pattern: Progressive diagnosis

Route → general check → LLM decides depth → specific checks → quote.

```
index.md → diagnosis_general.md (mandatory: classify)
                                 (available: checkX, checkY, checkZ)
         → presupuesto.md (mandatory: pricing)
```

The LLM reads the first diagnosis result and decides whether deeper
checks are needed. A 2B model can reliably make this decision because
it only needs to output a tool name from a whitelist.

### Pattern: Multi-path branching

Different symptoms → different documents → different tools.

```
index.md ─┬→ fuga_gas.md (tools: gas-specific)
           ├→ regulador_vencido.md (tools: age checks)
           └→ ventilacion.md (tools: room-size checks)
```

Each document has its own `available-tools` tailored to that scenario.
The LLM only sees what's relevant.

### Pattern: Mandatory guardrail + adaptive investigation

The mandatory tool enforces compliance. The available tools let the
LLM investigate further:

```markdown
# Mandatory: always check wire gauge (can't skip this)
```tool-call
tool: electrical.checkWireGauge
args: ...
```

# Adaptive: LLM decides what else to check
```available-tools
tools:
  - electrical.checkCircuitBreaker
  - electrical.checkGrounding
  - safety.checkRCD
purpose: "Run additional checks based on wire gauge result"
```
```

If the wire gauge passes, the LLM might say DONE. If it fails, the
LLM investigates further. The document prose guides this decision.

### Pattern: Terminal document with no tools

Some documents are purely informational — the LLM reads them and
synthesizes output during COMPOSING:

```markdown
---
id: normas_referencia
title: Normas aplicables
---

## Normas IEC aplicables

- IEC 60364-5-52: Selección e instalación — cableado
- IEC 61008: Dispositivos de corriente residual (RCD)
- IEC 60898: Interruptores automáticos

El presupuesto debe referenciar la norma correspondiente.
```

No tools, no available-tools. The Navigator visits this doc if the
LLM picks it as next step — its prose gets included in the COMPOSING
context.

---

## Summary: what makes v2 cartridges powerful

| Feature | How it works | Why it matters |
|---------|-------------|----------------|
| Deterministic compliance | `tool-call` blocks execute without LLM | Can't hallucinate away safety checks |
| Adaptive investigation | `available-tools` whitelist + LLM | Model decides depth based on symptoms |
| Document as knowledge | Prose → LLM context | 2B model gets domain expertise for free |
| Document as guardrail | Prose tells LLM when to act | Model guided without fine-tuning |
| Auditable | Every call logged with args + result | Full trace for regulatory compliance |
| Offline | Gemma 4 on NPU, all tools in TypeScript | Zero network dependency |
| Extensible | New vertical = new markdown directory | No runtime code changes needed |

---

## Reference

- [README.md](../README.md) — project overview
- [ARCHITECTURE.md](ARCHITECTURE.md) — full system diagram + Navigator internals
- [USAGE.md](USAGE.md) — end-user guide
- [CLAUDE.md](../CLAUDE.md) — developer contract + source of truth
