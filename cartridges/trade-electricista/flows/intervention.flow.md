# Flow: intervention (electricista)

Standard residential intervention loop: capture → diagnose → plan/quote →
execute → close → report. Optimized for the case where the trade arrives at
a house, looks at the problem, and walks the client through what needs to
happen — including a printable PDF the client can keep.

## Sequence

| # | Agent              | needs                          | produces                  |
|---|--------------------|--------------------------------|---------------------------|
| 1 | vision-diagnoser   | photo_set                      | diagnosis                 |
| 2 | quote-builder      | diagnosis                      | work_plan, quote          |
| 3 | report-composer    | diagnosis, work_plan,          | client_report             |
|   |                    | execution_trace, photo_set     |                           |

## Pre-step: capture

The shell captures `photo_set` via `MediaProvider.capturePhoto` before the
flow starts. `role` is auto-set to `before` for the first 1–N photos.

## Inter-step: client approval

After step 2, the trade-shell pauses for the trade to edit the quote and
share it with the client (WhatsApp / email). The flow only resumes once the
trade taps "Cliente aprobó" — the runtime persists everything to IndexedDB
in case the resume happens hours or days later.

## Inter-step: execution

After approval, the shell offers `during` photo capture and step-checkoff
against `work_plan.steps`. Each completed step appends an entry to
`execution_trace.actions`.

## Post-step validators

- `compliance_checker.py` — IEC 60364 subset (RCD on wet rooms, breaker/wire
  ratios, dedicated-circuit single-load, 25% breaker margin). Inherited from
  `residential-electrical/validators/compliance_checker.py`.
- `repair_safety.py` — repair-mode-specific rules. **The rules live in code,
  not in the LLM prompt.**

## Why this is safer than a single mega-prompt

- The LLM proposes problem categories, plan steps, and prose. It never
  computes wire gauges or decides "is this RCD-required" — those are
  deterministic table lookups in the validator.
- Validators run after every step that produces a relevant blackboard key.
  A failure surfaces to the trade immediately, with the rule reference,
  before the quote goes to the client.
