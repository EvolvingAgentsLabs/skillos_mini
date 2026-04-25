# Flow: trabajo (pintor)

Ejecución y documentación. Genera el portfolio automático que el pintor
usa para conseguir nuevos clientes — y por el que probablemente adopta la
app más allá del valor del PDF al cliente actual.

## Sequence

| # | Agent              | needs                      | produces            |
|---|--------------------|----------------------------|---------------------|
| 1 | vision-diagnoser   | photo_set                  | diagnosis           |
| 2 | quote-builder      | diagnosis                  | work_plan, quote    |
| 3 | report-composer    | full bb                    | client_report       |

## Inter-step: execución

Captura `during` por ambiente y por mano. La UX espera mucho menos
fotos por evento que en electricista/plomero (los pintores ya sacan
fotos durante el trabajo para Instagram), pero MÁS eventos: una foto al
final de cada mano, una al final de cada ambiente.

## Post-step: portfolio_compose (hook implícito)

Al cierre, además del `client_report`, el shell agrega el trabajo a la
biblioteca-modo-portfolio: par antes/después por ambiente con datos
técnicos (producto, manos, tiempo) — en grilla tipo Instagram.

## Validators

- `painting_sanity.py` — además de los chequeos del flow `presupuesto`,
  advierte si:
  - No hay foto `during` etiquetada como "preparación" cuando el plan
    declaraba preparación necesaria
  - Tiempo entre fotos consecutivas de manos del mismo ambiente es menor
    que el tiempo de secado declarado del producto
