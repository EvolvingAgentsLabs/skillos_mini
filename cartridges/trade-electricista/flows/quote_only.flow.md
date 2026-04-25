# Flow: quote_only (electricista)

Standalone quote-without-execution flow. Used when the trade does a
"presupuesto a domicilio" — visits, photographs, sends a quote, and the work
itself happens on a separate visit (or never, if the quote isn't accepted).

## Sequence

| # | Agent              | needs                | produces             |
|---|--------------------|----------------------|----------------------|
| 1 | vision-diagnoser   | photo_set            | diagnosis            |
| 2 | quote-builder      | diagnosis            | work_plan, quote     |

After step 2 the trade reviews + edits the quote, the shell renders the PDF,
and `ShareProvider.sharePDF` opens the system sheet (WhatsApp default).

If the client later approves and the trade returns to do the work, they
re-open the saved job and run the `intervention` flow which inherits the
same `photo_set` and `diagnosis` from this run.

## Validators

- `compliance_checker.py` — runs on `work_plan` if generated, no-op otherwise.
- `repair_safety.py` — runs on `work_plan` if generated.
