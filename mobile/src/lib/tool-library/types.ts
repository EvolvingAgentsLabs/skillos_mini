/**
 * Shared types for the v2 tool library.
 *
 * Every tool exported by the library is a pure function with this shape:
 *   (args: <ArgsType>, ctx: ToolContext) => ToolResult
 *
 * The runtime invokes tools sequentially per cartridge `tool-call` block.
 */

export type Verdict = 'pass' | 'fail' | 'warn' | 'info';

export interface ToolContext {
  /** Active cartridge id and version, for trace logging. */
  cartridgeId: string;
  cartridgeVersion: number;

  /** Locale block from cartridge MANIFEST.md. Tools that care read from here. */
  locale: {
    region: string;            // e.g. "UY"
    currency: string;          // ISO 4217
    language: string;          // BCP-47
    voltage_v?: number;
    frequency_hz?: number;
    tax_rate?: number;
  };

  /** Read-only access to the active cartridge's bundled data files. */
  cartridgeData: CartridgeDataAccessor;

  /** Optional: invocation timestamp (for tools that want it). */
  now?: Date;
}

export interface CartridgeDataAccessor {
  read<T>(path: string): T;
  has(path: string): boolean;
}

/** Result for a regulatory / rule-checking tool (verdict + reason + ref). */
export interface RegulatoryToolResult {
  verdict: Verdict;
  reason: string;
  ref: string;
  required?: Record<string, any>;
  ambiguous?: boolean;
  severity?: 'low' | 'medium' | 'high';
  evidence?: string;
}

/** Result for a pure computation tool (no rule, just math). */
export interface ComputationToolResult {
  verdict: 'info';
  result: Record<string, any>;
  inputs_normalized: Record<string, any>;
}

/** Result for a side-effecting tool (pdf render, share, etc). */
export interface ActionToolResult {
  verdict: 'pass' | 'fail';
  uri?: string;
  error?: string;
}

export type ToolResult = RegulatoryToolResult | ComputationToolResult | ActionToolResult;
