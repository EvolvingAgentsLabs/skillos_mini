---
id: walkthrough_measure
title: Walkthrough y medición
purpose: Recorrer la obra, medir superficies por ambiente, evaluar tipo de superficie y prep necesaria, generar la base para el presupuesto por m².
entry_intents:
  - presupuestar pintura
  - visitar obra
  - medir ambientes
prerequisites:
  - access_to_property
produces: walkthrough_data
next_candidates:
  - quote_build
tools_required:
  - units.convertArea
  - painting.coverage
  - painting.checkSurfacePrep
  - painting.dryingTime
  - safety.classify
confidence: 0.80
---

# Walkthrough y medición

Recorré la obra ambiente por ambiente. Para cada ambiente:

1. **Medí**: largo × alto de cada pared a pintar; mismo para techo si aplica.
   Restá huecos grandes (>0.5 m²): puertas, ventanas, alacenas empotradas.
2. **Identificá la superficie**: yeso, mampostería, hormigón, madera, metal.
3. **Evaluá la prep necesaria**: lijado, sellado de grietas, imprimación,
   eliminación de hongos/humedad.
4. **Documentá con foto antes** (rol: `before`).

## Medición de áreas

Si los inputs son metros lineales y altura, convertir:

```tool-call
tool: units.convertArea
args:
  value: ${ctx.length_m * ctx.height_m}
  from: m2
  to: m2
```

(En este caso es identidad; el patrón sirve si el usuario mide en pies o
centímetros y querés normalizar.)

Sumá las áreas por ambiente. Total acumulado va al `quote_build`.

## Evaluación de superficie

Para cada superficie identificada, chequeá la preparación necesaria:

```tool-call
tool: painting.checkSurfacePrep
args:
  surface_type: ${ctx.surface_type}
  prep_steps_taken: []
```

(Lista vacía al inicio porque no hicimos prep aún — la herramienta devuelve
`required: { all_required: [...] }` con los pasos necesarios.)

Por superficie típica en Uruguay:

| Superficie | Prep estándar |
|---|---|
| Yeso interior nuevo | lijar, limpiar, fijador |
| Mampostería (revoque grueso) | limpiar, rellenar grietas, sellador alcalino |
| Hormigón | lavar, fijador (si poroso) |
| Madera (interior/exterior) | lijar, limpiar, fondo madera |
| Metal | desoxidar, desengrasar, antióxido |

## Coverage del producto elegido

Cuando el cliente elige producto, calculá litros necesarios:

```tool-call
tool: painting.coverage
args:
  brand: ${ctx.brand}
  product: ${ctx.product_name}
  surface_type: ${ctx.surface_type}
```

(Requiere `data/paint_brands_uy.json` con catálogo Sherwin Williams / Inca /
Sinteplast / Kolor.) La herramienta devuelve `m2_per_l` ajustado por
absorbencia de la superficie. Litros = área / coverage. Multiplicá por
1.1-1.2 para margen.

## Tiempos de secado (importante para timeline)

Los tiempos entre manos determinan cuántos días dura el trabajo. Para cada
producto a usar:

```tool-call
tool: painting.dryingTime
args:
  brand: ${ctx.brand}
  product: ${ctx.product_name}
  conditions:
    ambient_temp_c: ${ctx.ambient_temp_c | default(20)}
    humidity_pct: ${ctx.humidity_pct | default(60)}
```

La herramienta devuelve `recoat_min_h` (cuándo se puede dar la próxima mano)
y `full_cure_h` (cuándo el cliente puede usar normalmente la superficie).
Si el clima es frío o húmedo, el factor de ajuste extiende los tiempos —
documentalo en el timeline del quote.

## Hazards específicos

Si en el walkthrough aparece:

- **Asbesto sospechado** (techos viejos de fibrocemento ondulado, especialmente
  pre-1995): NO intervenir, derivar.

```tool-call
tool: safety.classify
args:
  hazard: asbestos
  evidence: techo_fibrocemento_pre_1995
  context: requiere empresa habilitada para manipular
```

- **Superficie con humedad activa**: pintar fracasa, comunicalo al cliente;
  derivá a especialista en impermeabilización antes de cotizar.

- **Trabajo en altura sin punto de anclaje**: clasifica como `fall`,
  presupuestá EPP y andamios separados.

## Output al `quote_build`

El walkthrough produce una estructura por ambiente:

```yaml
walkthrough_data:
  - ambiente: cocina
    paredes_m2: 22
    techo_m2: 9
    superficie: yeso
    prep_necesaria: [lijar_grano_180, limpiar_polvo, imprimir_fijador]
    productos_propuestos:
      - brand: Sherwin Williams
        product: Loxon Plus
    timeline_dias_estimados: 2
  - ambiente: baño
    paredes_m2: 12
    techo_m2: 4
    superficie: mampostería
    prep_necesaria: [limpiar, rellenar_grietas, imprimir_sellador_alcali]
    productos_propuestos:
      - brand: Inca
        product: Sinteplast Antihongos
    timeline_dias_estimados: 3
```
