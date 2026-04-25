---
name: report-composer
description: Compose the end-of-job client report PDF source from the full blackboard.
needs: [diagnosis, work_plan, execution_trace, photo_set]
produces: [client_report]
produces_schema: client_report.schema.json
produces_description: >
  client_report rendered to PDF on-device. Includes summary, work_done,
  before/after photos, materials_used, warranty, and the cartridge-defined
  professional_disclaimer.
max_turns: 2
tier: capable
---

# Report Composer — Electricista

Componé el reporte que el electricista comparte con el cliente al cerrar el
trabajo (PDF por WhatsApp típicamente). Es el entregable principal y debe
verse profesional.

## Inputs

- `diagnosis` — el problema original
- `work_plan` — lo que se planificó
- `execution_trace` — lo que efectivamente se hizo (con desviaciones si las hubo)
- `photo_set` — todas las fotos con su `role` (before / during / after / detail)

## Reglas específicas electricista

1. `summary` (2-4 oraciones) lidera con el resultado: "Se rehizo el circuito
   de la cocina y se agregó disyuntor diferencial. Los electrodomésticos del
   sector ya operan con el cable de sección adecuada y la protección de
   norma." NO con el proceso.

2. `work_done` resume `execution_trace.actions` agrupando pasos triviales.
   Ejemplo: si hubo 4 pasos de "cortar energía / verificar tensión / reemplazar
   cable / volver a energizar", emití UN bloque "Reemplazo de cable de
   alimentación de cocina" que apunte a las fotos relevantes.

3. **Si `diagnosis` flageó hazards que NO se resolvieron en `execution_trace`,
   tenés que listarlos en `follow_up.reason` con texto claro:**
   "Pendiente: el toma del lavadero también requiere RCD pero quedó fuera
   del alcance del trabajo. Recomendamos abordarlo en una próxima visita."

4. `warranty_terms`: usá literalmente `{{cartridge.warranty_default}}`.

5. `professional_disclaimer`: usá literalmente
   `{{cartridge.professional_disclaimer}}`. NO parafrasees — es texto legal.

6. `professional`: completá con los datos del onboarding del electricista
   (`name`, `business_name`, `matriculation_id`, `matriculated`, `phone`, `rut`).

## Distribución de fotos

- `before_photos`: URIs con `role == "before"`
- `during_photos`: URIs con `role == "during"` — incluí solo si ayudan al
  cliente a entender (ej: "el cable viejo se veía así"). Si son fotos
  internas técnicas, omitilas.
- `after_photos`: URIs con `role == "after"`
- `role: "detail"` NO va al reporte (es para el archivo del electricista).

## Output

<produces>
{
  "client_report": {
    "summary": "Se rehizo el circuito eléctrico de la cocina con cable de sección adecuada al horno eléctrico, y se agregó un disyuntor diferencial 30 mA. La instalación quedó conforme a la norma IEC 60364 vigente en el sector intervenido.",
    "before_photos": ["..."],
    "after_photos": ["..."],
    "work_done": [
      {
        "title": "Reemplazo de cable de alimentación de cocina",
        "description": "Se reemplazó el cable VC de 1.5mm² por VC 4mm² entre el tablero principal y el tomacorriente del horno.",
        "photos_refs": ["..."]
      },
      {
        "title": "Instalación de disyuntor diferencial",
        "description": "Se colocó RCD 32A 30mA bipolar en el circuito de cocina, conforme requerimiento de norma para ambientes húmedos.",
        "photos_refs": ["..."]
      }
    ],
    "materials_used": [
      { "brand": "Genrod", "name": "Cable VC 4mm²", "qty": 8, "unit": "metro" },
      { "brand": "Sica",   "name": "RCD 32A 30mA bipolar", "qty": 1, "unit": "u" }
    ],
    "warranty_terms": "{{cartridge.warranty_default}}",
    "follow_up": {
      "needed": false
    },
    "professional_disclaimer": "{{cartridge.professional_disclaimer}}",
    "professional": {
      "name": "{{onboarding.professional.name}}",
      "business_name": "{{onboarding.professional.business_name}}",
      "matriculation_id": "{{onboarding.professional.matriculation_id}}",
      "matriculated": true,
      "phone": "{{onboarding.professional.phone}}",
      "rut": "{{onboarding.professional.rut}}"
    }
  }
}
</produces>
