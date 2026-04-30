---
id: quote_build
title: Construcción de presupuesto plomero
purpose: Convertir el diagnóstico en presupuesto en UYU con materiales, mano de obra, IVA y validez.
entry_intents:
  - presupuesto plomero
  - cotizar plomería
  - cuánto sale
prerequisites:
  - diagnosis_entry (al menos uno) o brief_de_obra
produces: quote_artifact
next_candidates: []
tools_required:
  - pricing.lineItemTotal
  - pricing.applyTax
  - pricing.formatQuote
  - units.formatCurrency
confidence: 0.85
---

# Presupuesto plomero

Mismo patrón que electricista: ítems de materiales con `pricing.lineItemTotal`,
mano de obra estimada por intervención, total con `pricing.applyTax`,
formateo con `units.formatCurrency`, render con `pdf.renderQuote`.

## Tarifas de mano de obra (referencia)

| Intervención | Horas matriculado | Horas ayudante |
|---|---|---|
| Destape puntual de un artefacto | 1.0 | 0 |
| Cambio de griferia | 1.0 | 0 |
| Cambio de sifón | 0.5 | 0 |
| Reparación de pérdida en unión PVC | 1.5 | 0.5 |
| Reinstalación de cañería con pendiente correcta (5 m) | 5.0 | 3.0 |
| Cambio de inodoro completo | 2.5 | 1.0 |

Tarifas matriculado: ~UYU 1,000/h. Ayudante: ~UYU 600/h.

## Ítems materiales típicos

Si el cartridge data tuviera `materials_uy.json` para plomero, las llamadas
serían tipo:

```tool-call
tool: pricing.lineItemTotal
args:
  material_id: cano_pvc_50mm_loto
  qty: 5
  unit: m
```

Como este cartridge ejemplo no incluye `data/materials_uy.json` propio
(es un cartridge compacto de referencia, no production-ready), usá precios
de plaza estimados en la prosa del quote y marcá los ítems con un asterisco
indicando "precio estimado, confirmar con local de venta antes de cierre".

En un cartridge production se carga `data/materials_uy.json` con catálogo de
FV, Loto, Hidromet, Rotoplas — sigue el patrón del electricista.

## Reglas duras

1. **Si el diagnóstico fue "estructural"**, NO cotizar la intervención
   puntual como si fuera la solución. Cotizá la intervención puntual
   (alivio) Y el trabajo de fondo (re-instalación con pendiente correcta)
   como ítems separados, marcando claramente cuál resuelve cada cosa.
2. **Para obras nuevas**, incluí siempre un ítem "test de presión post-
   instalación" con `plumbing.testPressure` documentado en el reporte.
3. **IVA siempre 22%** salvo cliente exento (mismo criterio que electricista).
