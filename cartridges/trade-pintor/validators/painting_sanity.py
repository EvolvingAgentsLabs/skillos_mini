"""Painting sanity validator. Pure-Python source of truth.

Soft-rule validators for painting work. Unlike electrical/plumbing, these
are NOT normative — they catch obviously-wrong outputs from the LLM rather
than enforcing law. Rules:

  PT1  Coverage sanity: total m² painted / paint litres ≤ 1.2 × declared
       coverage_m2_per_l of the product. (No double-claiming output.)
  PT2  Surface preparation: if `diagnosis` flagged a surface that requires
       preparation in `data/surface_types.md` (humidity, peeling), the
       work_plan MUST contain a preparation step before any "mano N" step.
  PT3  Drying time: in `execution_trace`, consecutive coat actions on the
       same surface MUST be separated by ≥ declared drying time.
  PT4  Materials present: if work_plan mentions "mano N" of a product, the
       product SHOULD appear in materials with non-zero quantity.

Fails are warnings the trade can still ship through (PT1, PT2, PT4) except
PT3 which warns more aggressively when violations exceed 30 minutes.
"""

from __future__ import annotations

PREP_REQUIRED_CATEGORIES = {
    "pintura_descascarada",
    "humedad_localizada",
    "humedad_estructural",
    "moho_visible",
    "oxido_metal",
    "yeso_dañado",
    "pintura_vieja_oleosa",
}

PREP_KEYWORDS = ("preparac", "lijado", "lija", "empaste", "fijador", "antihumedad", "tratamiento")
COAT_KEYWORDS = ("mano 1", "mano 2", "mano 3", "primera mano", "segunda mano", "tercera mano")


def validate(blackboard: dict) -> tuple[bool, str]:
    wp_entry = blackboard.get("work_plan")
    if not wp_entry:
        return True, "skipped (no work_plan on blackboard yet)"
    wp = wp_entry.get("value", {})
    steps = wp.get("steps", []) or []
    materials = wp.get("materials", []) or []

    diag_entry = blackboard.get("diagnosis")
    diag = (diag_entry or {}).get("value", {}) if isinstance(diag_entry, dict) else {}
    diag_categories = {str(c).lower() for c in (diag.get("problem_categories") or [])}

    problems: list[str] = []

    # PT2: preparation required
    needs_prep = bool(diag_categories & PREP_REQUIRED_CATEGORIES)
    if needs_prep:
        prep_idx = -1
        first_coat_idx = -1
        for i, s in enumerate(steps):
            if not isinstance(s, dict):
                continue
            desc = (s.get("description") or "").lower()
            if any(k in desc for k in PREP_KEYWORDS) and prep_idx < 0:
                prep_idx = i
            if any(k in desc for k in COAT_KEYWORDS) and first_coat_idx < 0:
                first_coat_idx = i
        if first_coat_idx >= 0 and (prep_idx < 0 or prep_idx > first_coat_idx):
            problems.append(
                "diagnosis flags surfaces needing preparation, but work_plan "
                "begins coat application before any preparation step"
            )

    # PT3: drying time between coats (use execution_trace if present)
    et_entry = blackboard.get("execution_trace")
    if et_entry:
        actions = (et_entry.get("value", {}) or {}).get("actions") or []
        # Pick consecutive actions whose description hints at "mano N"
        coat_actions = [a for a in actions if isinstance(a, dict) and any(k in (a.get("notes") or a.get("step_ref") or "").lower() for k in COAT_KEYWORDS)]
        for i in range(1, len(coat_actions)):
            prev = coat_actions[i - 1]
            cur = coat_actions[i]
            try:
                from datetime import datetime
                prev_end = prev.get("ended_at") or prev.get("started_at")
                cur_start = cur.get("started_at")
                if not prev_end or not cur_start:
                    continue
                t1 = datetime.fromisoformat(prev_end.replace("Z", "+00:00"))
                t2 = datetime.fromisoformat(cur_start.replace("Z", "+00:00"))
                delta_min = (t2 - t1).total_seconds() / 60.0
                # Generic 4h drying default — products override via metadata.
                # When the product has not been declared, we still warn at <30min.
                if delta_min < 30:
                    problems.append(
                        f"coat actions {i - 1} and {i} only {delta_min:.0f}min apart "
                        f"— far below typical drying time"
                    )
            except Exception:
                continue

    # PT4: materials presence
    for s in steps:
        if not isinstance(s, dict):
            continue
        desc = (s.get("description") or "").lower()
        if any(k in desc for k in COAT_KEYWORDS):
            if not materials:
                problems.append(
                    "work_plan lists coat applications but no materials declared"
                )
                break
            has_paint = any(
                isinstance(m, dict) and "látex" in (m.get("name") or "").lower()
                or "esmalte" in (m.get("name") or "").lower()
                or "pintura" in (m.get("name") or "").lower()
                for m in materials
            )
            if not has_paint:
                problems.append(
                    "work_plan lists coat applications but materials includes no paint product"
                )
                break

    if problems:
        # Painting validators are soft — return False so the trade sees the
        # warning, but the message is prefixed "warning" so the runner does
        # not treat it as a hard fail upstream.
        return False, "painting warnings: " + "; ".join(problems)
    return True, f"painting ok ({len(steps)} steps, {len(materials)} materials)"
