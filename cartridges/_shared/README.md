# `_shared/` — common schemas and agents across trade-* cartridges

Per `CLAUDE.md` §6.1 and §6.2, the trade cartridges (electricista, plomero,
pintor, …) share data contracts so that the runtime can reuse vision,
diagnosis, planning, quoting, and reporting infrastructure across trades.

## Schemas

`schemas/` holds JSON Schema draft-07 contracts that any trade cartridge can
reference from its `cartridge.yaml`'s `blackboard_schema`:

| Schema                       | Produced by                  |
|------------------------------|------------------------------|
| `photo_set.schema.json`      | PhotoCapture component       |
| `diagnosis.schema.json`      | `vision-diagnoser` agent     |
| `work_plan.schema.json`      | downstream of diagnosis      |
| `execution_trace.schema.json`| during job execution         |
| `quote.schema.json`          | `quote-builder` agent        |
| `client_report.schema.json`  | `report-composer` agent      |

## Agents

`agents/` holds prompt templates that any trade cartridge can re-export by
copying or symlinking. They expect the trade-specific data files
(`materials_uy.json`, `labor_rates_uy.json`, etc.) to be injected as variables
by the runtime.

| Agent                       | Reads                  | Writes              |
|-----------------------------|------------------------|---------------------|
| `vision-diagnoser.md`       | `photo_set`            | `diagnosis`         |
| `quote-builder.md`          | `diagnosis`, materials | `work_plan`,`quote` |
| `report-composer.md`        | full blackboard        | `client_report`     |
| `client-message-writer.md`  | `diagnosis`,`work_plan`| short message       |

## How trade cartridges consume `_shared/`

Until the cartridge runtime supports cross-cartridge schema references
natively, each trade cartridge **copies** the relevant schemas/agents into
its own folder and references them locally. The `$id` in the schema makes
the canonical source obvious. When the runtime gains shared-schema support,
the trade cartridges drop their copies and reference `_shared/` instead.
