---
id: plomero_index
title: Plomero — ruteo
purpose: Tomar la intención del usuario y rutearla al flujo correspondiente (urgencia vs obra).
entry_intents:
  - plomero
  - plomería
  - desagüe
  - pérdida
  - obra sanitaria

routes:
  - intent: "vine a un desagüe tapado o una pérdida — atender ya"
    next: desague_obstruido
  - intent: "obra sanitaria nueva o reforma — presupuestar primero"
    next: quote_build
  - intent: "ya hice el trabajo, cobrar"
    next: quote_build

next_candidates:
  - desague_obstruido
  - quote_build

confidence: 1.0
---

# Plomero — ruteo

Decidí en qué flujo estás:

| Situación | Próximo paso |
|---|---|
| Llamada de urgencia (desagüe, pérdida, sin agua) | [`desague_obstruido`](#desague_obstruido) o equivalente |
| Obra nueva o reforma planificada | [`quote_build`](#quote_build) |
| Trabajo terminado, armar el quote para cobrar | [`quote_build`](#quote_build) |

## Verificación de pertenencia

Antes de avanzar, confirmá que es plomería:

- **Olor a gas** → NO es plomero. Salir con `out_of_scope` y derivar a
  especialista de gas. NUNCA encender luces ni interruptores cerca.
- **Humedad en pared cerca de tomas eléctricas** → puede ser ambos.
  Resolver el lado de plomero (cortar el agua, reparar) y derivar a
  electricista para revisar circuitos comprometidos.
- **Mancha de humedad en techo** → puede ser plomero (cañería arriba) o
  estructural (filtración exterior). Confirmar antes de cotizar.
