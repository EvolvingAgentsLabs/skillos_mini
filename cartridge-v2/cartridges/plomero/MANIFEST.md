---
type: cartridge
version: 2
id: plomero
title: Plomero residencial — Uruguay
language: es-UY
description: >
  Diagnóstico y resolución de fallas de plomería residencial: desagües
  obstruidos, pérdidas, presión deficiente, instalación nueva. Cumplimiento
  UNIT 1192 y UNIT 1199 (subset Uruguay) verificado por la librería compartida.

entry_intents:
  - plomero
  - plomería
  - desagüe tapado
  - canilla pierde
  - presión baja
  - olor a cloaca
  - obra nueva sanitaria
  - cambiar griferia

entry_index: index.md

tools_required:
  - plumbing.checkSlope
  - plumbing.fixtureDiameter
  - plumbing.testPressure
  - safety.classify
  - units.formatCurrency
  - pricing.lineItemTotal
  - pricing.applyTax
  - pricing.formatQuote

tools_optional:
  - pdf.renderQuote
  - pdf.renderReport
  - share.toWhatsApp

data: []

locale:
  region: UY
  currency: UYU
  language: es-UY
  tax_rate: 0.22

confidence: 0.78

generated: false
authored_by: hand-curated reference cartridge (compact v2 example)
generated_at: 2026-04-29T00:00:00-03:00

navigation:
  max_hops: 10
---

# Plomero — cartridge overview

Cartridge compacto que cubre las dos fases típicas del oficio en residencial:
**urgencia** (desagüe tapado, pérdida) y **obra** (instalación o reforma con
cotización previa).

A diferencia de electricista, las normas de plomería en Uruguay no tienen el
mismo peso legal/seguridad — pero los chequeos de pendiente de desagües y
diámetro de descarga sí son medibles y verificables, y la librería los
expone como tools deterministas.

Este cartridge sirve como ejemplo de v2 para un oficio con menos volumen de
reglas duras que electricista. La estructura es la misma; solo cambian las
tools que el cartridge invoca.
