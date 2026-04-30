---
id: sin_rcd_ambiente_humedo
title: Ambiente húmedo sin RCD
purpose: Verificar si el circuito que alimenta cocina / baño / lavadero / exterior tiene disyuntor diferencial 30 mA, y emitir veredicto si no lo tiene.
entry_intents:
  - cocina sin disyuntor
  - baño sin diferencial
  - se electrocutó
  - shock al tocar canilla
  - lavarropas sin RCD
prerequisites:
  - photo_of_panel
  - identification_of_circuit_purpose
produces: diagnosis_entry
next_candidates:
  - cable_subdimensionado
  - quote_build
tools_required:
  - electrical.checkRCDRequired
  - safety.classify
confidence: 0.95
---

# Ambiente húmedo sin RCD

IEC 60364-7-701 (locales con baño/ducha) y IEC 60364-4-41 (protección por
desconexión automática) requieren disyuntor diferencial de 30 mA en circuitos
que alimentan ambientes húmedos. En Uruguay esto incluye: cocina, baño,
lavadero, exterior, y cualquier circuito de tomas en planta baja con riesgo
de humedad.

Es **el chequeo más importante** de cualquier intervención: la falta de RCD
no se "calienta progresivamente" — la primera vez que falla la aislación con
una persona en contacto, hay riesgo de electrocución directo.

## Cómo verificarlo

1. **Identificá el ambiente** que alimenta el circuito. Si es cocina, baño,
   lavadero, exterior, o piscina → es ambiente húmedo y RCD es obligatorio.
2. **Mirá el tablero** y buscá el RCD: es un dispositivo más ancho que un
   térmico común, con un botón de prueba (T) en el frente y la indicación de
   sensibilidad (típicamente "30 mA" o "I∆n=30mA").
3. **Si hay RCD**, verificá la sensibilidad. ≤30 mA cumple norma para
   protección de personas; >30 mA es protección de equipos pero NO de personas.
4. **Llamá a la herramienta**:

```tool-call
tool: electrical.checkRCDRequired
args:
  room_type: ${ctx.room_type}
  has_rcd: ${ctx.has_rcd}
  rcd_sensitivity_ma: ${ctx.rcd_sensitivity_ma | default(30)}
```

`room_type` es uno de: `kitchen`, `bathroom`, `laundry`, `outdoor`, `pool`,
`dry`. La herramienta devuelve `verdict: pass | fail` y la referencia a la
norma (60364-7-701 para baño, 60364-4-41 para los otros).

## Si el resultado es `verdict: fail`

**Severidad alta, requiere acción inmediata.** Clasificá:

```tool-call
tool: safety.classify
args:
  hazard: shock
  evidence: rcd_missing_wet_room
  client_present: true
```

`safety.classify` va a marcar `severity: high` y `requires_immediate_action: true`.
Tu prosa al cliente debe ser inequívoca:

> "En este circuito que alimenta [cocina / baño / lavadero], no hay disyuntor
> diferencial obligatorio por norma. Si una persona toca un electrodoméstico
> con falla de aislación mientras está en contacto con agua o tierra (mojado,
> pies descalzos en el piso), puede recibir una descarga eléctrica grave o
> letal. La instalación de un RCD 30 mA es prioridad — se puede hacer en el
> tablero existente sin cambiar el resto."

## Verificación post-instalación

Si vas a instalar el RCD ahora o ya lo instalaste, **probalo antes de cerrar
el trabajo**: el botón de prueba (T) debe disparar el RCD. Si no dispara, el
RCD está fallado de fábrica o mal conectado — no lo dejes así.

```tool-call
tool: electrical.checkRCDRequired
args:
  room_type: ${ctx.room_type}
  has_rcd: true
  rcd_sensitivity_ma: 30
```

(Re-corrida del check después de instalar; debe devolver `verdict: pass`.)

## Por qué la severidad es siempre alta

A diferencia del cable subdimensionado, donde el daño escala con el tiempo,
la falta de RCD es un riesgo binario: el día que la aislación falla con una
persona en contacto, sin RCD no hay segunda oportunidad. La estadística uruguaya
de electrocuciones residenciales (datos UTE / INTI 2018-2024) muestra que >70%
ocurren en circuitos sin RCD, y la mayoría en cocinas y baños.

Esto se traduce en una regla de cartridge:

- **NUNCA** cerrar un trabajo en cocina/baño/lavadero sin verificar RCD.
- **NUNCA** dejar pasar el chequeo si el cliente "no quiere gastar más".
  Documentá la negativa por escrito en el reporte (cobertura legal del
  electricista).
- **SIEMPRE** ofrecer la instalación del RCD como ítem separado en el
  presupuesto, con la nota de obligatoriedad por norma.

## Costo típico (referencia, validar con cartridge data)

- RCD bipolar 30 mA 25 A: ~UYU 1,800 (Genrod o Sica).
- Mano de obra de instalación en tablero existente: 1-1.5 h matriculado.

Esto se materializa en el [`quote_build`](#quote_build) con tools
`pricing.lineItemTotal` apuntando al material `rcd_2p_25a_30ma_genrod` en
`data/materials_uy.json`.
