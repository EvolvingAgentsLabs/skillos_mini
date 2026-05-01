/**
 * arg_resolver — Resolves ${ctx.X} and ${tool_results.last.Y} expressions
 * in tool-call arguments against the session blackboard and tool results.
 *
 * Supports:
 *   ${ctx.key}                     — lookup from blackboard
 *   ${ctx.key | default(value)}    — fallback if key is missing
 *   ${tool_results.last.field}     — field from last tool result
 *   literal values                 — passed through unchanged
 *
 * Returns undefined for unresolvable expressions (triggers ask-user flow).
 */

import type { BlackboardValue, ToolResultEntry } from './types';

// =============================================================================
// Public API
// =============================================================================

export interface ResolverContext {
  /** Get a value from the session blackboard */
  getBlackboard: (key: string) => BlackboardValue | undefined;
  /** All tool results collected so far (ordered) */
  toolResults: ToolResultEntry[];
}

export interface ResolvedArgs {
  /** Successfully resolved arguments */
  resolved: Record<string, unknown>;
  /** Keys that could not be resolved (missing from blackboard, no default) */
  unresolved: string[];
}

/**
 * Resolve all arguments in a tool-call block.
 * Returns both resolved values and a list of unresolved keys.
 */
export function resolveArgs(
  rawArgs: Record<string, string>,
  ctx: ResolverContext,
): ResolvedArgs {
  const resolved: Record<string, unknown> = {};
  const unresolved: string[] = [];

  for (const [key, rawValue] of Object.entries(rawArgs)) {
    const result = resolveExpression(rawValue, ctx);
    if (result.ok) {
      resolved[key] = result.value;
    } else {
      unresolved.push(key);
    }
  }

  return { resolved, unresolved };
}

/**
 * Resolve a single expression string.
 * Returns { ok: true, value } or { ok: false }.
 */
export function resolveExpression(
  expr: string,
  ctx: ResolverContext,
): { ok: true; value: unknown } | { ok: false } {
  const trimmed = expr.trim();

  // Check if it's a ${...} expression
  const exprMatch = trimmed.match(/^\$\{(.+)\}$/);
  if (!exprMatch) {
    // Literal value — try to parse as number/boolean, otherwise keep as string
    return { ok: true, value: parseLiteral(trimmed) };
  }

  const inner = exprMatch[1].trim();

  // Check for default: ${ctx.key | default(value)}
  const defaultMatch = inner.match(/^(.+?)\s*\|\s*default\((.+)\)$/);
  if (defaultMatch) {
    const path = defaultMatch[1].trim();
    const defaultVal = defaultMatch[2].trim();
    const resolved = resolvePath(path, ctx);
    if (resolved !== undefined) {
      return { ok: true, value: resolved };
    }
    // Use default value
    return { ok: true, value: parseLiteral(stripQuotes(defaultVal)) };
  }

  // Plain expression: ${ctx.key} or ${tool_results.last.field}
  const resolved = resolvePath(inner, ctx);
  if (resolved !== undefined) {
    return { ok: true, value: resolved };
  }

  return { ok: false };
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Resolve a dotted path against the context.
 * Supports:
 *   ctx.key           → blackboard lookup
 *   ctx.key.subkey    → nested blackboard lookup
 *   tool_results.last.field → last tool result's field
 *   tool_results.N.field    → Nth tool result's field
 */
function resolvePath(path: string, ctx: ResolverContext): unknown | undefined {
  const parts = path.split('.');

  if (parts[0] === 'ctx' && parts.length >= 2) {
    // Blackboard lookup
    const topKey = parts[1];
    const value = ctx.getBlackboard(topKey);
    if (value === undefined) return undefined;

    // Nested access: ctx.key.subkey.subsubkey
    if (parts.length > 2) {
      return accessNested(value, parts.slice(2));
    }
    return value;
  }

  if (parts[0] === 'tool_results' && parts.length >= 3) {
    const indexPart = parts[1];
    let entry: ToolResultEntry | undefined;

    if (indexPart === 'last') {
      entry = ctx.toolResults[ctx.toolResults.length - 1];
    } else {
      const idx = parseInt(indexPart, 10);
      if (!isNaN(idx)) {
        entry = ctx.toolResults[idx];
      }
    }

    if (!entry) return undefined;

    // Access the result field
    const resultObj = entry.result as Record<string, unknown> | undefined;
    if (!resultObj || typeof resultObj !== 'object') return undefined;

    const fieldPath = parts.slice(2);
    return accessNested(resultObj, fieldPath);
  }

  return undefined;
}

/**
 * Access a nested property via a path array.
 */
function accessNested(obj: unknown, path: string[]): unknown | undefined {
  let current = obj;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Parse a literal string into its native type.
 * "32" → 32, "true" → true, "hello" → "hello"
 */
function parseLiteral(value: string): unknown {
  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  // Null
  if (value === 'null' || value === 'none') return null;
  // String (keep as-is)
  return value;
}

/**
 * Strip surrounding quotes from a string value.
 * "hello" → hello, 'world' → world
 */
function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
