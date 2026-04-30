/**
 * IEC 60364 (subset, Uruguay) electrical compliance tools.
 *
 * Ports the rules from skillos_mini/cartridges/trade-electricista/validators/
 * compliance_checker.py and repair_safety.py into shared, deterministic TS.
 *
 * EVERY rule cites its norm reference — the navigator surfaces these in the
 * client-facing prose, and they're auditable in the session trace.
 */

import type {
  ToolContext,
  RegulatoryToolResult,
  ComputationToolResult,
} from './types';

/* -------------------------------------------------------------------------- */
/* Wire gauge (IEC 60364-5-52)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Section -> max breaker current at 30°C ambient, copper, in conduit.
 * IEC 60364-5-52 Table B.52.4 (UY default install conditions).
 */
const SECTION_MAX_AMPS_30C: Record<number, number> = {
  1.5: 16,
  2.5: 20,
  4: 25,
  6: 32,
  10: 50,
  16: 63,
  25: 80,
  35: 100,
};

/** Length derating factor: voltage drop ≤3% on a 230V residential circuit. */
function lengthDeratingFactor(length_m: number): number {
  if (length_m <= 10) return 1.0;
  if (length_m <= 20) return 0.9;
  if (length_m <= 30) return 0.8;
  return 0.7;
}

/** Ambient temp derating per IEC 60364-5-52 Table B.52.14. */
function ambientDeratingFactor(t_c: number): number {
  if (t_c <= 25) return 1.05;
  if (t_c <= 30) return 1.00;
  if (t_c <= 35) return 0.94;
  if (t_c <= 40) return 0.87;
  if (t_c <= 45) return 0.79;
  return 0.71;
}

export interface CheckWireGaugeArgs {
  breaker_amps: number;
  wire_section_mm2: number;
  circuit_length_m: number;
  ambient_temp_c?: number;
}

export function checkWireGauge(
  args: CheckWireGaugeArgs,
  _ctx: ToolContext,
): RegulatoryToolResult {
  const ambient = args.ambient_temp_c ?? 30;
  const baseMax = SECTION_MAX_AMPS_30C[args.wire_section_mm2];
  if (baseMax === undefined) {
    return {
      verdict: 'warn',
      reason: `Sección ${args.wire_section_mm2} mm² fuera de tabla. Confirmar con tablero o reemplazar.`,
      ref: 'IEC 60364-5-52 Table B.52.4',
      ambiguous: true,
    };
  }
  const adjusted = baseMax *
    lengthDeratingFactor(args.circuit_length_m) *
    ambientDeratingFactor(ambient);

  if (args.breaker_amps <= adjusted) {
    return {
      verdict: 'pass',
      reason: `Sección ${args.wire_section_mm2} mm² es adecuada para breaker ${args.breaker_amps} A a ${args.circuit_length_m} m (capacidad efectiva ~${adjusted.toFixed(0)} A).`,
      ref: 'IEC 60364-5-52 Table B.52.4',
    };
  }

  // Find the minimum section that would pass.
  const required = Object.entries(SECTION_MAX_AMPS_30C)
    .map(([s, a]) => ({ section: parseFloat(s), max: a }))
    .find(({ max }) => max * lengthDeratingFactor(args.circuit_length_m) * ambientDeratingFactor(ambient) >= args.breaker_amps);

  return {
    verdict: 'fail',
    reason: `Sección ${args.wire_section_mm2} mm² insuficiente para breaker ${args.breaker_amps} A a ${args.circuit_length_m} m; capacidad efectiva ~${adjusted.toFixed(0)} A. Recablear a sección mayor o bajar térmico.`,
    ref: 'IEC 60364-5-52 Table B.52.4',
    required: { min_section_mm2: required?.section ?? null, max_safe_breaker_a: Math.floor(adjusted) },
    severity: 'high',
    evidence: 'undersized_wire_for_breaker',
  };
}

/* -------------------------------------------------------------------------- */
/* RCD requirement (IEC 60364-4-41 / 60364-7-701)                              */
/* -------------------------------------------------------------------------- */

export interface CheckRCDRequiredArgs {
  room_type: 'kitchen' | 'bathroom' | 'laundry' | 'outdoor' | 'dry' | 'pool';
  has_rcd: boolean;
  rcd_sensitivity_ma?: number;     // typically 30 mA
}

const WET_ROOMS = new Set(['kitchen', 'bathroom', 'laundry', 'outdoor', 'pool']);

export function checkRCDRequired(
  args: CheckRCDRequiredArgs,
  _ctx: ToolContext,
): RegulatoryToolResult {
  const requiresRCD = WET_ROOMS.has(args.room_type);

  if (!requiresRCD) {
    return {
      verdict: 'info',
      reason: `Ambiente seco (${args.room_type}); RCD no obligatorio (recomendado).`,
      ref: 'IEC 60364-4-41',
    };
  }

  if (!args.has_rcd) {
    return {
      verdict: 'fail',
      reason: `${args.room_type} sin RCD: ambiente húmedo requiere disyuntor diferencial 30 mA. Riesgo de electrocución.`,
      ref: args.room_type === 'bathroom' ? 'IEC 60364-7-701' : 'IEC 60364-4-41',
      required: { rcd_sensitivity_ma: 30 },
      severity: 'high',
      evidence: 'rcd_missing_wet_room',
    };
  }

  if ((args.rcd_sensitivity_ma ?? 30) > 30) {
    return {
      verdict: 'fail',
      reason: `RCD presente pero sensibilidad ${args.rcd_sensitivity_ma} mA > 30 mA. Cambiar a 30 mA para protección personal.`,
      ref: 'IEC 60364-4-41 §411.4',
      required: { rcd_sensitivity_ma: 30 },
      severity: 'high',
    };
  }

  return {
    verdict: 'pass',
    reason: `${args.room_type} con RCD ${args.rcd_sensitivity_ma ?? 30} mA presente. Cumple norma.`,
    ref: 'IEC 60364-4-41',
  };
}

/* -------------------------------------------------------------------------- */
/* Maximum load for installed section                                          */
/* -------------------------------------------------------------------------- */

export interface MaxLoadForSectionArgs {
  section_mm2: number;
  length_m: number;
  ambient_temp_c?: number;
}

export function maxLoadForSection(
  args: MaxLoadForSectionArgs,
  _ctx: ToolContext,
): ComputationToolResult {
  const ambient = args.ambient_temp_c ?? 30;
  const baseMax = SECTION_MAX_AMPS_30C[args.section_mm2] ?? 0;
  const adjusted = baseMax *
    lengthDeratingFactor(args.length_m) *
    ambientDeratingFactor(ambient);
  return {
    verdict: 'info',
    result: {
      max_amps: Math.floor(adjusted),
      base_amps_30c: baseMax,
      length_factor: lengthDeratingFactor(args.length_m),
      ambient_factor: ambientDeratingFactor(ambient),
    },
    inputs_normalized: { ...args, ambient_temp_c: ambient },
  };
}

/* -------------------------------------------------------------------------- */
/* Dedicated circuit single-load (IEC 60364-5-52 §523, "circuitos dedicados") */
/* -------------------------------------------------------------------------- */

export interface CheckDedicatedCircuitArgs {
  declared_dedicated: boolean;
  load_count: number;
  loads_description?: string[];
}

export function checkDedicatedCircuit(
  args: CheckDedicatedCircuitArgs,
  _ctx: ToolContext,
): RegulatoryToolResult {
  if (!args.declared_dedicated) {
    return {
      verdict: 'info',
      reason: 'Circuito no declarado dedicado; no aplica regla de carga única.',
      ref: 'IEC 60364-5-52 §523',
    };
  }
  if (args.load_count === 1) {
    return {
      verdict: 'pass',
      reason: 'Circuito dedicado con una sola carga. Cumple norma.',
      ref: 'IEC 60364-5-52 §523',
    };
  }
  return {
    verdict: 'fail',
    reason: `Circuito declarado dedicado pero alimenta ${args.load_count} cargas. Un circuito dedicado debe servir exactamente una carga.`,
    ref: 'IEC 60364-5-52 §523',
    required: { load_count: 1 },
    severity: 'medium',
    evidence: 'dedicated_circuit_multiple_loads',
  };
}

/* -------------------------------------------------------------------------- */
/* Load vs breaker (watts-based; v1 parity for compliance_checker P4)          */
/* -------------------------------------------------------------------------- */

export interface CheckLoadAgainstBreakerArgs {
  total_watts: number;
  voltage_v?: number;       // defaults to ctx.locale.voltage_v or 230
  breaker_amps: number;
}

export function checkLoadAgainstBreaker(
  args: CheckLoadAgainstBreakerArgs,
  ctx: ToolContext,
): RegulatoryToolResult {
  const voltage = args.voltage_v ?? ctx.locale.voltage_v ?? 230;
  if (voltage <= 0 || args.breaker_amps <= 0) {
    return {
      verdict: 'warn',
      reason: 'Voltaje o térmico inválidos.',
      ref: 'IEC 60364-5-53 §533.3',
      ambiguous: true,
    };
  }
  const loadAmps = args.total_watts / voltage;
  const requiredBreaker = loadAmps * 1.25;     // 25% margin per residential good practice

  if (args.breaker_amps >= requiredBreaker) {
    return {
      verdict: 'pass',
      reason: `Térmico ${args.breaker_amps} A adecuado para ${args.total_watts} W @ ${voltage} V (carga ${loadAmps.toFixed(1)} A, margen incluido).`,
      ref: 'IEC 60364-5-53 §533.3',
    };
  }
  return {
    verdict: 'fail',
    reason: `Térmico ${args.breaker_amps} A insuficiente para ${args.total_watts} W @ ${voltage} V. Carga ${loadAmps.toFixed(1)} A; mínimo recomendado con 25% margen ${requiredBreaker.toFixed(1)} A.`,
    ref: 'IEC 60364-5-53 §533.3',
    required: { min_breaker_amps: Math.ceil(requiredBreaker) },
    severity: 'high',
    evidence: 'undersized_breaker_for_load',
  };
}

/* -------------------------------------------------------------------------- */
/* Breaker margin (IEC 60364-5-53 §533.3)                                      */
/* -------------------------------------------------------------------------- */

export interface ComputeBreakerMarginArgs {
  load_amps: number;
  breaker_amps: number;
}

export function computeBreakerMargin(
  args: ComputeBreakerMarginArgs,
  _ctx: ToolContext,
): RegulatoryToolResult {
  if (args.breaker_amps <= 0) {
    return {
      verdict: 'warn',
      reason: 'Amperaje de breaker inválido.',
      ref: 'IEC 60364-5-53',
      ambiguous: true,
    };
  }
  const margin = (args.breaker_amps - args.load_amps) / args.breaker_amps;
  if (margin < 0) {
    return {
      verdict: 'fail',
      reason: `Carga ${args.load_amps} A excede térmico ${args.breaker_amps} A. Sobrecorriente segura. Aumentar térmico o redistribuir carga.`,
      ref: 'IEC 60364-5-53 §533.3',
      severity: 'high',
      evidence: 'overcurrent',
    };
  }
  if (margin < 0.25) {
    return {
      verdict: 'warn',
      reason: `Margen ${(margin * 100).toFixed(0)}% bajo el mínimo 25% recomendado para circuitos residenciales con cargas variables.`,
      ref: 'IEC 60364-5-53 §533.3 (recomendado)',
      required: { min_margin_pct: 25 },
      severity: 'medium',
    };
  }
  return {
    verdict: 'pass',
    reason: `Margen ${(margin * 100).toFixed(0)}% (≥25%). Térmico bien dimensionado.`,
    ref: 'IEC 60364-5-53 §533.3',
  };
}

/* -------------------------------------------------------------------------- */
/* Norm lookup                                                                  */
/* -------------------------------------------------------------------------- */

const NORMS: Record<string, { title: string; summary: string; source: string }> = {
  'IEC 60364-4-41': {
    title: 'Protección por puesta a tierra y por desconexión automática',
    summary:
      'Define los requisitos para protección contra contacto indirecto: puesta a tierra de partes metálicas, dispositivos diferenciales (RCD ≤30 mA) y tiempos de desconexión.',
    source: 'IEC 60364-4-41:2017',
  },
  'IEC 60364-5-52': {
    title: 'Selección y montaje de equipos eléctricos — canalizaciones',
    summary:
      'Define las capacidades de transporte de corriente de cables según sección, tipo de aislamiento, agrupamiento y temperatura ambiente. Tabla B.52.4 es la referencia para Uruguay.',
    source: 'IEC 60364-5-52:2009',
  },
  'IEC 60364-7-701': {
    title: 'Locales con baño o ducha',
    summary:
      'Locales con baño o ducha requieren protección RCD de 30 mA, separación de zonas (0/1/2/3) y restricciones de IP por zona.',
    source: 'IEC 60364-7-701:2019',
  },
  'IEC 60364-5-53': {
    title: 'Aparatos de protección, seccionamiento y maniobra',
    summary:
      'Define dimensionamiento de breakers, márgenes mínimos respecto a la carga, y selectividad entre dispositivos.',
    source: 'IEC 60364-5-53:2020',
  },
};

export interface LookupNormArgs {
  code: string;       // e.g., "IEC 60364-4-41"
}

export function lookupNorm(
  args: LookupNormArgs,
  _ctx: ToolContext,
): ComputationToolResult {
  const norm = NORMS[args.code];
  if (!norm) {
    return {
      verdict: 'info',
      result: { found: false, code: args.code },
      inputs_normalized: args,
    };
  }
  return {
    verdict: 'info',
    result: { found: true, ...norm, code: args.code },
    inputs_normalized: args,
  };
}
