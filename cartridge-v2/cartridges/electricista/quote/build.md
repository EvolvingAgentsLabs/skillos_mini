---
id: quote_build
title: Construcción de presupuesto
purpose: Convertir un conjunto de problemas diagnosticados en un presupuesto detallado en UYU con materiales, mano de obra, IVA y validez.
entry_intents:
  - hacer presupuesto
  - cotizar
  - presupuestar arreglo
  - cuánto sale
prerequisites:
  - diagnosis_entry (al menos uno)
  - client_metadata (nombre, ubicación)
produces: quote_artifact
next_candidates:
  - report_compose
  - execute_log
tools_required:
  - pricing.lineItemTotal
  - pricing.applyTax
  - pricing.formatQuote
  - units.formatCurrency
confidence: 0.88
---

# Construcción de presupuesto

A partir del diagnóstico (uno o varios `diagnosis_entry` producidos por las
hojas de `diagnosis/`), armás el presupuesto que el cliente va a firmar.

El presupuesto tiene tres secciones:

1. **Materiales** — cada ítem es un `tool-call` a `pricing.lineItemTotal` que
   busca en `data/materials_uy.json`.
2. **Mano de obra** — horas estimadas × tarifa horaria del rol que ejecuta
   (matriculado vs ayudante).
3. **Total** — suma + IVA del 22%, con `pricing.applyTax`.

## Paso 1: armar la lista de materiales

Para cada problema diagnosticado, mapeá los materiales necesarios. Por ejemplo,
para `cable_subdimensionado` con sección requerida 6 mm² y longitud 12 m:

```tool-call
tool: pricing.lineItemTotal
args:
  material_id: cable_pvc_6mm_genrod
  qty: 12
  unit: m
```

Para `sin_rcd_ambiente_humedo` con corrección de instalar RCD bipolar 25 A
30 mA:

```tool-call
tool: pricing.lineItemTotal
args:
  material_id: rcd_2p_25a_30ma_genrod
  qty: 1
  unit: u
```

Cada llamada devuelve un `result` con `unit_price`, `total`, `currency`.
Acumulalos en `ctx.line_items[]`.

## Paso 2: estimar mano de obra

Para cada problema, estimá horas:

| Tipo de intervención | Horas matriculado | Horas ayudante |
|---|---|---|
| Recablear 1 circuito (≤15 m) | 2.0 | 1.5 |
| Instalar 1 RCD en tablero existente | 1.0 | 0.5 |
| Reemplazar 1 toma con conexión floja | 0.5 | 0 |
| Reemplazar tablero completo | 4.0 | 2.0 |
| Pegada de varios problemas (≤5 ítems en misma vivienda) | sumar individuales con descuento de 15% por simultaneidad | igual |

Las tarifas vienen de `data/labor_rates_uy.json` (futuro — usar fijas por ahora):

- Matriculado UTE: ~UYU 1,200/hora
- Ayudante autorizado: ~UYU 700/hora

Estos valores deben actualizarse cuando se publique `data/labor_rates_uy.json`
en el cartridge data refresh.

## Paso 3: armar el quote final

```tool-call
tool: pricing.formatQuote
args:
  line_items: ${ctx.line_items}
  labor_hours: ${ctx.labor_hours_total}
  labor_rate: ${ctx.labor_rate}
  tax_rate: ${manifest.locale.tax_rate}
  currency: UYU
```

La herramienta devuelve un `result` con `materials_subtotal`, `labor_subtotal`,
`subtotal`, `tax_amount`, `total`, `line_items` (los ítems formateados).

## Paso 4: formatear los montos para mostrar

El total de la herramienta viene en number; para mostrarlo al cliente con
formato local:

```tool-call
tool: units.formatCurrency
args:
  amount: ${tool_results.last.total}
  currency: UYU
  locale: es-UY
```

Idem para subtotal e IVA. La herramienta devuelve strings tipo "UYU 47.580".

## Paso 5: validez y garantía

Agregá a la prosa del presupuesto:

- **Validez**: 15 días desde la fecha de emisión. Si el cliente aprueba después,
  re-correr `pricing.formatQuote` para actualizar precios (los materiales pueden
  haber cambiado en `data/materials_uy.json`).
- **Garantía**: 6 meses sobre la mano de obra y los materiales instalados,
  excluyendo manipulación por terceros y fallas en instalaciones preexistentes
  no incluidas en la intervención.

## Paso 6: render del PDF (cuando el runtime esté wireado)

```tool-call
tool: pdf.renderQuote
args:
  template: standard_uy
  client: ${ctx.client_metadata}
  professional: ${user.professional_profile}
  diagnosis_summary: ${ctx.diagnosis_summary}
  quote: ${tool_results.formatQuote.result}
  validity_days: 15
  warranty_months: 6
  locale: ${manifest.locale}
```

La herramienta devuelve `uri:` apuntando al archivo PDF en el sandbox del
cartridge. El siguiente paso típico es compartirlo:

```tool-call
tool: share.toWhatsApp
args:
  file_uri: ${tool_results.last.uri}
  recipient_hint: ${ctx.client_metadata.phone}
  message: "Hola ${ctx.client_metadata.name}, te paso el presupuesto del trabajo eléctrico. Cualquier consulta avisame. Saludos."
```

## Reglas duras del presupuesto

1. **Toda línea de mano de obra cita el rol** ("matriculado UTE", "ayudante
   autorizado"). Es un requisito de transparencia que el cliente puede exigir
   y que cubre al electricista en caso de auditoría.
2. **Todo problema con `severity: high` aparece como ítem separado**, no
   agrupado, para que el cliente vea explícitamente qué está pagando para
   eliminar el riesgo grave. No esconder un RCD-30mA dentro de una línea
   "varios" — un futuro reclamo del cliente lo resolvería contra el
   electricista.
3. **El total siempre lleva IVA 22%** salvo que el cliente sea exento (RUT
   con exoneración) — registrar el RUT y la causal en ese caso.
4. **La validez nunca excede 30 días** y por defecto son 15. Los precios de
   materiales pueden cambiar más rápido.
5. **La garantía nunca cubre instalación preexistente** — sólo lo intervenido
   en este trabajo, documentado por foto antes/después.

## Lo que NO va al presupuesto

- Estimaciones de problemas que el electricista cree probables pero no fueron
  confirmados con foto + tool-call. Si no hay un `diagnosis_entry` con
  `verdict: fail` o `verdict: warn` en la sesión, no hay ítem en el quote.
- "Por las dudas" — recablear todo el circuito cuando solo un tramo falló.
  Si el cliente quiere extender el alcance, se hace una visita de evaluación
  separada y un presupuesto separado.
- Trabajos fuera del oficio (plomería, albañilería, pintura). Documentar como
  "recomendado consultar a [oficio]" en el reporte, no en el quote.
