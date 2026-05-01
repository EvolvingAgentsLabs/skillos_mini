/**
 * PDF rendering tools.
 *
 * STATUS: stubs. Real implementations land with the mobile/ wiring PR
 * (Migration step 5 — Build v2 registry + runner in mobile/).
 *
 * Real impl will use pdfmake (per skillos_mini/CLAUDE.md §7.5) and the
 * provider-agnostic data layer (§4.3). Templates per cartridge live in
 * `cartridges/<id>/templates/*.pdf.json` (pdfmake docdef format) — but
 * v2 cartridges are pure markdown, so templates either:
 *   (a) ship as a sibling JSON file the cartridge declares in MANIFEST.data, or
 *   (b) the runtime supplies a default template per cartridge type, and the
 *       cartridge's tool-call passes data only.
 *
 * The contract here is the tool signatures cartridges currently call.
 * Stubs return verdict: pass with a placeholder URI so use-mode walks
 * complete end-to-end during prototyping, surfacing later wiring as a
 * mock-mode flag in the trace.
 */

import type { ToolContext, ActionToolResult } from './types';

export interface RenderQuoteArgs {
  template: string;                        // e.g., 'standard_uy'
  client: Record<string, any>;             // client metadata: name, address, phone, RUT?
  professional: Record<string, any>;       // electricista profile: name, matriculation, contact
  diagnosis_summary?: string;
  quote: {
    line_items: any[];
    materials_subtotal?: number;
    labor_subtotal?: number;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    currency: string;
  };
  validity_days: number;
  warranty_months: number;
  locale: ToolContext['locale'];
}

export function renderQuote(
  _args: RenderQuoteArgs,
  ctx: ToolContext,
): ActionToolResult {
  // STUB. See MIGRATION_PLAN.md step 5.
  const stubUri = `mock://${ctx.cartridgeId}/quote_${Date.now()}.pdf`;
  return {
    verdict: 'pass',
    uri: stubUri,
  };
}

export interface RenderReportArgs {
  template: string;
  client: Record<string, any>;
  professional: Record<string, any>;
  diagnosis_entries: any[];
  execution_trace?: any;
  photos_before?: string[];
  photos_after: string[];
  hazard_aggregate?: {
    severity: string;
    reason: string;
  };
  warranty_text: string;
  disclaimer_text: string;
  locale: ToolContext['locale'];
}

export function renderReport(
  _args: RenderReportArgs,
  ctx: ToolContext,
): ActionToolResult {
  // STUB. See MIGRATION_PLAN.md step 5.
  const stubUri = `mock://${ctx.cartridgeId}/report_${Date.now()}.pdf`;
  return {
    verdict: 'pass',
    uri: stubUri,
  };
}
