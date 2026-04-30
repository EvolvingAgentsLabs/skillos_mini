---
id: cable_subdimensionado
title: Cable subdimensionado para el breaker
purpose: Diagnosticar cuándo la sección del cable es menor a la requerida para el térmico instalado, cuantificar el riesgo, y emitir un veredicto auditado por norma.
entry_intents:
  - cable que se calienta
  - tomacorriente con marca de quemado
  - olor a aislación
  - cable derretido
  - tablero recalentado
prerequisites:
  - photo_of_panel
  - photo_of_outlet_or_cable
produces: diagnosis_entry
next_candidates:
  - sin_rcd_ambiente_humedo
  - quote_build
tools_required:
  - electrical.checkWireGauge
  - safety.classify
confidence: 0.92
---

# Cable subdimensionado

Cuando la sección del cable es menor a la requerida para el térmico instalado,
el cable se sobrecalienta progresivamente bajo carga. Es una de las causas más
frecuentes de incendios eléctricos residenciales en Uruguay — especialmente en
viviendas de los 70-90 donde la instalación original tenía 1.5mm² para todo y
con el tiempo se cambiaron térmicos a 25-32 A para aguantar más cargas modernas
sin recablear.

## Cómo identificarlo desde la foto

1. **Identificá el amperaje del breaker** que protege el circuito. El número
   está impreso en la carcasa del térmico (10A / 16A / 20A / 25A / 32A).
2. **Identificá la sección del cable** saliente del térmico hacia la
   instalación. La sección está marcada en el aislante: `1.5 mm²`, `2.5 mm²`,
   `4 mm²`, `6 mm²`, `10 mm²`. Si la marca está borrada, mirá el diámetro del
   conductor de cobre con un calibre.
3. **Estimá la longitud del circuito** hasta la carga más lejana. En vivienda
   común: cocina ≈ 8-12 m, baño ≈ 4-8 m, dormitorio fondo ≈ 10-15 m.
4. **Llamá a la herramienta** para que compare la combinación contra
   IEC 60364-5-52 (tabla B.52.4):

```tool-call
tool: electrical.checkWireGauge
args:
  breaker_amps: ${ctx.breaker_amps}
  wire_section_mm2: ${ctx.wire_section_mm2}
  circuit_length_m: ${ctx.circuit_length_m}
  ambient_temp_c: ${ctx.ambient_temp_c | default(30)}
```

La herramienta devuelve `verdict: pass | fail | warn` y, si falla, la sección
mínima requerida y el amperaje máximo seguro para la sección actual.

## Si el resultado es `verdict: fail`

Clasificá el peligro como incendio. El cable subdimensionado se calienta
proporcional al cuadrado de la corriente (P = I²·R), entonces el riesgo escala
muy rápido cuando la carga supera el límite efectivo.

```tool-call
tool: safety.classify
args:
  hazard: fire
  evidence: undersized_wire_for_breaker
  proximity_to_combustible: ${ctx.proximity_to_combustible | default("medium")}
```

`proximity_to_combustible` lo evaluás de la foto:

- **alta** — cable en contacto con madera, tela, papel pintado, mueble pegado
- **media** — cable en pared con yeso, sin contacto con material combustible
- **baja** — cable en caño metálico, en pared de hormigón

## Veredicto a emitir

Si la herramienta devolvió `verdict: fail`:

- **Categoría del problema**: `cable_subdimensionado`
- **Severidad**: alta (lo confirma `safety.classify`)
- **Cita la regla**: la herramienta devolvió `ref` (siempre `IEC 60364-5-52
  Table B.52.4` para este chequeo).
- **Explicación al cliente** (en lenguaje llano, sin jerga): "El cable que
  alimenta este circuito es muy fino para el térmico que tiene instalado. Con
  uso intenso se calienta y puede iniciar un incendio. Hay que cambiar el cable
  a la sección que corresponde, o bajar el térmico al amperaje correcto para
  el cable actual."
- **Acción correctiva** (dos opciones, dejá que el cliente elija con tu
  recomendación):
  1. Recablear el circuito a la sección mínima que devuelve la herramienta
     (`required.min_section_mm2`). Más caro, deja el térmico actual.
  2. Bajar el térmico al `required.max_safe_breaker_a`. Más barato, pero
     sólo si las cargas conectadas al circuito no superan ese límite — confirmar
     con el cliente y/o medir.

## Si el resultado es `verdict: warn`

Sucede cuando la sección está fuera de tabla o el escenario es ambiguo (ej.
cable sin marcado claro). Documentá la incertidumbre en el diagnóstico, no
emitas categorías firmes, y sugerí evaluación in-situ con instrumental antes
de cotizar la corrección.

## Si el resultado es `verdict: pass`

El circuito cumple norma para esta sección y este térmico. Documentalo igual
en el diagnóstico (un `pass` documentado es valioso para la trazabilidad de la
intervención y para la garantía). Pasá al próximo chequeo (probablemente RCD
en ambientes húmedos: ver [`sin_rcd_ambiente_humedo`](#sin_rcd_ambiente_humedo)).

## Por qué este chequeo es crítico

En el muestreo informal de viviendas que hicimos en 2025-2026, ~40% de los
tableros residenciales en Montevideo tenían al menos un circuito con esta
falla. La progresión típica del daño:

1. **Día 1**: cliente compra un nuevo electrodoméstico (microondas, estufa
   eléctrica, induction).
2. **Mes 1-3**: el cable empieza a calentarse bajo carga prolongada.
3. **Mes 6-18**: la aislación se cristaliza, se vuelve frágil.
4. **Año 2+**: cortocircuito espontáneo o conexión interna que dispara el
   térmico... si el térmico funciona. Si está pegado por sobreuso, no dispara
   y el incendio empieza.

El chequeo es barato (segundos con una foto). El costo de no hacerlo lo paga
el cliente.
