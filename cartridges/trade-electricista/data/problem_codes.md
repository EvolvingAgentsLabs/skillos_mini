# Problem codes — trade-electricista

Canonical list of `problem_categories` codes the `vision-diagnoser` agent
uses. Validators reference these, and the report-composer surfaces them in
client-friendly language.

| Code                          | Severidad | Cuándo se aplica                                                      |
|-------------------------------|-----------|-----------------------------------------------------------------------|
| `cable_subdimensionado`       | 4         | Sección de cable < requerida para el breaker o la carga conectada     |
| `sin_rcd_ambiente_humedo`     | 5         | Cocina / baño / lavadero servidos por circuito sin RCD 30 mA          |
| `rcd_no_funcional`            | 5         | RCD presente pero no dispara con botón de prueba                       |
| `conexion_floja`              | 4         | Borne / terminal con holgura visible o marcas de recalentamiento      |
| `aislacion_danada`            | 4         | Aislación de cable agrietada, quemada o resecada                       |
| `circuito_dedicado_omitido`   | 3         | Carga >2 kW compartiendo circuito con otras cargas                     |
| `tablero_obsoleto`            | 3         | Tablero con fusibles cerámicos / sin diferencial                       |
| `toma_sin_tierra`             | 3         | Tomacorriente sin tercer borne (PAT) o PAT desconectada                |
| `toma_invertida`              | 2         | Polaridad invertida en tomacorriente                                   |
| `sobrecarga_visible`          | 4         | Múltiples cargas en una toma con marcas de calentamiento              |
| `canalizacion_inadecuada`     | 2         | Cable expuesto sin caño corrugado en zona transitada                   |
| `empalme_sin_borne`           | 3         | Conexiones torsionadas con cinta sin borne de empalme                  |
| `tablero_sin_identificar`     | 1         | Tablero funcional pero sin etiquetado de circuitos                     |
| `proteccion_diferencial_falta`| 4         | Tablero general sin protección diferencial para circuitos enchufes    |
| `iluminacion_subdimensionada` | 1         | Niveles de iluminación insuficientes (solo si cliente lo plantea)     |

## Convenciones

- Los códigos son **snake_case** y en español rioplatense.
- La severidad sugerida es típica — el agente la ajusta por contexto
  específico de la foto.
- Cuando hay más de un problema, listá TODOS los códigos aplicables.
- Si ninguno encaja, agregar el código a este archivo es preferible a
  inventarlo en el momento (los validadores se confunden).

## Mapeo a IEC 60364 (referencia)

- `sin_rcd_ambiente_humedo` ↔ IEC 60364-7-701 (locales con baño / ducha)
- `cable_subdimensionado` ↔ IEC 60364-5-52 + tabla de selección por breaker
- `toma_sin_tierra` ↔ IEC 60364-4-41 (protección por puesta a tierra)
