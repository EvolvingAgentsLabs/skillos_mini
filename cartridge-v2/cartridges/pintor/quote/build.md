---
id: quote_build
title: Construcción de presupuesto pintor
purpose: Convertir el walkthrough en presupuesto por m² con materiales (litros de pintura, primer, materiales de prep) y mano de obra.
entry_intents:
  - presupuesto pintor
  - cotizar pintura
  - cuánto sale pintar
prerequisites:
  - walkthrough_data
produces: quote_artifact
next_candidates: []
tools_required:
  - pricing.lineItemTotal
  - pricing.applyTax
  - pricing.formatQuote
  - units.formatCurrency
  - painting.coverage
confidence: 0.78
---

# Presupuesto pintor (por m²)

Diferencia clave respecto a electricista/plomero: el pricing principal es
**por m²**. Materiales y mano de obra se calculan en función del área total
y la prep necesaria.

## Modelo de pricing

```
total_m2 = suma(ambientes.paredes_m2) + suma(ambientes.techo_m2)
litros_pintura = total_m2 / coverage_promedio_ajustado
costo_materiales = litros_pintura × precio_litro
                 + costo_imprimación
                 + costo_materiales_prep (lijas, masilla, sellador)
costo_mano_obra = total_m2 × tarifa_m2_segun_complejidad

complejidad:
  - simple (paredes lisas, una mano de color): 600-900 UYU/m²
  - media (prep moderada, dos manos, ambientes pequeños): 900-1300 UYU/m²
  - alta (prep extensa, alturas, ambientes complejos, pintura especial): 1300-2000+ UYU/m²
```

## Ítems del quote

Para los litros de pintura:

```tool-call
tool: pricing.lineItemTotal
args:
  material_id: ${ctx.product_id}
  qty: ${ctx.litros_calculados}
  unit: l
```

(Asumiendo `data/paint_brands_uy.json` con productos como
`sherwin_loxon_plus_1l`, `inca_sinteplast_antihongos_1l`, etc.)

Para mano de obra por m²:

- **Línea**: "Mano de obra por m² — complejidad ${nivel}"
- **Cálculo**: `total_m2 × tarifa_m2`
- **Tarifa documentada**: por convención, los pintores en Uruguay cotizan
  "todo incluido por m²" (incluye lijas, masilla, sellador, dos manos).
  Si el cliente solicita desglose, separar en línea aparte.

## Total y formato

```tool-call
tool: pricing.formatQuote
args:
  line_items: ${ctx.line_items}
  labor_hours: 0
  labor_rate: 0
  tax_rate: ${manifest.locale.tax_rate}
  currency: UYU
```

(`labor_hours: 0` porque la mano de obra ya está como `line_item` en
modelo por m² — no como horas separadas.)

```tool-call
tool: units.formatCurrency
args:
  amount: ${tool_results.last.total}
  currency: UYU
  locale: es-UY
```

## Estructura del PDF de presupuesto

El presupuesto del pintor incluye:

1. **Resumen del trabajo** — qué se va a pintar, alcance ambiente por
   ambiente, color/producto elegido.
2. **Tabla de materiales y mano de obra** — los `line_items`.
3. **Subtotal, IVA 22%, Total** — formato local UYU.
4. **Timeline** — cuántos días dura el trabajo (suma de los
   `timeline_dias_estimados` por ambiente, considerando que algunos pueden
   solapar — pintor con ayudante puede atacar 2 ambientes pequeños en
   paralelo).
5. **Validez**: 15 días.
6. **Garantía**: 6 meses sobre la mano de obra y los materiales aplicados,
   excluyendo manchas posteriores, golpes, humedad sobreviviente.
7. **Disclaimer**: el cliente acepta que los tiempos de secado dependen del
   clima y pueden extenderse en condiciones adversas.

## Reglas duras

1. **Si el walkthrough detectó humedad activa**, NO presupuestar pintura sin
   resolver la humedad antes. Documentá la condición y derivá a
   impermeabilización.
2. **Si el walkthrough detectó asbesto sospechado**, NO presupuestar.
3. **Coverage cita la fuente**: si calculaste litros con
   `painting.coverage`, el quote menciona la marca y el producto y la
   referencia que la herramienta devolvió.
4. **Tiempos de secado en el timeline**: el quote dice "X días" donde X
   incluye los tiempos de secado entre manos calculados con
   `painting.dryingTime`. NO comprometer plazos más cortos que los que la
   herramienta valida.
5. **IVA siempre 22%** — mismo criterio que electricista/plomero.

## Portfolio (post-trabajo)

Cuando el trabajo se cierra, las fotos antes/después se agregan al portfolio
local del pintor. Esto NO va al quote — va al reporte de cierre y al modo
`portfolio_grid` de la pantalla de Library del shell.
