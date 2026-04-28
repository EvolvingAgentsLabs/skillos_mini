/**
 * BlackboardChatAdapter — serializes blackboard state for multi-turn chat context.
 *
 * After a cartridge flow completes, the blackboard contains all produced values
 * (diagnosis, quote, compliance results, etc.). This adapter formats those into
 * concise context that fits within a small model's context window (~4K tokens).
 *
 * Used by ChatView to enable follow-up questions like:
 *   "change the labor rate to 800"
 *   "add a circuit breaker to the quote"
 *   "why did compliance flag the RCD?"
 */

import type { BlackboardSnapshot } from "./types";

export interface ChatContext {
  /** Compact summary of blackboard state for injection into LLM system prompt */
  summary: string;
  /** Individual key summaries for targeted retrieval */
  entries: Array<{ key: string; producer: string; preview: string }>;
  /** Estimated token count of the summary */
  estimatedTokens: number;
}

/** Default ceiling for the summary size in estimated tokens. */
const DEFAULT_MAX_TOKENS = 1000;

/** Threshold (in characters) above which an object value is collapsed. */
const OBJECT_CHAR_LIMIT = 2000;

/** Threshold (in characters) above which a string value is truncated. */
const STRING_CHAR_LIMIT = 500;

/** Keys that are always excluded from the summary (already known by the LLM). */
const IMPLICIT_KEYS = new Set(["user_goal"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Rough token estimate: ~4 characters per token on average for mixed content. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Produce a short human-readable preview of an arbitrary value.
 *
 * - Strings longer than `STRING_CHAR_LIMIT` are truncated.
 * - Objects whose JSON representation exceeds `OBJECT_CHAR_LIMIT` are collapsed
 *   to a key-count hint.
 * - Primitives are stringified directly.
 */
function previewValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value === "string") {
    if (value.length > STRING_CHAR_LIMIT) {
      return value.slice(0, STRING_CHAR_LIMIT) + "... (truncated)";
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  // Arrays and objects
  if (typeof value === "object") {
    let json: string;
    try {
      json = JSON.stringify(value);
    } catch {
      return "[unserializable object]";
    }

    if (json.length > OBJECT_CHAR_LIMIT) {
      if (Array.isArray(value)) {
        return `[array, ${value.length} items]`;
      }
      const keyCount = Object.keys(value as Record<string, unknown>).length;
      return `[object, ${keyCount} keys]`;
    }

    // For smaller objects, still cap the string length for the preview line.
    if (json.length > STRING_CHAR_LIMIT) {
      return json.slice(0, STRING_CHAR_LIMIT) + "... (truncated)";
    }
    return json;
  }

  return String(value);
}

/**
 * Normalize a blackboard key for fuzzy matching: lowercase and strip
 * underscores / hyphens.
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialize a blackboard snapshot into chat context.
 * Truncates large values, skips binary/image data, focuses on
 * the most relevant keys for follow-up conversation.
 */
export function summarizeBlackboard(
  snapshot: BlackboardSnapshot,
  opts?: { maxTokens?: number; excludeKeys?: string[] },
): ChatContext {
  const maxTokens = opts?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const excludeSet = new Set([
    ...IMPLICIT_KEYS,
    ...(opts?.excludeKeys ?? []),
  ]);

  const entries: ChatContext["entries"] = [];
  const lines: string[] = [];
  let runningTokens = 0;

  for (const [key, entry] of Object.entries(snapshot)) {
    if (excludeSet.has(key)) continue;

    const preview = previewValue(entry.value);
    const producer = entry.produced_by || "unknown";
    const line = `- **${key}** (from ${producer}): ${preview}`;

    const lineTokens = estimateTokens(line);
    if (runningTokens + lineTokens > maxTokens) {
      // Budget exhausted — stop adding entries.
      break;
    }

    entries.push({ key, producer, preview });
    lines.push(line);
    runningTokens += lineTokens;
  }

  const summary = lines.join("\n");

  return {
    summary,
    entries,
    estimatedTokens: runningTokens,
  };
}

/**
 * Build a system prompt suffix that injects blackboard context
 * for a follow-up turn. The LLM sees what was produced and can
 * answer questions or accept edits.
 */
export function buildFollowUpContext(
  snapshot: BlackboardSnapshot,
  cartridge: string,
  flow: string,
): string {
  const { summary } = summarizeBlackboard(snapshot);

  return [
    "## Current job context",
    `Cartridge: ${cartridge} | Flow: ${flow}`,
    "",
    "### Blackboard state",
    summary,
    "",
    "The user may ask follow-up questions about these results or request edits.",
    "When editing a value, describe the change clearly.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Edit-intent detection
// ---------------------------------------------------------------------------

/**
 * Patterns that signal an edit intent. Each pattern must contain a named
 * capture group `target` (the thing being edited) and optionally `rest`
 * (the instruction / new value portion).
 *
 * Order matters: the first matching pattern wins.
 */
const EDIT_PATTERNS: RegExp[] = [
  // "change X to Y" / "cambia X a Y"
  /\b(?:change|cambia(?:r)?)\s+(?:the\s+)?(?<target>.+?)\s+(?:to|a)\s+(?<rest>.+)/i,
  // "set X to Y" / "poner X en Y"
  /\b(?:set|poner)\s+(?:the\s+)?(?<target>.+?)\s+(?:to|en)\s+(?<rest>.+)/i,
  // "update X ..." / "actualizar X ..."
  /\b(?:update|actualiza(?:r)?)\s+(?:the\s+)?(?<target>.+?)(?:\s+(?:to|with|con)\s+(?<rest>.+))?$/i,
  // "modify X ..." / "modificar X ..."
  /\b(?:modify|modifica(?:r)?)\s+(?:the\s+)?(?<target>.+?)(?:\s+(?:to|with|con)\s+(?<rest>.+))?$/i,
];

/**
 * Parse a follow-up user message to detect edit intents.
 * Returns null if no edit detected, otherwise returns the key
 * and proposed change.
 */
export function detectEditIntent(
  message: string,
  availableKeys: string[],
): { key: string; instruction: string } | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  // Build a lookup: normalizedKey -> originalKey
  const keyLookup = new Map<string, string>();
  for (const k of availableKeys) {
    keyLookup.set(normalizeKey(k), k);
  }

  for (const pattern of EDIT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match?.groups) continue;

    const rawTarget = match.groups["target"]?.trim();
    if (!rawTarget) continue;

    const instruction = match.groups["rest"]?.trim() ?? trimmed;

    // Try to match the captured target against available keys.
    const normalizedTarget = normalizeKey(rawTarget);

    // 1) Exact normalized match
    const exactMatch = keyLookup.get(normalizedTarget);
    if (exactMatch) {
      return { key: exactMatch, instruction };
    }

    // 2) Substring / contains match — pick the first key whose normalized
    //    form contains (or is contained by) the normalized target.
    for (const [norm, original] of keyLookup) {
      if (norm.includes(normalizedTarget) || normalizedTarget.includes(norm)) {
        return { key: original, instruction };
      }
    }
  }

  return null;
}
