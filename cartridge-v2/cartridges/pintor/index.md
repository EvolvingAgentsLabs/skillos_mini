---
id: pintor_index
title: Pintor — ruteo
purpose: Tomar la intención del usuario y rutearla al flujo (presupuesto vs ejecución).
entry_intents:
  - pintor
  - pintar
  - presupuesto pintura
  - cambio de color

routes:
  - intent: "vine a ver una obra para presupuestar"
    next: walkthrough_measure
  - intent: "presupuesto aprobado, voy a ejecutar"
    next: quote_build
  - intent: "trabajo terminado, agregar al portfolio y cobrar"
    next: quote_build

next_candidates:
  - walkthrough_measure
  - quote_build

confidence: 1.0
---

# Pintor — ruteo

| Situación | Próximo paso |
|---|---|
| Visita inicial al lugar — recorrer, medir, evaluar superficies | [`walkthrough_measure`](#walkthrough_measure) |
| Cliente aprobó, voy a comenzar | (no requiere paso explícito; ejecución se documenta con fotos durante) |
| Trabajo terminado, armar quote y reporte con portfolio | [`quote_build`](#quote_build) |

## Verificación de pertenencia

Antes de avanzar:

- **Humedad ascendente o filtración** → derivar al especialista de
  impermeabilización antes de pintar. Pintar sobre humedad activa garantiza
  que la mano se desprenda en semanas.
- **Yeso desprendido o grietas estructurales** → albañil primero, pintor
  después.
- **Superficie con asbesto sospechado** (techos antiguos, fibrocemento) →
  NO intervenir sin empresa habilitada. Documentá la sospecha y avisá al
  cliente por escrito.
