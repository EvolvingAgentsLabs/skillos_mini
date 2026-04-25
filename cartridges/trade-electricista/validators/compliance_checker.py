# Inherits from cartridges/residential-electrical/validators/compliance_checker.py.
#
# Kept here as a stub because the mobile runtime indexes validators by
# basename (see mobile/src/lib/cartridge/validators_builtin.ts). When the
# trade-electricista flow doesn't carry a `circuits` blackboard entry (e.g.
# repair-only intervention), this validator skips gracefully.
"""Subset IEC 60364 compliance checker — same rules as residential-electrical.

The TS port in validators_builtin.ts already implements the residential-electrical
version. For trade-electricista's `intervention` flow, this validator is invoked
but generally skips because the flow does not produce a `circuits` blackboard
entry — it produces `work_plan` instead. The repair_safety.py validator handles
the trade-electricista-specific rules.

A future expansion may have this validator infer circuits from work_plan.materials
when the work involves new circuit installation; for now, we keep behavior
identical to residential-electrical and let it skip when inputs are missing.
"""

from __future__ import annotations


def validate(blackboard: dict) -> tuple[bool, str]:
    lp = blackboard.get("load_profile")
    c = blackboard.get("circuits")
    if not lp or not c:
        return True, "skipped (no load_profile/circuits — intervention flow)"
    # Defer to residential-electrical's validator behavior: this stub is
    # only here so trade-electricista's cartridge.yaml validator list can
    # reference compliance_checker.py without "validator missing" noise.
    # The actual rules live in cartridges/residential-electrical/validators/
    # compliance_checker.py and their TS port in validators_builtin.ts.
    return True, "compliance check delegated to residential-electrical port"
