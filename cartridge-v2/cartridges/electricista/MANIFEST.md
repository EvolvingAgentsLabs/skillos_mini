---
type: cartridge
version: 2
id: electricista
title: Electricista residencial — Uruguay
language: es-UY
description: >
  Diagnóstico, presupuesto y ejecución de intervenciones eléctricas residenciales
  con cumplimiento IEC 60364 (subset Uruguay). Apunta a electricistas matriculados
  o ayudantes autorizados que llegan a una vivienda, identifican el problema desde
  fotos del tablero y de la instalación, presupuestan en UYU con materiales y mano
  de obra de plaza, y entregan al cliente un PDF firmado con la intervención
  documentada.

entry_intents:
  - electricista
  - trabajo eléctrico
  - revisar instalación
  - presupuesto eléctrico
  - falla eléctrica
  - tomacorriente que se calienta
  - se cortó la luz
  - tablero viejo
  - cocina sin disyuntor

entry_index: index.md

tools_required:
  - electrical.checkWireGauge
  - electrical.checkRCDRequired
  - electrical.maxLoadForSection
  - electrical.computeBreakerMargin
  - electrical.checkDedicatedCircuit
  - electrical.checkLoadAgainstBreaker
  - electrical.lookupNorm
  - safety.classify
  - safety.combineHazards
  - units.formatCurrency
  - pricing.lineItemTotal
  - pricing.applyTax
  - pricing.formatQuote

tools_optional:
  - pdf.renderQuote
  - pdf.renderReport
  - share.toWhatsApp
  - photo.extractEXIF
  - photo.scrubPII

data:
  - data/materials_uy.json

locale:
  region: UY
  currency: UYU
  language: es-UY
  voltage_v: 230
  frequency_hz: 50
  tax_rate: 0.22

confidence: 0.85

generated: false
authored_by: hand-curated reference cartridge (canonical v2 example)
generated_at: 2026-04-29T00:00:00-03:00

navigation:
  max_hops: 12
---

# Electricista — cartridge overview

Cartridge canónico para electricistas residenciales en Uruguay. Es la referencia
para que una sesión de **define mode** con un experto del oficio produzca cartridges
similares para otros oficios o regiones.

## Estructura

- `index.md` — ruteo desde la intención del usuario hacia la etapa correspondiente
- `diagnosis/` — leaves para problemas comunes; cada uno con sus tool calls a
  `electrical.*` y `safety.classify`
- `quote/build.md` — construcción del presupuesto (UYU + IVA), con tools
  `pricing.*` y `units.formatCurrency`
- `report/compose.md` — armado del reporte final al cliente con `pdf.renderReport`
- `data/materials_uy.json` — catálogo local de cables, breakers, RCDs, terminales

## Por qué este shape

El cartridge no contiene reglas IEC en prosa: cada chequeo determinista (¿es
correcto este cable para este térmico? ¿se requiere RCD acá?) es un
`tool-call` a la librería compartida. La prosa es para juicio profesional y
explicación al cliente.

## Diferencias respecto a v1

v1 (`skillos_mini/cartridges/trade-electricista/`) era una pipeline lineal con
agentes (vision-diagnoser → quote-builder → report-composer), schemas JSON, y
validators Python. v2 es un árbol navegable con tool calls embebidos. La
correctness vive en `tool-library/electrical.ts`, no en este cartridge.
