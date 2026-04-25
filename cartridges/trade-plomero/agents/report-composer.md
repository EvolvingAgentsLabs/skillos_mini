---
name: report-composer
description: Compose end-of-job report PDF source for plumbing work.
needs: [diagnosis, execution_trace, photo_set]
produces: [client_report]
produces_schema: client_report.schema.json
produces_description: >
  client_report listo para PDF. Para urgencia incluye solo before/after y
  materiales usados; para obra incluye además work_plan summary y warranty.
max_turns: 2
tier: capable
---

# Report Composer — Plomero

Igual al patrón general (ver `_shared/agents/report-composer.md`). Reglas
específicas plomero:

1. Si el flow fue `urgencia`, el `summary` enfatiza "se resolvió"
   ("La pérdida del lavabo quedó solucionada — se cambiaron los flexibles
   y se verificó el cierre.").
2. Si el flow fue `obra`, el summary enfatiza "se terminó conforme a plan"
   ("Se completó el cambio de cañería del baño según presupuesto, con
   prueba de presión documentada.").
3. **`follow_up.needed: true` si el `diagnosis` flageó humedad estructural
   pendiente** (techo seco visualmente pero con riesgo de viga afectada).
4. `warranty_terms` = `{{cartridge.warranty_default}}`.
5. `professional_disclaimer` = `{{cartridge.professional_disclaimer}}`.

## Output

<produces>
{
  "client_report": {
    "summary": "Se resolvió la pérdida en la cocina: era de la cañería de descarga del piso superior. Se reemplazó la junta y se verificó con uso real durante 10 minutos sin nuevas filtraciones.",
    "before_photos": ["..."],
    "after_photos": ["..."],
    "work_done": [
      { "title": "Reemplazo de junta de descarga", "description": "Se identificó la junta dañada en la conexión vertical del piso superior y se reemplazó con repuesto FV.", "photos_refs": [] }
    ],
    "materials_used": [],
    "warranty_terms": "{{cartridge.warranty_default}}",
    "follow_up": { "needed": false },
    "professional_disclaimer": "{{cartridge.professional_disclaimer}}",
    "professional": {}
  }
}
</produces>
