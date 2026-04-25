/**
 * TS ports of the Python validators shipped under
 * C:\evolvingagents\skillos\cartridges\cooking\validators\.
 *
 * The mobile runner cannot exec `.py` files; it looks up validators by
 * filename in this registry instead. Cartridges that declare validators not
 * listed here get a "validator missing" message — parity with the Python
 * behaviour when a .py file cannot be imported.
 */

import type { BlackboardSnapshot, ValidationResult } from "./types";

export type BuiltinValidator = (bb: BlackboardSnapshot) => ValidationResult;

// ────────────────────────────────────────────────────────────────────────
// cooking/validators/menu_complete.py
// ────────────────────────────────────────────────────────────────────────

const REQUIRED_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const menuComplete: BuiltinValidator = (bb) => {
  const menuEntry = bb.weekly_menu;
  if (!menuEntry) return { ok: false, message: "weekly_menu missing from blackboard" };
  const menu = menuEntry.value;
  if (!isObject(menu)) return { ok: false, message: "weekly_menu is not an object" };

  const days = Array.isArray(menu.days) ? (menu.days as unknown[]) : [];
  if (days.length !== 7) {
    return { ok: false, message: `weekly_menu must have 7 days, got ${days.length}` };
  }
  const seen = new Set<string>();
  for (const d of days) if (isObject(d)) seen.add(String(d.day ?? ""));
  const missing = REQUIRED_DAYS.filter((d) => !seen.has(d));
  if (missing.length) {
    return { ok: false, message: `missing days: ${JSON.stringify(missing)}` };
  }
  for (const d of days) {
    if (!isObject(d)) continue;
    const meals = Array.isArray(d.meals) ? (d.meals as unknown[]) : [];
    const slots = new Set<string>();
    for (const m of meals) if (isObject(m) && typeof m.slot === "string") slots.add(m.slot);
    const required = new Set(["breakfast", "lunch", "dinner"]);
    const diff = [...required].filter((s) => !slots.has(s));
    if (diff.length) {
      return {
        ok: false,
        message: `day '${String(d.day)}' missing slots: ${JSON.stringify(diff)}`,
      };
    }
  }

  const recipesEntry = bb.recipes;
  if (recipesEntry) {
    const recipes = recipesEntry.value;
    if (!Array.isArray(recipes) || recipes.length !== 7) {
      return {
        ok: false,
        message: `recipes must be a list of 7, got ${Array.isArray(recipes) ? recipes.length : "non-list"}`,
      };
    }
    const recipeDays = new Set<string>();
    for (const r of recipes) if (isObject(r)) recipeDays.add(String(r.day ?? ""));
    const menuDays = seen;
    const notIn = [...recipeDays].filter((d) => !menuDays.has(d));
    if (notIn.length) {
      return {
        ok: false,
        message: `recipes reference days not in weekly_menu: ${JSON.stringify(notIn)}`,
      };
    }
  }

  return { ok: true, message: "weekly_menu has all 7 days × 3 slots" };
};

// ────────────────────────────────────────────────────────────────────────
// cooking/validators/shopping_list_sane.py
// ────────────────────────────────────────────────────────────────────────

const REQUIRED_AISLES = ["produce", "dairy", "pantry", "protein", "other"];

const shoppingListSane: BuiltinValidator = (bb) => {
  const entry = bb.shopping_list;
  if (!entry) {
    return {
      ok: true,
      message: "skipped (no shopping_list on blackboard — flow may omit it)",
    };
  }
  const sl = entry.value;
  if (!isObject(sl)) return { ok: false, message: "shopping_list is not an object" };
  const aisles = sl.aisles;
  if (!isObject(aisles)) {
    return { ok: false, message: "shopping_list.aisles must be an object" };
  }
  const missing = REQUIRED_AISLES.filter((a) => !(a in aisles));
  if (missing.length) {
    return { ok: false, message: `missing aisles: ${JSON.stringify(missing)}` };
  }
  let total = 0;
  for (const a of REQUIRED_AISLES) {
    const list = aisles[a];
    if (Array.isArray(list)) total += list.length;
  }
  if (total < 5) {
    return {
      ok: true,
      message: `warning: only ${total} items across all aisles — suspiciously thin list`,
    };
  }
  return {
    ok: true,
    message: `shopping_list ok (${total} items across ${REQUIRED_AISLES.length} aisles)`,
  };
};

// ────────────────────────────────────────────────────────────────────────
// trade-electricista/validators/repair_safety.py
// ────────────────────────────────────────────────────────────────────────

const WET_ROOMS = new Set([
  "kitchen", "bathroom", "wc", "laundry", "washroom", "utility",
  "cocina", "baño", "bano", "lavadero",
]);

const DANGEROUS_DESCRIPTORS = [
  "tablero principal",
  "acometida",
  "circuito troncal",
  "nuevo circuito",
  "main panel",
  "service entrance",
];

const LIVE_CIRCUIT_VERBS = [
  "reemplaz",
  "instal",
  "agregar",
  "colocar",
  "conectar",
  "cambiar",
  "modificar",
  "intervenir",
];

const repairSafety: BuiltinValidator = (bb) => {
  const wpEntry = bb.work_plan;
  if (!wpEntry) return { ok: true, message: "skipped (no work_plan on blackboard yet)" };
  const wp = isObject(wpEntry.value) ? wpEntry.value : {};
  const stepsRaw = wp.steps;
  if (!Array.isArray(stepsRaw)) {
    return { ok: false, message: "work_plan.steps is not a list" };
  }
  const steps = stepsRaw as Record<string, unknown>[];

  const problems: string[] = [];

  // RS1: live-circuit verb without power_off_documented
  for (const step of steps) {
    if (!isObject(step)) continue;
    const sid = String(step.id ?? "?");
    const desc = String(step.description ?? "").toLowerCase();
    const preconds = new Set(asStringArrayLite(step.safety_preconditions));
    if (LIVE_CIRCUIT_VERBS.some((v) => desc.includes(v))) {
      if (!preconds.has("power_off_documented")) {
        problems.push(
          `${sid}: step modifies a live circuit but is missing \`power_off_documented\` in safety_preconditions`,
        );
      }
    }
  }

  // RS2: wet room ⇒ rcd_post_repair somewhere
  const diagEntry = bb.diagnosis;
  const diag = diagEntry && isObject(diagEntry.value) ? diagEntry.value : {};
  const diagSummary = String(diag.summary ?? "").toLowerCase();
  const diagCategories = asStringArrayLite(diag.problem_categories).map((c) => c.toLowerCase());
  let touchesWetRoom = false;
  for (const room of WET_ROOMS) if (diagSummary.includes(room)) touchesWetRoom = true;
  if (diagCategories.includes("sin_rcd_ambiente_humedo")) touchesWetRoom = true;

  if (touchesWetRoom) {
    const hasRcdStep = steps.some((s) =>
      isObject(s) && asStringArrayLite(s.safety_preconditions).includes("rcd_post_repair"),
    );
    if (!hasRcdStep) {
      problems.push(
        "diagnosis touches a wet room but no step has `rcd_post_repair` in safety_preconditions",
      );
    }
  }

  // RS3: dangerous-descriptor work ⇒ requires_matriculated_professional
  const needsMatric = steps.some((s) => {
    if (!isObject(s)) return false;
    const desc = String(s.description ?? "").toLowerCase();
    return DANGEROUS_DESCRIPTORS.some((d) => desc.includes(d));
  });
  const declaresMatric = wp.requires_matriculated_professional === true;
  if (needsMatric && !declaresMatric) {
    problems.push(
      "work_plan touches main panel / acometida but requires_matriculated_professional is not true",
    );
  }

  // RS4: completed action with power_off_documented step needs notes
  const etEntry = bb.execution_trace;
  if (etEntry && isObject(etEntry.value)) {
    const actions = Array.isArray(etEntry.value.actions) ? (etEntry.value.actions as unknown[]) : [];
    const stepById = new Map<string, Record<string, unknown>>();
    for (const s of steps) {
      if (isObject(s) && s.id) stepById.set(String(s.id), s);
    }
    for (const a of actions) {
      if (!isObject(a)) continue;
      if (a.outcome !== "completed") continue;
      const ref = String(a.step_ref ?? "");
      const step = stepById.get(ref);
      if (!step) continue;
      const preconds = new Set(asStringArrayLite(step.safety_preconditions));
      if (preconds.has("power_off_documented")) {
        const notes = String(a.notes ?? "").trim();
        if (!notes) {
          problems.push(`${ref}: action marked completed but no notes documenting the power-off`);
        }
      }
    }
  }

  if (problems.length > 0) {
    return { ok: false, message: "repair safety violations: " + problems.join("; ") };
  }
  return {
    ok: true,
    message: `repair safety ok (${steps.length} steps, wet_room=${touchesWetRoom})`,
  };
};

// ────────────────────────────────────────────────────────────────────────
// trade-electricista/validators/compliance_checker.py — stub for trade flow
// (full IEC 60364 logic lives below for residential-electrical)
// ────────────────────────────────────────────────────────────────────────

const complianceCheckerTradeStub: BuiltinValidator = (bb) => {
  // The trade-electricista intervention flow does not produce circuits;
  // skip gracefully. The repair_safety validator covers the trade rules.
  if (!bb.load_profile || !bb.circuits) {
    return { ok: true, message: "skipped (no load_profile/circuits — trade-electricista intervention flow)" };
  }
  // Fall through to the original residential-electrical logic if both are present.
  return complianceCheckerResidentialElectrical(bb);
};

// ────────────────────────────────────────────────────────────────────────
// residential-electrical/validators/compliance_checker.py — TS port
// ────────────────────────────────────────────────────────────────────────

const RES_WET_ROOMS = new Set([
  "kitchen", "bathroom", "wc", "laundry", "washroom", "utility",
]);

const WIRE_FOR_BREAKER: Record<number, number> = {
  6: 1.0,
  10: 1.5,
  13: 1.5,
  16: 2.5,
  20: 4,
  25: 6,
  32: 6,
  40: 10,
  50: 16,
  63: 16,
};

const complianceCheckerResidentialElectrical: BuiltinValidator = (bb) => {
  const lpEntry = bb.load_profile;
  const cEntry = bb.circuits;
  if (!lpEntry || !cEntry) {
    return { ok: false, message: "need both load_profile and circuits on blackboard" };
  }
  const lp = isObject(lpEntry.value) ? lpEntry.value : {};
  const circuits = Array.isArray(cEntry.value) ? (cEntry.value as Record<string, unknown>[]) : [];
  const voltage = Number(lp.voltage_v ?? 230);

  const loads = new Map<string, Record<string, unknown>>();
  const rooms = Array.isArray(lp.rooms) ? (lp.rooms as Record<string, unknown>[]) : [];
  for (const room of rooms) {
    if (!isObject(room)) continue;
    const rname = String(room.name ?? "").toLowerCase();
    const roomLoads = Array.isArray(room.loads) ? (room.loads as Record<string, unknown>[]) : [];
    for (const load of roomLoads) {
      if (!isObject(load)) continue;
      const key = `${rname}/${String(load.appliance ?? "")}`;
      loads.set(key, { ...load, room: rname });
    }
  }

  const problems: string[] = [];
  for (const c of circuits) {
    if (!isObject(c)) continue;
    const cid = String(c.id ?? "?");
    const breaker = Number(c.breaker_a);
    const wire = c.wire_mm2 == null ? null : Number(c.wire_mm2);
    const ctype = String(c.type ?? "");

    const requiredWire = WIRE_FOR_BREAKER[breaker];
    if (requiredWire == null) {
      problems.push(`${cid}: unknown breaker rating ${breaker} A`);
    } else if (wire == null || wire < requiredWire) {
      problems.push(
        `${cid}: wire ${wire} mm² too small for ${breaker} A (need ≥ ${requiredWire} mm²)`,
      );
    }

    const cLoads = Array.isArray(c.loads) ? (c.loads as unknown[]).map(String) : [];
    if (ctype === "dedicated" && cLoads.length !== 1) {
      problems.push(`${cid}: dedicated circuit must have exactly one load`);
    }

    for (const lref of cLoads) {
      const room = lref.split("/", 1)[0]!.toLowerCase();
      if (RES_WET_ROOMS.has(room) && !c.rcd) {
        problems.push(`${cid}: serves wet room '${room}' but rcd=false (RCD 30 mA required)`);
        break;
      }
    }

    let totalW = 0;
    for (const lref of cLoads) {
      const rec = loads.get(lref.toLowerCase());
      if (rec) totalW += Number(rec.watts ?? 0);
    }
    if (totalW > 0) {
      const iAmps = totalW / voltage;
      const requiredBreaker = iAmps * 1.25;
      if (breaker && breaker < requiredBreaker) {
        problems.push(
          `${cid}: breaker ${breaker} A insufficient for ${totalW} W @ ${voltage} V (need ≥ ${requiredBreaker.toFixed(1)} A)`,
        );
      }
    }
  }
  if (problems.length > 0) {
    return { ok: false, message: "IEC 60364 violations: " + problems.join("; ") };
  }
  return { ok: true, message: `compliance ok (${circuits.length} circuits checked)` };
};

// ────────────────────────────────────────────────────────────────────────
// trade-plomero/validators/plumbing_checker.py
// ────────────────────────────────────────────────────────────────────────

const MIN_DIAMETERS_MM: Record<string, number> = {
  lavabo: 40,
  lavatorio: 40,
  ducha: 50,
  shower: 50,
  inodoro: 110,
  wc: 110,
  toilet: 110,
  bidet: 40,
  lavadero: 50,
};

// All keywords are stored post-deaccent so a single deaccent() at compare
// time covers both haystack and needle.
const LIVE_WATER_KEYWORDS = ["caneria", "presion", "abrir paso", "reemplaz"];
const DRAIN_KEYWORDS = ["desague", "drain"];
const NEW_PIPE_KEYWORDS = ["caneria nueva", "new pipe", "instalacion nueva"];

const plumbingChecker: BuiltinValidator = (bb) => {
  const wpEntry = bb.work_plan;
  if (!wpEntry) return { ok: true, message: "skipped (no work_plan on blackboard yet)" };
  const wp = isObject(wpEntry.value) ? wpEntry.value : {};
  const steps = Array.isArray(wp.steps) ? (wp.steps as Record<string, unknown>[]) : [];
  const materials = Array.isArray(wp.materials) ? (wp.materials as Record<string, unknown>[]) : [];

  const problems: string[] = [];

  // P1: drain slope
  for (const s of steps) {
    if (!isObject(s)) continue;
    const sid = String(s.id ?? "?");
    const desc = deaccent(String(s.description ?? ""));
    const slopePct = s.slope_pct;
    if (DRAIN_KEYWORDS.some((k) => desc.includes(k)) && slopePct != null) {
      const n = Number(slopePct);
      if (Number.isFinite(n)) {
        if (n < 1.0) problems.push(`${sid}: drain slope ${n}% < 1.0% minimum`);
      } else {
        problems.push(`${sid}: slope_pct must be a number`);
      }
    }
  }

  // P2: fixture diameters
  for (const m of materials) {
    if (!isObject(m)) continue;
    const name = String(m.name ?? "").toLowerCase();
    const diameter = m.diameter_mm == null ? null : Number(m.diameter_mm);
    if (diameter == null || !Number.isFinite(diameter)) continue;
    for (const [fixture, minDia] of Object.entries(MIN_DIAMETERS_MM)) {
      if (name.includes(fixture) && diameter < minDia) {
        problems.push(
          `material '${String(m.name ?? "?")}' diameter ${diameter}mm < ${minDia}mm minimum for ${fixture}`,
        );
      }
    }
  }

  // P3: pressure test for new pipes. We look for unambiguous pressure-TEST
  // evidence — "prueba de presión", "pressure test", or the explicit
  // `pressure_test_documented` precondition. Mentioning "cañería de
  // presión" (pressure pipe — describing the pipe type) does NOT count.
  const hasNewPipe = steps.some((s) =>
    isObject(s) && NEW_PIPE_KEYWORDS.some((k) => deaccent(String(s.description ?? "")).includes(k)),
  );
  if (hasNewPipe) {
    const isPressureTestEvidence = (text: string): boolean => {
      const t = deaccent(text);
      return (
        t.includes("prueba de presion") ||
        t.includes("pressure test") ||
        t.includes("test de presion")
      );
    };
    const evidenceInSteps = steps.some((s) => {
      if (!isObject(s)) return false;
      const preconds = new Set(asStringArrayLite(s.safety_preconditions));
      if (preconds.has("pressure_test_documented")) return true;
      return isPressureTestEvidence(String(s.description ?? ""));
    });
    let evidenceInTrace = false;
    const etEntry = bb.execution_trace;
    if (etEntry && isObject(etEntry.value)) {
      const actions = Array.isArray(etEntry.value.actions) ? (etEntry.value.actions as Record<string, unknown>[]) : [];
      evidenceInTrace = actions.some((a) => {
        if (!isObject(a)) return false;
        return isPressureTestEvidence(String(a.notes ?? ""));
      });
    }
    if (!evidenceInSteps && !evidenceInTrace) {
      problems.push("work_plan installs new pipe but no pressure-test evidence in steps or execution_trace");
    }
  }

  // P4: live-water work without water_main_closed
  for (const s of steps) {
    if (!isObject(s)) continue;
    const sid = String(s.id ?? "?");
    const desc = deaccent(String(s.description ?? ""));
    const preconds = new Set(asStringArrayLite(s.safety_preconditions));
    if (LIVE_WATER_KEYWORDS.some((k) => desc.includes(k))) {
      if (!preconds.has("water_main_closed")) {
        problems.push(
          `${sid}: step touches pressurized water but missing \`water_main_closed\` in safety_preconditions`,
        );
      }
    }
  }

  if (problems.length > 0) {
    return { ok: false, message: "plumbing violations: " + problems.join("; ") };
  }
  return { ok: true, message: `plumbing ok (${steps.length} steps)` };
};

// ────────────────────────────────────────────────────────────────────────
// trade-pintor/validators/painting_sanity.py
// ────────────────────────────────────────────────────────────────────────

const PREP_REQUIRED = new Set([
  "pintura_descascarada",
  "humedad_localizada",
  "humedad_estructural",
  "moho_visible",
  "oxido_metal",
  "yeso_dañado",
  "pintura_vieja_oleosa",
]);

const PREP_KEYWORDS = ["preparac", "lijado", "lija", "empaste", "fijador", "antihumedad", "tratamiento"];
const COAT_KEYWORDS = ["mano 1", "mano 2", "mano 3", "primera mano", "segunda mano", "tercera mano"];

const paintingSanity: BuiltinValidator = (bb) => {
  const wpEntry = bb.work_plan;
  if (!wpEntry) return { ok: true, message: "skipped (no work_plan on blackboard yet)" };
  const wp = isObject(wpEntry.value) ? wpEntry.value : {};
  const steps = Array.isArray(wp.steps) ? (wp.steps as Record<string, unknown>[]) : [];
  const materials = Array.isArray(wp.materials) ? (wp.materials as Record<string, unknown>[]) : [];

  const diagEntry = bb.diagnosis;
  const diag = diagEntry && isObject(diagEntry.value) ? diagEntry.value : {};
  const diagCats = new Set(asStringArrayLite(diag.problem_categories).map((c) => c.toLowerCase()));

  const problems: string[] = [];

  // PT2: preparation step before coats
  let needsPrep = false;
  for (const c of diagCats) if (PREP_REQUIRED.has(c)) needsPrep = true;
  if (needsPrep) {
    let prepIdx = -1;
    let firstCoatIdx = -1;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!isObject(s)) continue;
      const desc = String(s.description ?? "").toLowerCase();
      if (prepIdx < 0 && PREP_KEYWORDS.some((k) => desc.includes(k))) prepIdx = i;
      if (firstCoatIdx < 0 && COAT_KEYWORDS.some((k) => desc.includes(k))) firstCoatIdx = i;
    }
    if (firstCoatIdx >= 0 && (prepIdx < 0 || prepIdx > firstCoatIdx)) {
      problems.push(
        "diagnosis flags surfaces needing preparation, but work_plan begins coat application before any preparation step",
      );
    }
  }

  // PT3: drying time between coats (use execution_trace)
  const etEntry = bb.execution_trace;
  if (etEntry && isObject(etEntry.value)) {
    const actions = Array.isArray(etEntry.value.actions) ? (etEntry.value.actions as Record<string, unknown>[]) : [];
    const coatActions = actions.filter((a) => {
      if (!isObject(a)) return false;
      const hay = `${String(a.notes ?? "")} ${String(a.step_ref ?? "")}`.toLowerCase();
      return COAT_KEYWORDS.some((k) => hay.includes(k));
    });
    for (let i = 1; i < coatActions.length; i++) {
      const prev = coatActions[i - 1];
      const cur = coatActions[i];
      const prevEnd = String(prev.ended_at ?? prev.started_at ?? "");
      const curStart = String(cur.started_at ?? "");
      if (!prevEnd || !curStart) continue;
      const t1 = Date.parse(prevEnd);
      const t2 = Date.parse(curStart);
      if (!Number.isFinite(t1) || !Number.isFinite(t2)) continue;
      const deltaMin = (t2 - t1) / 60000;
      if (deltaMin < 30) {
        problems.push(
          `coat actions ${i - 1} and ${i} only ${deltaMin.toFixed(0)}min apart — far below typical drying time`,
        );
      }
    }
  }

  // PT4: materials presence
  const hasCoatStep = steps.some((s) =>
    isObject(s) && COAT_KEYWORDS.some((k) => String(s.description ?? "").toLowerCase().includes(k)),
  );
  if (hasCoatStep) {
    if (materials.length === 0) {
      problems.push("work_plan lists coat applications but no materials declared");
    } else {
      const hasPaint = materials.some((m) => {
        if (!isObject(m)) return false;
        const n = String(m.name ?? "").toLowerCase();
        return n.includes("látex") || n.includes("latex") || n.includes("esmalte") || n.includes("pintura");
      });
      if (!hasPaint) {
        problems.push("work_plan lists coat applications but materials includes no paint product");
      }
    }
  }

  if (problems.length > 0) {
    return { ok: false, message: "painting warnings: " + problems.join("; ") };
  }
  return { ok: true, message: `painting ok (${steps.length} steps, ${materials.length} materials)` };
};

// ────────────────────────────────────────────────────────────────────────

export const BUILTIN_VALIDATORS: Record<string, BuiltinValidator> = {
  "menu_complete.py": menuComplete,
  "menu_complete.ts": menuComplete,
  "shopping_list_sane.py": shoppingListSane,
  "shopping_list_sane.ts": shoppingListSane,

  // residential-electrical
  "compliance_checker.py": complianceCheckerTradeStub,
  "compliance_checker.ts": complianceCheckerTradeStub,

  // trade-electricista
  "repair_safety.py": repairSafety,
  "repair_safety.ts": repairSafety,

  // trade-plomero
  "plumbing_checker.py": plumbingChecker,
  "plumbing_checker.ts": plumbingChecker,

  // trade-pintor
  "painting_sanity.py": paintingSanity,
  "painting_sanity.ts": paintingSanity,
};

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asStringArrayLite(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) out.push(String(item));
  return out;
}

/**
 * Lowercase + strip combining diacritics so "presión" matches "presion".
 * Validators run over user-typed Spanish text; treating accents as
 * meaningful would force every keyword list to ship both variants.
 */
function deaccent(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
