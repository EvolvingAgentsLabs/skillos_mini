# Flow: obra (plomero)

Caso de uso: trabajo planificado (renovación de baño, instalación nueva,
cambio de cañerías de un sector). Hay tiempo para presupuestar formalmente
y validar contra normativa local de pendiente, diámetros, presión.

## Sequence

| # | Agent              | needs        | produces            |
|---|--------------------|--------------|---------------------|
| 1 | vision-diagnoser   | photo_set    | diagnosis           |
| 2 | quote-builder      | diagnosis    | work_plan, quote    |
| 3 | report-composer    | full bb      | client_report       |

## Validators

- `plumbing_checker.py` — verifica:
  - Pendiente de desagües ≥ 1% (preferentemente 1.5–2%)
  - Diámetros mínimos por artefacto (lavabo 40 mm, ducha 50 mm, inodoro 110 mm)
  - Si `obra` flow: prueba de presión documentada en `execution_trace`

Se invoca después de `quote-builder` (sobre `work_plan`) y de nuevo después
de `execute_log` (sobre `execution_trace`).
