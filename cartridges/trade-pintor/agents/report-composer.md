---
name: report-composer
description: Compose end-of-job report PDF source for painting work, optimized for portfolio use.
needs: [diagnosis, work_plan, execution_trace, photo_set]
produces: [client_report]
produces_schema: client_report.schema.json
produces_description: >
  client_report listo para PDF + uso en portfolio del pintor (par
  antes/después por ambiente, productos usados, datos técnicos).
max_turns: 2
tier: capable
---

# Report Composer — Pintor

Reglas específicas:

1. **Estructura por ambiente**: el `work_done` es una entrada por ambiente
   con `before_photos` y `after_photos` adjuntas (no globales).
2. `summary` resalta el cambio visual + duración: "Se pintó el living
   completo y dormitorio principal (60 m² total) en 3 días, con dos manos
   de látex blanco Sherwin Williams ProMar y tratamiento antihumedad sobre
   pared norte del living."
3. `materials_used` lista marca + producto + cantidad real (no la del
   work_plan — la usada de verdad, registrada en `execution_trace.actions[].notes`).
4. **Portfolio mode**: el shell duplica la entrada en la biblioteca con
   `library_default_mode: portfolio`. El reporte queda igual; el pintor
   lo puede compartir tal cual al cliente o exportarlo para Instagram.
5. `warranty_terms` = `{{cartridge.warranty_default}}`.
6. `professional_disclaimer` = `{{cartridge.professional_disclaimer}}`.

## Output

<produces>
{
  "client_report": {
    "summary": "Se pintó living y dormitorio principal (60 m² total) con dos manos de látex Sherwin Williams ProMar blanco. Se trató una zona de humedad sobre pared norte del living antes de pintar. Trabajo realizado en 3 jornadas con tiempos de secado respetados.",
    "before_photos": ["..."],
    "after_photos": ["..."],
    "work_done": [
      { "title": "Living",      "description": "Preparación, antihumedad, dos manos de látex.",  "photos_refs": [] },
      { "title": "Dormitorio",  "description": "Lijado leve y dos manos de látex.",               "photos_refs": [] }
    ],
    "materials_used": [
      { "brand": "Sherwin Williams", "name": "Látex interior ProMar blanco 4L", "qty": 4, "unit": "lata" },
      { "brand": "Sinteplast",       "name": "Sellador antihumedad 1L",          "qty": 1, "unit": "lata" }
    ],
    "warranty_terms": "{{cartridge.warranty_default}}",
    "follow_up": { "needed": false },
    "professional_disclaimer": "{{cartridge.professional_disclaimer}}",
    "professional": {}
  }
}
</produces>
