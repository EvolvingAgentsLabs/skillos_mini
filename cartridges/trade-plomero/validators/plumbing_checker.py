"""Plumbing sanity validator. Pure-Python source of truth.

Rules:

  P1  Drain-slope: any work_plan step describing a desagüe/drain installation
      with a declared `slope_pct` field must have slope >= 1.0%.
  P2  Fixture diameters: if work_plan.materials includes pipes for known
      fixtures (lavabo, ducha, inodoro), enforce minimum diameter per
      Uruguay residential norms.
  P3  Pressure test required for `obra` flow: if work_plan exists with
      step description containing "cañería nueva"/"new pipe", at least one
      step or one execution_trace.action must mention pressure test.
  P4  Live-water work: any step that touches presurized water must list
      `water_main_closed` in safety_preconditions.

The mobile runtime executes a TS port keyed by this filename in
validators_builtin.ts.
"""

from __future__ import annotations

MIN_DIAMETERS_MM = {
    "lavabo": 40,
    "lavatorio": 40,
    "ducha": 50,
    "shower": 50,
    "inodoro": 110,
    "wc": 110,
    "toilet": 110,
    "bidet": 40,
    "lavadero": 50,
}

LIVE_WATER_KEYWORDS = (
    "cañeria",  # cañería
    "caneria",
    "presion",  # presión
    "abrir paso",
    "reemplaz",
)

DRAIN_KEYWORDS = ("desague", "desagüe", "drain")
NEW_PIPE_KEYWORDS = ("cañeria nueva", "caneria nueva", "new pipe", "instalación nueva")


def validate(blackboard: dict) -> tuple[bool, str]:
    wp_entry = blackboard.get("work_plan")
    if not wp_entry:
        return True, "skipped (no work_plan on blackboard yet)"
    wp = wp_entry.get("value", {})
    steps = wp.get("steps", []) or []

    problems: list[str] = []

    # P1: drain slope
    for s in steps:
        if not isinstance(s, dict):
            continue
        sid = s.get("id", "?")
        desc = (s.get("description") or "").lower()
        slope_pct = s.get("slope_pct")
        if any(k in desc for k in DRAIN_KEYWORDS) and slope_pct is not None:
            try:
                if float(slope_pct) < 1.0:
                    problems.append(
                        f"{sid}: drain slope {slope_pct}% < 1.0% minimum"
                    )
            except (TypeError, ValueError):
                problems.append(f"{sid}: slope_pct must be a number")

    # P2: fixture diameters
    materials = wp.get("materials", []) or []
    for m in materials:
        if not isinstance(m, dict):
            continue
        name = (m.get("name") or "").lower()
        diameter_mm = m.get("diameter_mm")
        if diameter_mm is None:
            continue
        for fixture, mindia in MIN_DIAMETERS_MM.items():
            if fixture in name:
                try:
                    if float(diameter_mm) < mindia:
                        problems.append(
                            f"material '{m.get('name')}' diameter "
                            f"{diameter_mm}mm < {mindia}mm minimum for {fixture}"
                        )
                except (TypeError, ValueError):
                    pass

    # P3: pressure test for new pipe (obra-style). We look for unambiguous
    # pressure-TEST evidence — "prueba de presión", "pressure test", or the
    # explicit `pressure_test_documented` precondition. Mentioning
    # "cañería de presión" (pipe type) does NOT count.
    import unicodedata

    def _deaccent(s: str) -> str:
        return "".join(
            c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn"
        )

    def _is_pressure_test_evidence(text: str) -> bool:
        t = _deaccent(text or "")
        return (
            "prueba de presion" in t
            or "pressure test" in t
            or "test de presion" in t
        )

    has_new_pipe = any(
        any(k in _deaccent(s.get("description") or "") for k in NEW_PIPE_KEYWORDS)
        for s in steps if isinstance(s, dict)
    )
    if has_new_pipe:
        evidence_in_steps = any(
            "pressure_test_documented" in (s.get("safety_preconditions") or [])
            or _is_pressure_test_evidence(s.get("description") or "")
            for s in steps if isinstance(s, dict)
        )
        et_entry = blackboard.get("execution_trace")
        evidence_in_trace = False
        if et_entry:
            for a in (et_entry.get("value", {}).get("actions") or []):
                if not isinstance(a, dict):
                    continue
                if _is_pressure_test_evidence(a.get("notes") or ""):
                    evidence_in_trace = True
                    break
        if not evidence_in_steps and not evidence_in_trace:
            problems.append(
                "work_plan installs new pipe but no pressure-test evidence "
                "in steps or execution_trace"
            )

    # P4: live-water work without water_main_closed
    for s in steps:
        if not isinstance(s, dict):
            continue
        sid = s.get("id", "?")
        desc = (s.get("description") or "").lower()
        preconds = set(s.get("safety_preconditions") or [])
        if any(k in desc for k in LIVE_WATER_KEYWORDS):
            if "water_main_closed" not in preconds:
                problems.append(
                    f"{sid}: step touches pressurized water but missing "
                    f"`water_main_closed` in safety_preconditions"
                )

    if problems:
        return False, "plumbing violations: " + "; ".join(problems)
    return True, f"plumbing ok ({len(steps)} steps)"
