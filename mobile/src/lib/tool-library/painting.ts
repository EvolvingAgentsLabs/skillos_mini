/**
 * Painting tools.
 *
 * Drying time, coverage rate, and surface prep checks for residential pintor
 * in Uruguay. Brand catalog lives in cartridge data/paint_brands_uy.json.
 */

import type { ToolContext, RegulatoryToolResult, ComputationToolResult } from './types';

interface PaintProduct {
  brand: string;
  product: string;
  type: 'latex' | 'esmalte' | 'fondo' | 'impermeabilizante';
  surface_types: string[];
  coverage_m2_per_l: number;
  recoat_min_h: number;
  full_cure_h: number;
  voc_low?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Drying time                                                                  */
/* -------------------------------------------------------------------------- */

export interface DryingTimeArgs {
  brand: string;
  product: string;
  conditions?: {
    ambient_temp_c?: number;
    humidity_pct?: number;
  };
  data_path?: string;
}

export function dryingTime(
  args: DryingTimeArgs,
  ctx: ToolContext,
): RegulatoryToolResult {
  const dataPath = args.data_path ?? 'data/paint_brands_uy.json';
  if (!ctx.cartridgeData.has(dataPath)) {
    return {
      verdict: 'warn',
      reason: `Catálogo de marcas no disponible (${dataPath}).`,
      ref: 'painting.dryingTime',
      ambiguous: true,
    };
  }
  const products = ctx.cartridgeData.read<PaintProduct[]>(dataPath);
  const p = products.find(x => x.brand === args.brand && x.product === args.product);
  if (!p) {
    return {
      verdict: 'warn',
      reason: `Producto no encontrado: ${args.brand} ${args.product}.`,
      ref: 'painting.dryingTime',
      ambiguous: true,
    };
  }

  const temp = args.conditions?.ambient_temp_c ?? 20;
  const humidity = args.conditions?.humidity_pct ?? 60;
  // Simple adjustment: cold or humid conditions slow drying.
  let factor = 1.0;
  if (temp < 15) factor *= 1.5;
  if (temp > 30) factor *= 0.85;
  if (humidity > 75) factor *= 1.4;
  if (humidity < 40) factor *= 0.9;

  return {
    verdict: 'info',
    reason: `${p.brand} ${p.product}: recoat ${(p.recoat_min_h * factor).toFixed(1)} h, cura completa ${(p.full_cure_h * factor).toFixed(0)} h (ajustado por temp/humedad).`,
    ref: 'painting.dryingTime',
    required: {
      recoat_min_h: p.recoat_min_h * factor,
      full_cure_h: p.full_cure_h * factor,
      base_recoat_h: p.recoat_min_h,
      base_full_cure_h: p.full_cure_h,
      adjustment_factor: factor,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Coverage                                                                     */
/* -------------------------------------------------------------------------- */

export interface CoverageArgs {
  brand: string;
  product: string;
  surface_type: 'yeso' | 'mampostería' | 'hormigón' | 'madera' | 'metal';
  data_path?: string;
}

export function coverage(
  args: CoverageArgs,
  ctx: ToolContext,
): ComputationToolResult {
  const dataPath = args.data_path ?? 'data/paint_brands_uy.json';
  if (!ctx.cartridgeData.has(dataPath)) {
    return {
      verdict: 'info',
      result: { error: 'data_file_missing', data_path: dataPath },
      inputs_normalized: args,
    };
  }
  const products = ctx.cartridgeData.read<PaintProduct[]>(dataPath);
  const p = products.find(x => x.brand === args.brand && x.product === args.product);
  if (!p) {
    return {
      verdict: 'info',
      result: { error: 'unknown_product', brand: args.brand, product: args.product },
      inputs_normalized: args,
    };
  }

  // Surface type compatibility lookup; rough adjustment for absorbent surfaces.
  const compatible = p.surface_types.includes(args.surface_type);
  const adjustment =
    args.surface_type === 'yeso' || args.surface_type === 'hormigón' ? 0.85 :
    args.surface_type === 'madera' ? 0.90 :
    1.0;

  return {
    verdict: 'info',
    result: {
      m2_per_l: p.coverage_m2_per_l * adjustment,
      base_m2_per_l: p.coverage_m2_per_l,
      surface_compatible: compatible,
      recommend_primer: !compatible || args.surface_type === 'metal',
    },
    inputs_normalized: args,
  };
}

/* -------------------------------------------------------------------------- */
/* Surface prep                                                                 */
/* -------------------------------------------------------------------------- */

const PREP_REQUIRED: Record<string, string[]> = {
  yeso: ['lijar_grano_180', 'limpiar_polvo', 'imprimir_fijador'],
  mampostería: ['limpiar', 'rellenar_grietas', 'imprimir_sellador_alcali'],
  hormigón: ['lavar', 'desmoldar_si_aplica', 'imprimir_fijador'],
  madera: ['lijar_grano_120_220', 'limpiar', 'imprimir_fondo_madera'],
  metal: ['desoxidar', 'desengrasar', 'imprimir_antióxido'],
};

export interface CheckSurfacePrepArgs {
  surface_type: 'yeso' | 'mampostería' | 'hormigón' | 'madera' | 'metal';
  prep_steps_taken: string[];
}

export function checkSurfacePrep(
  args: CheckSurfacePrepArgs,
  _ctx: ToolContext,
): RegulatoryToolResult {
  const required = PREP_REQUIRED[args.surface_type] ?? [];
  const missing = required.filter(step => !args.prep_steps_taken.includes(step));
  if (missing.length === 0) {
    return {
      verdict: 'pass',
      reason: `Preparación completa para ${args.surface_type}.`,
      ref: 'painting.checkSurfacePrep',
    };
  }
  return {
    verdict: 'warn',
    reason: `Preparación incompleta para ${args.surface_type}: faltan ${missing.join(', ')}. Riesgo de adherencia deficiente.`,
    ref: 'painting.checkSurfacePrep',
    required: { missing_steps: missing, all_required: required },
    severity: 'medium',
    evidence: 'incomplete_surface_prep',
  };
}
