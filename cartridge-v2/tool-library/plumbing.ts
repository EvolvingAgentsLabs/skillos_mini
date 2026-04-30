/**
 * Plumbing tools.
 *
 * Subset relevant to residential plomero in Uruguay: drain slope, fixture
 * diameters, test pressure for new pipe runs.
 */

import type { ToolContext, RegulatoryToolResult } from './types';

/* -------------------------------------------------------------------------- */
/* Drain slope                                                                  */
/* -------------------------------------------------------------------------- */

const APPLICATION_MIN_SLOPE_PCT: Record<string, number> = {
  drain_main: 1.0,
  drain_branch: 2.0,
  rain_gutter: 0.5,
  vent: 0,                              // vents have no slope requirement
};

export interface CheckSlopeArgs {
  length_m: number;
  drop_cm: number;
  application: keyof typeof APPLICATION_MIN_SLOPE_PCT;
}

export function checkSlope(
  args: CheckSlopeArgs,
  _ctx: ToolContext,
): RegulatoryToolResult {
  const minPct = APPLICATION_MIN_SLOPE_PCT[args.application];
  if (minPct === undefined) {
    return {
      verdict: 'warn',
      reason: `Aplicación desconocida: ${args.application}`,
      ref: 'plumbing.checkSlope',
      ambiguous: true,
    };
  }
  if (args.length_m <= 0) {
    return {
      verdict: 'warn',
      reason: 'Longitud no válida.',
      ref: 'plumbing.checkSlope',
      ambiguous: true,
    };
  }
  const actualPct = (args.drop_cm / (args.length_m * 100)) * 100;
  if (actualPct >= minPct) {
    return {
      verdict: 'pass',
      reason: `Pendiente ${actualPct.toFixed(2)}% (≥ mínimo ${minPct}% para ${args.application}).`,
      ref: 'UNIT 1192:2009 / IPS UY-PL §4',
    };
  }
  return {
    verdict: 'fail',
    reason: `Pendiente ${actualPct.toFixed(2)}% insuficiente; mínimo ${minPct}% para ${args.application}. Riesgo de obstrucción crónica.`,
    ref: 'UNIT 1192:2009 / IPS UY-PL §4',
    required: { min_slope_pct: minPct, additional_drop_cm: ((minPct / 100) * args.length_m * 100) - args.drop_cm },
    severity: 'medium',
    evidence: 'insufficient_slope',
  };
}

/* -------------------------------------------------------------------------- */
/* Fixture diameter                                                             */
/* -------------------------------------------------------------------------- */

const FIXTURE_DIAMETER_MM: Record<string, { drain: number; supply_cold?: number; supply_hot?: number }> = {
  lavabo: { drain: 40, supply_cold: 13, supply_hot: 13 },
  bidet: { drain: 40, supply_cold: 13, supply_hot: 13 },
  bañera: { drain: 50, supply_cold: 19, supply_hot: 19 },
  ducha: { drain: 50, supply_cold: 19, supply_hot: 19 },
  inodoro: { drain: 110, supply_cold: 13 },
  pileta_cocina: { drain: 50, supply_cold: 19, supply_hot: 19 },
  lavarropas: { drain: 40, supply_cold: 19, supply_hot: 19 },
  rejilla_piso: { drain: 50 },
};

export interface FixtureDiameterArgs {
  fixture_type: keyof typeof FIXTURE_DIAMETER_MM;
}

export function fixtureDiameter(
  args: FixtureDiameterArgs,
  _ctx: ToolContext,
): RegulatoryToolResult {
  const profile = FIXTURE_DIAMETER_MM[args.fixture_type];
  if (!profile) {
    return {
      verdict: 'warn',
      reason: `Artefacto desconocido: ${args.fixture_type}`,
      ref: 'plumbing.fixtureDiameter',
      ambiguous: true,
    };
  }
  return {
    verdict: 'info',
    reason: `Artefacto ${args.fixture_type}: desagüe ${profile.drain}mm`,
    ref: 'UNIT 1192:2009 §6 / IPS UY-PL Tabla 3',
    required: profile,
  };
}

/* -------------------------------------------------------------------------- */
/* Test pressure (for new pipe runs)                                            */
/* -------------------------------------------------------------------------- */

const TEST_PRESSURE: Record<string, { bar: number; hold_min: number }> = {
  hot_pex: { bar: 6, hold_min: 30 },
  cold_pex: { bar: 6, hold_min: 30 },
  hot_copper: { bar: 8, hold_min: 30 },
  cold_copper: { bar: 8, hold_min: 30 },
  drain_pvc: { bar: 0.3, hold_min: 15 },        // low pressure for drain test
};

export interface TestPressureArgs {
  material: 'pex' | 'copper' | 'pvc';
  system_type: 'hot' | 'cold' | 'drain';
}

export function testPressure(
  args: TestPressureArgs,
  _ctx: ToolContext,
): RegulatoryToolResult {
  const key = `${args.system_type}_${args.material}`;
  const profile = TEST_PRESSURE[key];
  if (!profile) {
    return {
      verdict: 'warn',
      reason: `Combinación desconocida: ${args.material}/${args.system_type}`,
      ref: 'plumbing.testPressure',
      ambiguous: true,
    };
  }
  return {
    verdict: 'info',
    reason: `Test de presión: ${profile.bar} bar durante ${profile.hold_min} min sin caída.`,
    ref: 'UNIT 1199:2014 §8',
    required: profile,
  };
}
