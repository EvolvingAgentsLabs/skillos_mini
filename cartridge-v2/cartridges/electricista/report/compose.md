---
id: report_compose
title: Composición de reporte para el cliente
purpose: Producir un PDF firmado al cierre del trabajo, que documenta la intervención (antes/después), las normas aplicadas, y la garantía ofrecida.
entry_intents:
  - cerrar trabajo
  - reporte al cliente
  - terminé el trabajo
  - hacer informe final
prerequisites:
  - diagnosis_entry (los originales)
  - execution_trace (acciones ejecutadas)
  - photos_after (al menos una)
produces: client_report_artifact
next_candidates: []
tools_required:
  - safety.combineHazards
  - units.formatCurrency
tools_optional:
  - pdf.renderReport
  - share.toWhatsApp
confidence: 0.90
---

# Reporte para el cliente

Al cierre del trabajo, se entrega al cliente un documento PDF con:

1. **Resumen** — qué se hizo, en lenguaje llano.
2. **Antes / después** — fotos par del problema y la solución.
3. **Normas aplicadas** — qué reglas IEC/UTE se cumplieron en cada
   intervención (las herramientas devolvieron `ref:` por cada chequeo).
4. **Garantía** — términos de cobertura.
5. **Disclaimer profesional** — responsabilidad del electricista matriculado.
6. **Recomendación de seguimiento** — si aplica (ej. "revisar el resto del
   tablero en 6 meses").

## Paso 1: agregación de hazards

Reuní todas las clasificaciones de hazard de los `diagnosis_entry` de la
sesión y agregalas:

```tool-call
tool: safety.combineHazards
args:
  hazards: ${ctx.all_safety_classifications}
```

La herramienta devuelve la severidad agregada y un summary. Esto va al
encabezado del reporte: "Riesgo agregado de la intervención original: alto"
o "medio" o "bajo". Si el cliente conoce la severidad antes de la intervención
y después de la intervención, puede tasar la diferencia.

## Paso 2: armado del cuerpo

El cuerpo del reporte es prosa. Estructura recomendada:

```
## Resumen del trabajo

[1 párrafo en lenguaje llano: qué tenía la instalación, qué se hizo, en qué
estado quedó.]

## Problemas encontrados

Para cada diagnosis_entry:

### [Título legible del problema]

- **Lo que pasaba**: [explicación llana]
- **Por qué era riesgo**: [referencia a la severidad clasificada]
- **Norma aplicada**: [tool result `ref:` field]
- **Antes**: [foto]

## Intervenciones realizadas

Para cada acción ejecutada:

### [Acción]

- **Materiales usados**: [línea de quote]
- **Después**: [foto]
- **Verificación**: [tool result post-intervención si aplica, ej. RCD probado]

## Garantía

[Términos textuales — ver paso 3]

## Disclaimer profesional

[Texto fijo — ver paso 4]
```

## Paso 3: garantía

El texto de garantía debe ser literalmente este (cubre legalmente al
electricista y al cliente):

> Garantía de 6 meses sobre la mano de obra y los materiales instalados,
> contados desde la fecha de cierre de la intervención documentada en este
> reporte. La garantía no cubre: (a) manipulación posterior por terceros no
> autorizados; (b) fallas en instalaciones preexistentes no intervenidas en
> este trabajo; (c) daños por causas externas (sobretensiones de red,
> impactos físicos, humedad sobreviviente no señalada en el diagnóstico).
> Para hacer válida la garantía, el cliente debe contactar al profesional
> firmante de este reporte dentro del período de cobertura.

## Paso 4: disclaimer profesional

Texto fijo:

> Este reporte refleja el trabajo realizado por el profesional declarado en
> el pie de página. La decisión final sobre intervenciones eléctricas es
> responsabilidad del electricista matriculado UTE actuante. Esta aplicación
> asiste con documentación, validación de norma (IEC 60364 subset Uruguay) y
> generación del reporte; no sustituye juicio profesional. El cliente acepta
> que las recomendaciones de seguimiento son indicativas y que cualquier
> trabajo adicional fuera de esta intervención se cotiza por separado.

## Paso 5: render del PDF

```tool-call
tool: pdf.renderReport
args:
  template: standard_uy
  client: ${ctx.client_metadata}
  professional: ${user.professional_profile}
  diagnosis_entries: ${ctx.diagnosis_entries}
  execution_trace: ${ctx.execution_trace}
  photos_before: ${ctx.photos_before}
  photos_after: ${ctx.photos_after}
  hazard_aggregate: ${tool_results.combineHazards.result}
  warranty_text: <texto del paso 3>
  disclaimer_text: <texto del paso 4>
  locale: ${manifest.locale}
```

## Paso 6: compartir

```tool-call
tool: share.toWhatsApp
args:
  file_uri: ${tool_results.renderReport.uri}
  recipient_hint: ${ctx.client_metadata.phone}
  message: "Hola ${ctx.client_metadata.name}, te paso el reporte del trabajo eléctrico. Quedó documentada la intervención y la garantía. Cualquier consulta avisame. Saludos."
```

## Recomendación de seguimiento

Si durante la sesión surgió algún tema que NO se intervino pero conviene revisar:

- Otros circuitos de la vivienda con sospecha de problemas similares
- Tablero general antiguo que no se cambió esta vez
- Tomas que no se reemplazaron pero tienen señales

Incluí en el reporte un párrafo `Recomendaciones de seguimiento` con esos
puntos. NO compromete al electricista a hacerlos — es información para el
cliente.

## Lo que NO va al reporte

- Costos del presupuesto (van en el quote, no en el reporte de cierre).
- Diagnósticos de problemas no intervenidos (van como recomendación, no como
  diagnóstico cerrado).
- Información identificable de otros clientes (privacidad).
- Comentarios sobre el trabajo de otros profesionales que pasaron antes
  (cobertura legal — solo describí lo que encontraste, no a quién atribuirlo).
