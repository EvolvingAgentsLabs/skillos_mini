/**
 * Generic pricing tools.
 *
 * Cartridge-data driven: material/labor lookup from data/*.json bundled with
 * the cartridge. Tools are pure functions — no network calls, no global state.
 */

import type { ToolContext, ComputationToolResult } from './types';

interface MaterialRecord {
  id: string;
  name: string;
  unit: string;
  unit_price: number;
  currency: string;
  brand?: string;
  category?: string;
}

interface LaborRateRecord {
  role: string;                        // e.g. "matriculado", "ayudante"
  hour_rate: number;
  currency: string;
  region?: string;
}

export interface LineItemTotalArgs {
  material_id: string;
  qty: number;
  unit?: string;                       // expected unit; tool warns if mismatched
  data_path?: string;                  // override, default 'data/materials_uy.json'
}

export function lineItemTotal(
  args: LineItemTotalArgs,
  ctx: ToolContext,
): ComputationToolResult {
  const dataPath = args.data_path ?? 'data/materials_uy.json';
  if (!ctx.cartridgeData.has(dataPath)) {
    return {
      verdict: 'info',
      result: { error: 'data_file_missing', data_path: dataPath },
      inputs_normalized: args,
    };
  }
  const materials = ctx.cartridgeData.read<MaterialRecord[]>(dataPath);
  const m = materials.find(x => x.id === args.material_id);
  if (!m) {
    return {
      verdict: 'info',
      result: { error: 'unknown_material', material_id: args.material_id },
      inputs_normalized: args,
    };
  }
  const unitMismatch = args.unit && args.unit !== m.unit;
  return {
    verdict: 'info',
    result: {
      material_id: m.id,
      name: m.name,
      unit: m.unit,
      unit_price: m.unit_price,
      qty: args.qty,
      total: m.unit_price * args.qty,
      currency: m.currency,
      brand: m.brand,
      unit_mismatch: unitMismatch || undefined,
    },
    inputs_normalized: args,
  };
}

export interface ApplyTaxArgs {
  subtotal: number;
  tax_rate?: number;                   // overrides cartridge.locale.tax_rate
}

export function applyTax(
  args: ApplyTaxArgs,
  ctx: ToolContext,
): ComputationToolResult {
  const rate = args.tax_rate ?? ctx.locale.tax_rate ?? 0;
  const tax_amount = args.subtotal * rate;
  return {
    verdict: 'info',
    result: {
      subtotal: args.subtotal,
      tax_rate: rate,
      tax_amount,
      total: args.subtotal + tax_amount,
    },
    inputs_normalized: args,
  };
}

export interface ComputeMarginArgs {
  cost: number;
  sale_price: number;
}

export function computeMargin(
  args: ComputeMarginArgs,
  _ctx: ToolContext,
): ComputationToolResult {
  if (args.sale_price <= 0) {
    return {
      verdict: 'info',
      result: { error: 'invalid_sale_price' },
      inputs_normalized: args,
    };
  }
  const margin_pct = (args.sale_price - args.cost) / args.sale_price;
  return {
    verdict: 'info',
    result: { margin_pct, profit: args.sale_price - args.cost },
    inputs_normalized: args,
  };
}

export interface FormatQuoteArgs {
  line_items: Array<{
    name: string;
    qty: number;
    unit: string;
    unit_price: number;
    total: number;
  }>;
  labor_hours: number;
  labor_rate: number;
  tax_rate?: number;
  currency: string;
}

export function formatQuote(
  args: FormatQuoteArgs,
  ctx: ToolContext,
): ComputationToolResult {
  const materials_subtotal = args.line_items.reduce((s, x) => s + x.total, 0);
  const labor_subtotal = args.labor_hours * args.labor_rate;
  const subtotal = materials_subtotal + labor_subtotal;
  const tax_rate = args.tax_rate ?? ctx.locale.tax_rate ?? 0;
  const tax_amount = subtotal * tax_rate;
  const total = subtotal + tax_amount;

  return {
    verdict: 'info',
    result: {
      line_items: args.line_items,
      materials_subtotal,
      labor_subtotal,
      subtotal,
      tax_rate,
      tax_amount,
      total,
      currency: args.currency,
    },
    inputs_normalized: args,
  };
}
