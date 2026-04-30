---
id: desague_obstruido
title: Desagüe obstruido
purpose: Diagnosticar la naturaleza de la obstrucción (puntual vs estructural) y proponer la intervención adecuada.
entry_intents:
  - desagüe tapado
  - inodoro tapado
  - olor a cloaca
  - pileta no descarga
  - rejilla con agua
prerequisites:
  - photo_or_description_of_fixture
produces: diagnosis_entry
next_candidates:
  - quote_build
tools_required:
  - plumbing.checkSlope
  - plumbing.fixtureDiameter
  - safety.classify
confidence: 0.80
---

# Desagüe obstruido

La obstrucción puede ser **puntual** (acumulación de pelo / grasa / objeto
en el sifón o el primer tramo de cañería) o **estructural** (pendiente
deficiente, raíces, fisura en cañería principal). El diagnóstico determina
la intervención.

## Cómo identificar el tipo

1. **Puntual**: una sola descarga afectada (un solo lavabo, una sola pileta).
   La obstrucción se resuelve con desatorador, espiral manual, o desarmando
   sifón.
2. **Estructural**: múltiples descargas afectadas, especialmente en el
   nivel más bajo de la vivienda. Olor a cloaca persistente. Agua que sube
   por rejillas cuando se descarga otra cañería.

## Si es estructural — chequeo de pendiente

Si el cliente o vos podés inspeccionar la cañería (cámara de inspección,
desarmando un tramo, o por planos), verificá pendiente:

```tool-call
tool: plumbing.checkSlope
args:
  length_m: ${ctx.length_m}
  drop_cm: ${ctx.drop_cm}
  application: drain_main
```

`drain_main` para cañería principal de descarga (≥1% según UNIT 1192).
`drain_branch` para ramales hacia artefacto individual (≥2%). Si la
herramienta devuelve `verdict: fail`, la obstrucción es síntoma — la causa
es que la cañería no fue instalada con la pendiente correcta. Recomendación:
re-instalar con pendiente correcta (intervención mayor, presupuesto separado).

## Verificar diámetro del artefacto

Si es un artefacto específico que no descarga (inodoro, ducha), verificá el
diámetro de la cañería que sale:

```tool-call
tool: plumbing.fixtureDiameter
args:
  fixture_type: ${ctx.fixture_type}
```

`fixture_type` en: `lavabo`, `bidet`, `bañera`, `ducha`, `inodoro`,
`pileta_cocina`, `lavarropas`, `rejilla_piso`. Si la cañería instalada
es menor al `required.drain` (ej. inodoro con desagüe de 50 mm en lugar de
110 mm), la obstrucción crónica es esperable — recomendación: re-instalar.

## Hazard si hay olor a cloaca persistente

Olor a cloaca puede indicar respiraderos obstruidos o sifones resecos.
NO es un riesgo de electrocución ni de incendio per se, pero sí de
exposición a gases (CH4, H2S) en concentración. Severidad media:

```tool-call
tool: safety.classify
args:
  hazard: gas_leak
  evidence: persistent_sewer_smell
  context: posible respiradero obstruido o sifón seco
```

(Reusamos `gas_leak` como "exposición a gases peligrosos" — la herramienta
clasifica con severidad alta y `professional_only: true`. Para cloaca real
con metano detectable, evacuar y ventilar antes de continuar.)

## Veredicto

- **Puntual**: intervención inmediata (1-2 h matriculado), poco material.
  Va al `quote_build`.
- **Estructural por pendiente / diámetro**: NO se resuelve con desatorador.
  Documentá la causa raíz, derivá la intervención mayor a un presupuesto
  separado con foto/medición del problema.
- **Olor a cloaca persistente**: revisar respiraderos, recomendá llamar a
  empresa especializada si los gases son detectables a simple olfato durante
  más de 5 minutos en ambiente cerrado.

## Lo que NO hacés

- Garantizar que la obstrucción puntual no vuelva. Si la causa raíz es
  estructural (pendiente o diámetro), una intervención puntual es alivio
  temporal — comunicalo claro al cliente.
- Usar productos químicos agresivos en cañerías de PVC sin verificar
  compatibilidad. Pueden dañar las soldaduras térmicas y causar futuras
  pérdidas.
