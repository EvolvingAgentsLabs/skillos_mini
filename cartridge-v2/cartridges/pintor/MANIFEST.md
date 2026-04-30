---
type: cartridge
version: 2
id: pintor
title: Pintor residencial — Uruguay
language: es-UY
description: >
  Walkthrough, presupuesto por m², ejecución y portfolio fotográfico para
  pintores residenciales. Validaciones en código (tiempos de secado, coverage,
  preparación de superficie) vienen de la librería compartida (painting.*).

entry_intents:
  - pintor
  - pintar
  - presupuesto pintura
  - cuánto sale pintar
  - cambiar color

entry_index: index.md

tools_required:
  - painting.dryingTime
  - painting.coverage
  - painting.checkSurfacePrep
  - units.formatCurrency
  - units.convertArea
  - pricing.lineItemTotal
  - pricing.formatQuote

tools_optional:
  - pdf.renderQuote
  - pdf.renderReport
  - share.toWhatsApp
  - photo.extractEXIF

data: []

locale:
  region: UY
  currency: UYU
  language: es-UY
  tax_rate: 0.22

confidence: 0.75

generated: false
authored_by: hand-curated reference cartridge (compact v2 example)
generated_at: 2026-04-29T00:00:00-03:00

navigation:
  max_hops: 10

ui:
  library_default_mode: portfolio_grid
---

# Pintor — cartridge overview

Cartridge para pintores residenciales. Diferencia clave respecto a
electricista/plomero: el modelo de pricing es **por m²** y la entrega
secundaria importa (portfolio antes/después como herramienta comercial).

Las normas son blandas (best practices: tiempos de secado, coverage por
producto, preparación según superficie) — la librería compartida las expone
como `painting.*` deterministas, pero con `verdict: warn` en lugar de
`verdict: fail` típicamente.

Este cartridge demuestra cómo el shape v2 escala a oficios sin reglas
legales/seguridad fuertes: la prosa lleva la mayor parte del peso, las
tools previenen los errores de ejecución más caros (recoatear antes de
tiempo y arruinar la mano).
