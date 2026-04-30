---
id: electricista_index
title: Electricista — ruteo de tarea
purpose: Tomar la intención del usuario y rutearla a la etapa correspondiente.
entry_intents:
  - electricista
  - trabajo eléctrico
  - presupuesto
  - falla
  - revisar instalación

routes:
  - intent: "vine a un trabajo y necesito diagnosticar el problema"
    next: diagnosis_index
  - intent: "ya diagnostiqué, hagamos el presupuesto"
    next: quote_build
  - intent: "el cliente aprobó, voy a ejecutar"
    next: execute_log
  - intent: "trabajo terminado, armemos el reporte para el cliente"
    next: report_compose
  - intent: "presupuestar sin diagnosticar (obra nueva, cambio planificado)"
    next: quote_build

next_candidates:
  - diagnosis_index
  - quote_build
  - execute_log
  - report_compose

confidence: 1.0
---

# Electricista — ruteo

Decidí en qué etapa estás antes de avanzar. La mayoría de las intervenciones
residenciales siguen el flujo:

```
diagnose → quote → (esperar aprobación) → execute → report
```

Pero también es válido entrar directo en `quote` (obra nueva sin diagnóstico
previo) o en `execute` (trabajo continuado de una sesión anterior).

## Cómo decidir

| Situación del usuario | Próximo paso |
|---|---|
| Llegó al trabajo, sacó fotos, no sabe todavía qué pasa | [`diagnosis_index`](#diagnosis_index) |
| Diagnóstico hecho, cliente espera la cotización | [`quote_build`](#quote_build) |
| Obra nueva o reforma con materiales conocidos, sin diagnosis | [`quote_build`](#quote_build) |
| Está en medio del trabajo, registrando avance | [`execute_log`](#execute_log) |
| Trabajo terminado, hay que cerrarlo formalmente | [`report_compose`](#report_compose) |

## Verificación de pertenencia

Antes de cualquier rutéo, confirmá que el trabajo es del oficio. Si el usuario
describe síntomas de plomería (presión baja, olor a gas), de pintura, o de
estructura (grietas, humedad de origen no eléctrico), salí del cartridge con
`out_of_scope` — el cartridge `plomero` o `pintor` corresponde.

Casos límite que SÍ son electricistas (a pesar de la apariencia):

- Humedad en pared cerca de tomas → riesgo de electrocución, CONFIRMAR antes
  de derivar a plomero.
- Calentamiento de tomas → SIEMPRE eléctrico (cable subdimensionado, conexión
  floja, sobrecarga).
- "Salta el térmico" → SIEMPRE eléctrico (sobrecorriente, falla a tierra).
