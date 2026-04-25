# Flow: presupuesto (pintor)

Visita técnica → presupuesto rápido. La principal feature por la que el
pintor adopta la app: responder presupuestos en 2 horas en vez de 2 días
gana trabajos.

## Sequence

| # | Agent              | needs        | produces            |
|---|--------------------|--------------|---------------------|
| 1 | vision-diagnoser   | photo_set    | diagnosis           |
| 2 | quote-builder      | diagnosis    | work_plan, quote    |

## Pre-step: walkthrough

`photo_set` con N fotos por ambiente — el pintor camina las habitaciones
y captura ~3 fotos por ambiente (general + 2 detalles de superficies
distintas). El shell agrupa por timestamp + ubicación para inferir
"ambientes" sin pedirlo explícitamente.

## Diagnosis específica

`vision-diagnoser` calcula también:
- m² aproximados por ambiente (a partir de fotos + medida del pintor)
- estado de cada superficie (yeso, mampostería, hormigón, madera, metal)
- preparación necesaria por superficie

## Quote

`quote-builder` arma:
- Materiales: pintura por ambiente con marca + rendimiento m²/L de
  `data/paint_brands_uy.json`
- Mano de obra por m² según preparación necesaria
- Líneas separadas por ambiente para que el cliente entienda el desglose

## Validators

- `painting_sanity.py` — chequea cobertura razonable (no más de 1.2x el
  rendimiento declarado por marca), advierte si falta paso de preparación
  para superficies que lo requieren.
