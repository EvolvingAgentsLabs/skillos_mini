"""Repair-safety validator for residential electrical interventions.

Pure-Python source of truth (the mobile runtime executes a TS port keyed
by this filename in `validators_builtin.ts`). Rules:

  RS1  Every step that modifies, replaces, or installs anything in a live
       circuit MUST list `power_off_documented` in `safety_preconditions`.
  RS2  Any work in a wet room (kitchen / bathroom / wc / laundry / utility)
       must include a step with `rcd_post_repair` in `safety_preconditions`
       that explicitly leaves an RCD 30 mA on the served circuit.
  RS3  `requires_matriculated_professional` MUST be true if `work_plan`
       includes any step with description matching tablero principal /
       acometida / nuevo circuito troncal.
  RS4  No execution_trace.action may have `outcome: "completed"` for a
       step whose `safety_preconditions` includes `power_off_documented`
       unless the action's `notes` field documents the cut-off (free-form,
       must be non-empty).

These are deliberately conservative — false positives cost the trade an
edit; false negatives cost the homeowner a fire.
"""

from __future__ import annotations

WET_ROOMS = {"kitchen", "bathroom", "wc", "laundry", "washroom", "utility", "cocina", "baño", "bano", "lavadero"}

DANGEROUS_DESCRIPTORS = (
    "tablero principal",
    "acometida",
    "circuito troncal",
    "nuevo circuito",
    "main panel",
    "service entrance",
)

LIVE_CIRCUIT_VERBS = (
    "reemplaz",   # reemplazar / reemplazo
    "instal",     # instalar / instalación
    "agregar",
    "colocar",
    "conectar",
    "cambiar",
    "modificar",
    "intervenir",
)


def validate(blackboard: dict) -> tuple[bool, str]:
    wp_entry = blackboard.get("work_plan")
    if not wp_entry:
        return True, "skipped (no work_plan on blackboard yet)"
    wp = wp_entry.get("value", {})
    steps = wp.get("steps", []) or []
    if not isinstance(steps, list):
        return False, "work_plan.steps is not a list"

    problems: list[str] = []

    # RS1
    for step in steps:
        if not isinstance(step, dict):
            continue
        sid = step.get("id", "?")
        desc = (step.get("description") or "").lower()
        preconds = set(step.get("safety_preconditions") or [])
        if any(verb in desc for verb in LIVE_CIRCUIT_VERBS):
            if "power_off_documented" not in preconds:
                problems.append(
                    f"{sid}: step modifies a live circuit but is missing "
                    f"`power_off_documented` in safety_preconditions"
                )

    # RS2
    diag_entry = blackboard.get("diagnosis")
    diag = (diag_entry or {}).get("value", {}) if isinstance(diag_entry, dict) else {}
    diag_summary = (diag.get("summary") or "").lower()
    diag_categories = [str(c).lower() for c in (diag.get("problem_categories") or [])]
    touches_wet_room = any(room in diag_summary for room in WET_ROOMS) or any(
        cat == "sin_rcd_ambiente_humedo" for cat in diag_categories
    )
    if touches_wet_room:
        has_rcd_step = any(
            "rcd_post_repair" in (s.get("safety_preconditions") or [])
            for s in steps
            if isinstance(s, dict)
        )
        if not has_rcd_step:
            problems.append(
                "diagnosis touches a wet room but no step has "
                "`rcd_post_repair` in safety_preconditions"
            )

    # RS3
    needs_matriculated = any(
        any(d in (s.get("description") or "").lower() for d in DANGEROUS_DESCRIPTORS)
        for s in steps
        if isinstance(s, dict)
    )
    declares_matriculated = bool(wp.get("requires_matriculated_professional"))
    if needs_matriculated and not declares_matriculated:
        problems.append(
            "work_plan touches main panel / acometida but "
            "requires_matriculated_professional is not true"
        )

    # RS4
    et_entry = blackboard.get("execution_trace")
    if et_entry:
        et = et_entry.get("value", {})
        actions = et.get("actions", []) or []
        step_by_id = {s.get("id"): s for s in steps if isinstance(s, dict)}
        for a in actions:
            if not isinstance(a, dict):
                continue
            if a.get("outcome") != "completed":
                continue
            ref = a.get("step_ref")
            step = step_by_id.get(ref)
            if not step:
                continue
            preconds = set(step.get("safety_preconditions") or [])
            if "power_off_documented" in preconds and not (a.get("notes") or "").strip():
                problems.append(
                    f"{ref}: action marked completed but no notes documenting "
                    f"the power-off"
                )

    if problems:
        return False, "repair safety violations: " + "; ".join(problems)
    return True, f"repair safety ok ({len(steps)} steps, wet_room={touches_wet_room})"
