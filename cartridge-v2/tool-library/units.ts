/**
 * Generic unit conversion + formatting tools.
 *
 * Used by every cartridge. No domain assumptions.
 */

import type { ToolContext, ComputationToolResult } from './types';

const LENGTH_TO_M: Record<string, number> = {
  mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048,
};

const AREA_TO_M2: Record<string, number> = {
  mm2: 1e-6, cm2: 1e-4, m2: 1, ha: 10000, ft2: 0.09290304,
};

export interface FormatCurrencyArgs {
  amount: number;
  currency: string;       // ISO 4217: UYU, USD, EUR
  locale?: string;        // BCP-47, defaults from cartridge.locale
}

export function formatCurrency(args: FormatCurrencyArgs, _ctx: ToolContext): ComputationToolResult {
  const { amount, currency, locale = 'es-UY' } = args;
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return {
    verdict: 'info',
    result: { formatted, amount, currency, locale },
    inputs_normalized: args,
  };
}

export interface ConvertLengthArgs {
  value: number;
  from: keyof typeof LENGTH_TO_M;
  to: keyof typeof LENGTH_TO_M;
}

export function convertLength(args: ConvertLengthArgs, _ctx: ToolContext): ComputationToolResult {
  const { value, from, to } = args;
  if (!(from in LENGTH_TO_M) || !(to in LENGTH_TO_M)) {
    return {
      verdict: 'info',
      result: { error: 'unknown_unit', from, to },
      inputs_normalized: args,
    };
  }
  const meters = value * LENGTH_TO_M[from];
  const result = meters / LENGTH_TO_M[to];
  return {
    verdict: 'info',
    result: { value: result, unit: to, source_value: value, source_unit: from },
    inputs_normalized: args,
  };
}

export interface ConvertAreaArgs {
  value: number;
  from: keyof typeof AREA_TO_M2;
  to: keyof typeof AREA_TO_M2;
}

export function convertArea(args: ConvertAreaArgs, _ctx: ToolContext): ComputationToolResult {
  const { value, from, to } = args;
  if (!(from in AREA_TO_M2) || !(to in AREA_TO_M2)) {
    return {
      verdict: 'info',
      result: { error: 'unknown_unit', from, to },
      inputs_normalized: args,
    };
  }
  const m2 = value * AREA_TO_M2[from];
  const result = m2 / AREA_TO_M2[to];
  return {
    verdict: 'info',
    result: { value: result, unit: to, source_value: value, source_unit: from },
    inputs_normalized: args,
  };
}

export interface ParseNumberArgs {
  input: string;
  locale?: string;
}

export function parseNumber(args: ParseNumberArgs, _ctx: ToolContext): ComputationToolResult {
  const { input, locale = 'es-UY' } = args;
  // es-UY uses comma as decimal separator, dot as thousands.
  // Keep this simple — for the navigator, ambiguous parses return null and the
  // cartridge can route the user to clarify.
  const decimalSep = locale.startsWith('es') ? ',' : '.';
  const thousandsSep = decimalSep === ',' ? '.' : ',';
  const cleaned = input.replace(new RegExp('\\' + thousandsSep, 'g'), '')
                       .replace(decimalSep, '.');
  const value = parseFloat(cleaned);
  if (isNaN(value)) {
    return {
      verdict: 'info',
      result: { value: null, parse_error: true },
      inputs_normalized: args,
    };
  }
  return {
    verdict: 'info',
    result: { value, locale_used: locale },
    inputs_normalized: args,
  };
}
