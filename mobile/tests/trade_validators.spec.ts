/**
 * Tests for the trade-* validator TS ports added in
 * `src/lib/cartridge/validators_builtin.ts`. Each validator must have at
 * least 3 pass and 3 fail fixtures (CLAUDE.md §9.2).
 */

import { describe, expect, it } from "vitest";
import { BUILTIN_VALIDATORS } from "../src/lib/cartridge/validators_builtin";
import type { BlackboardSnapshot } from "../src/lib/cartridge/types";

function entry(value: unknown, schemaRef = "x.schema.json") {
  return {
    value,
    schema_ref: schemaRef,
    produced_by: "test",
    description: "",
    created_at: "2026-04-25T00:00:00.000Z",
  };
}

// ────────────────────────────────────────────────────────────────────────
// repair_safety.py (trade-electricista)
// ────────────────────────────────────────────────────────────────────────

describe("repair_safety validator", () => {
  const v = BUILTIN_VALIDATORS["repair_safety.py"];

  it("skips gracefully when no work_plan", () => {
    expect(v({}).ok).toBe(true);
  });

  it("passes a clean trivial plan", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [{ id: "S1", description: "Inspeccionar tablero (sin tocar)" }],
        requires_matriculated_professional: false,
      }),
    };
    expect(v(bb).ok).toBe(true);
  });

  it("passes a wet-room repair with rcd_post_repair declared", () => {
    const bb: BlackboardSnapshot = {
      diagnosis: entry({
        problem_categories: ["sin_rcd_ambiente_humedo"],
        summary: "Falta RCD en cocina",
      }),
      work_plan: entry({
        steps: [
          { id: "S1", description: "Cortar energía y verificar tensión", safety_preconditions: ["power_off_documented"] },
          { id: "S2", description: "Reemplazar cable subdimensionado", safety_preconditions: ["power_off_documented"] },
          { id: "S3", description: "Instalar RCD 30mA en circuito kitchen", safety_preconditions: ["power_off_documented", "rcd_post_repair"] },
        ],
        requires_matriculated_professional: true,
      }),
    };
    expect(v(bb).ok).toBe(true);
  });

  it("fails when a live-circuit step lacks power_off_documented", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [{ id: "S1", description: "Reemplazar cable de cocina" }],
      }),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/power_off_documented/);
  });

  it("fails wet-room work without rcd_post_repair anywhere", () => {
    const bb: BlackboardSnapshot = {
      diagnosis: entry({
        problem_categories: ["sin_rcd_ambiente_humedo"],
        summary: "Cocina sin RCD",
      }),
      work_plan: entry({
        steps: [
          { id: "S1", description: "Cortar energía y verificar", safety_preconditions: ["power_off_documented"] },
          { id: "S2", description: "Reemplazar cable", safety_preconditions: ["power_off_documented"] },
        ],
      }),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/rcd_post_repair/);
  });

  it("fails when tablero principal work omits requires_matriculated_professional", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [{ id: "S1", description: "Intervenir en tablero principal", safety_preconditions: ["power_off_documented"] }],
        requires_matriculated_professional: false,
      }),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/matriculated/);
  });

  it("fails completed power_off_documented action without notes", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [{ id: "S1", description: "Reemplazar borne", safety_preconditions: ["power_off_documented"] }],
      }),
      execution_trace: entry({
        actions: [
          { step_ref: "S1", started_at: "2026-04-25T10:00:00Z", outcome: "completed", notes: "" },
        ],
      }),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/notes/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// plumbing_checker.py (trade-plomero)
// ────────────────────────────────────────────────────────────────────────

describe("plumbing_checker validator", () => {
  const v = BUILTIN_VALIDATORS["plumbing_checker.py"];

  it("skips gracefully when no work_plan", () => {
    expect(v({}).ok).toBe(true);
  });

  it("passes a closed-water-main flexible swap", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [
          { id: "S1", description: "Cerrar llave general de paso", safety_preconditions: ["water_main_closed"] },
          { id: "S2", description: "Reemplazar flexible de lavabo", safety_preconditions: ["water_main_closed"] },
        ],
        materials: [{ brand: "FV", name: "Flexible 50cm", qty: 2, unit: "u" }],
      }),
    };
    expect(v(bb).ok).toBe(true);
  });

  it("passes a new-pipe install with pressure-test evidence in trace", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [
          { id: "S1", description: "Cerrar llave general", safety_preconditions: ["water_main_closed"] },
          { id: "S2", description: "Instalación nueva de cañería principal", safety_preconditions: ["water_main_closed"] },
        ],
      }),
      execution_trace: entry({
        actions: [
          { step_ref: "S2", started_at: "2026-04-25T11:00:00Z", outcome: "completed", notes: "Prueba de presión 6 bar OK durante 30 min" },
        ],
      }),
    };
    expect(v(bb).ok).toBe(true);
  });

  it("fails live-water work missing water_main_closed", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [{ id: "S1", description: "Reemplazar cañería del baño" }],
      }),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/water_main_closed/);
  });

  it("fails fixture diameter under minimum", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [{ id: "S1", description: "Reemplazar caño descarga inodoro", safety_preconditions: ["water_main_closed"] }],
        materials: [{ name: "Caño PVC para inodoro", diameter_mm: 40, qty: 1, unit: "u" }],
      }),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/inodoro/);
  });

  it("fails new-pipe install without any pressure-test evidence", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [
          { id: "S1", description: "Cerrar llave general", safety_preconditions: ["water_main_closed"] },
          { id: "S2", description: "Instalación nueva de cañería de presión", safety_preconditions: ["water_main_closed"] },
        ],
      }),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/pressure-test/);
  });

  it("fails drain slope below 1%", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [{ id: "S1", description: "Modificar pendiente de desagüe principal", slope_pct: 0.5, safety_preconditions: ["water_main_closed"] }],
      }),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/slope/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// painting_sanity.py (trade-pintor)
// ────────────────────────────────────────────────────────────────────────

describe("painting_sanity validator", () => {
  const v = BUILTIN_VALIDATORS["painting_sanity.py"];

  it("skips gracefully when no work_plan", () => {
    expect(v({}).ok).toBe(true);
  });

  it("passes a clean two-coat plan with paint material", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [
          { id: "S1", description: "Lijado leve y limpieza" },
          { id: "S2", description: "Mano 1 látex" },
          { id: "S3", description: "Mano 2 látex" },
        ],
        materials: [{ brand: "Sherwin Williams", name: "Látex ProMar", qty: 2, unit: "lata" }],
      }),
    };
    expect(v(bb).ok).toBe(true);
  });

  it("passes when no preparation needed and only coats listed (with material)", () => {
    const bb: BlackboardSnapshot = {
      diagnosis: entry({ problem_categories: ["superficie_lisa_lista"] }),
      work_plan: entry({
        steps: [
          { id: "S1", description: "Mano 1 látex blanco" },
          { id: "S2", description: "Mano 2 látex blanco" },
        ],
        materials: [{ name: "Látex blanco", qty: 1, unit: "lata" }],
      }),
    };
    expect(v(bb).ok).toBe(true);
  });

  it("fails when diagnosis flags peeling but no preparation step before coats", () => {
    const bb: BlackboardSnapshot = {
      diagnosis: entry({ problem_categories: ["pintura_descascarada"] }),
      work_plan: entry({
        steps: [
          { id: "S1", description: "Mano 1 látex" },
          { id: "S2", description: "Mano 2 látex" },
        ],
        materials: [{ name: "Látex", qty: 1, unit: "lata" }],
      }),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/preparation/);
  });

  it("fails when a coat step exists but no materials declared", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [{ id: "S1", description: "Primera mano de látex" }],
        materials: [],
      }),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/materials/);
  });

  it("fails when consecutive coat actions are <30min apart", () => {
    const bb: BlackboardSnapshot = {
      work_plan: entry({
        steps: [
          { id: "S1", description: "Mano 1 látex" },
          { id: "S2", description: "Mano 2 látex" },
        ],
        materials: [{ name: "Látex", qty: 1, unit: "lata" }],
      }),
      execution_trace: entry({
        actions: [
          { step_ref: "S1", started_at: "2026-04-25T10:00:00Z", ended_at: "2026-04-25T10:20:00Z", outcome: "completed", notes: "Mano 1 aplicada" },
          { step_ref: "S2", started_at: "2026-04-25T10:30:00Z", outcome: "completed", notes: "Mano 2 aplicada" },
        ],
      }),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/drying/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// compliance_checker.py — residential-electrical (TS port)
// ────────────────────────────────────────────────────────────────────────

describe("compliance_checker validator (residential-electrical)", () => {
  const v = BUILTIN_VALIDATORS["compliance_checker.py"];

  it("skips for trade-electricista intervention flow (no load_profile/circuits)", () => {
    expect(v({}).ok).toBe(true);
  });

  it("passes a well-formed kitchen-with-RCD circuit", () => {
    const bb: BlackboardSnapshot = {
      load_profile: entry({
        voltage_v: 230,
        rooms: [
          {
            name: "kitchen",
            loads: [{ appliance: "induction hob", watts: 7200, circuit_type: "dedicated" }],
          },
        ],
      }),
      circuits: entry([
        { id: "C1", breaker_a: 40, wire_mm2: 10, type: "dedicated", rcd: true, loads: ["kitchen/induction hob"] },
      ]),
    };
    expect(v(bb).ok).toBe(true);
  });

  it("fails wet-room circuit without RCD", () => {
    const bb: BlackboardSnapshot = {
      load_profile: entry({
        voltage_v: 230,
        rooms: [{ name: "bathroom", loads: [{ appliance: "lighting", watts: 100, circuit_type: "lighting" }] }],
      }),
      circuits: entry([
        { id: "C1", breaker_a: 10, wire_mm2: 1.5, type: "lighting", rcd: false, loads: ["bathroom/lighting"] },
      ]),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/RCD/);
  });

  it("fails undersized wire for breaker rating", () => {
    const bb: BlackboardSnapshot = {
      load_profile: entry({
        voltage_v: 230,
        rooms: [{ name: "living", loads: [{ appliance: "outlets", watts: 1000, circuit_type: "outlet" }] }],
      }),
      circuits: entry([
        { id: "C1", breaker_a: 32, wire_mm2: 1.5, type: "outlet", rcd: false, loads: ["living/outlets"] },
      ]),
    };
    const r = v(bb);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/wire/);
  });
});
