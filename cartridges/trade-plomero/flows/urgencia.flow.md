# Flow: urgencia (plomero)

Caso de uso: el cliente llama porque hay una pérdida / obstrucción /
artefacto roto. El plomero llega o pide foto antes de salir. Necesita
**diagnóstico vision-first**: "¿de dónde realmente viene la pérdida?
¿es presión o descarga? ¿de qué piso?" — para no romper en el lugar
equivocado y para poder gestionar la ansiedad del cliente entre visitas.

## Sequence

| # | Agent                  | needs                          | produces        |
|---|------------------------|--------------------------------|-----------------|
| 1 | vision-diagnoser       | photo_set                      | diagnosis       |
| 2 | client-message-writer  | diagnosis                      | client_message  |
| 3 | report-composer        | diagnosis, photo_set,          | client_report   |
|   |                        | execution_trace                |                 |

## Pre-step: capture

`photo_set` con `role: "before"` en 1-2 fotos rápidas (mancha, artefacto,
área del problema).

## Inter-step: client message

Después de step 2, el shell muestra el `client_message.text` con un botón
"Compartir por WhatsApp". El plomero lo manda mientras va a buscar
repuesto / coordina la próxima visita.

## Inter-step: execution

`execution_trace` se llena en el momento del arreglo. 1-3 fotos `during`
+ 1 foto `after` típicamente.

## Post-step validators

- `plumbing_checker.py` — diametros mínimos por artefacto, pendiente mínima
  en desagües, advertencia si presión declarada inusual.

## Por qué urgencia ≠ obra

En urgencia el cliente NO espera presupuesto formal — espera que se
solucione. Por eso este flow no genera `quote`: la facturación va a
`client_report` con materiales usados + horas.
