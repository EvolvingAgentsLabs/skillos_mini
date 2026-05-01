/**
 * tool_invoker — Dispatches dotted tool names to their implementations.
 *
 * The registry maps dotted names ("electrical.checkWireGauge") to TS functions.
 * All tool functions follow the shape: (args: Record<string, unknown>, ctx: ToolContext) => ToolResult.
 *
 * The navigator uses this to deterministically execute pre-parsed tool-call blocks.
 */

import type { ToolContext, ToolResult } from '../tool-library/types';

// =============================================================================
// Types
// =============================================================================

export type ToolFn = (args: Record<string, unknown>, ctx: ToolContext) => ToolResult;

export interface ToolRegistry {
  /** Check if a dotted tool name exists in the registry. */
  has(name: string): boolean;
  /** Get a tool function by dotted name. */
  get(name: string): ToolFn | undefined;
  /** List all registered tool names. */
  list(): string[];
  /** Register a tool at a dotted name. */
  register(name: string, fn: ToolFn): void;
}

export interface InvokeResult {
  ok: boolean;
  tool: string;
  result?: ToolResult;
  error?: string;
  durationMs: number;
}

// =============================================================================
// Registry implementation
// =============================================================================

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolFn>();

  return {
    has: (name) => tools.has(name),
    get: (name) => tools.get(name),
    list: () => Array.from(tools.keys()),
    register: (name, fn) => { tools.set(name, fn); },
  };
}

/**
 * Register an entire module's tools under a namespace prefix.
 * E.g. registerModule(registry, 'electrical', electricalModule) registers
 * "electrical.checkWireGauge", "electrical.checkRCDRequired", etc.
 */
export function registerModule(
  registry: ToolRegistry,
  namespace: string,
  module: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(module)) {
    if (typeof value === 'function' && !key.startsWith('_')) {
      registry.register(`${namespace}.${key}`, value as ToolFn);
    }
  }
}

// =============================================================================
// Invocation
// =============================================================================

/**
 * Invoke a tool by dotted name with resolved arguments.
 * Returns an InvokeResult with timing and error handling.
 */
export function invokeTool(
  registry: ToolRegistry,
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): InvokeResult {
  const fn = registry.get(toolName);
  if (!fn) {
    return {
      ok: false,
      tool: toolName,
      error: `Tool not found: ${toolName}`,
      durationMs: 0,
    };
  }

  const start = performance.now();
  try {
    const result = fn(args, ctx);
    const durationMs = Math.round(performance.now() - start);
    return { ok: true, tool: toolName, result, durationMs };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    return {
      ok: false,
      tool: toolName,
      error: err instanceof Error ? err.message : String(err),
      durationMs,
    };
  }
}

/**
 * Verify that all required tools exist in the registry.
 * Returns list of missing tool names (empty = all found).
 */
export function verifyTools(
  registry: ToolRegistry,
  required: string[],
): string[] {
  return required.filter(name => !registry.has(name));
}
