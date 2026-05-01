/**
 * Blackboard — Typed session context (key-value store)
 *
 * The single source of truth for all data accumulated during a navigation session.
 * Values come from: user input, LLM inference, tool results, or cartridge defaults.
 *
 * Features:
 *   - Typed get/set/has/delete
 *   - Source tracking (who produced the value and when)
 *   - Serialize/deserialize for persistence (IndexedDB)
 *   - Summarize for context compaction (one-line per entry)
 */

import type {
  BlackboardValue,
  BlackboardSource,
  BlackboardEntry,
  SerializedBlackboard,
} from './types';

// =============================================================================
// Blackboard Class
// =============================================================================

export class Blackboard {
  private entries: Map<string, BlackboardEntry> = new Map();

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /** Set a value on the blackboard with source tracking. */
  set(
    key: string,
    value: BlackboardValue,
    source: BlackboardSource,
    producedBy: string,
    confidence?: number,
  ): void {
    this.entries.set(key, {
      value,
      source,
      producedAt: new Date().toISOString(),
      producedBy,
      confidence,
    });
  }

  /** Get a value by key. Returns undefined if not present. */
  get(key: string): BlackboardValue | undefined {
    const entry = this.entries.get(key);
    return entry?.value;
  }

  /** Get the full entry (value + metadata). */
  getEntry(key: string): BlackboardEntry | undefined {
    return this.entries.get(key);
  }

  /** Check if a key exists. */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Delete a key. Returns true if the key existed. */
  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  /** Get all keys. */
  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  /** Get the number of entries. */
  get size(): number {
    return this.entries.size;
  }

  /** Clear all entries. */
  clear(): void {
    this.entries.clear();
  }

  // ---------------------------------------------------------------------------
  // Bulk operations
  // ---------------------------------------------------------------------------

  /** Set multiple values at once from a tool result. */
  setFromToolResult(
    values: Record<string, BlackboardValue>,
    toolName: string,
  ): void {
    for (const [key, value] of Object.entries(values)) {
      this.set(key, value, 'tool_result', toolName);
    }
  }

  /** Set multiple values from user input. */
  setFromUser(values: Record<string, BlackboardValue>): void {
    for (const [key, value] of Object.entries(values)) {
      this.set(key, value, 'user', 'user_input');
    }
  }

  /** Set cartridge defaults (only if keys don't already exist). */
  setDefaults(
    values: Record<string, BlackboardValue>,
    cartridgeId: string,
  ): void {
    for (const [key, value] of Object.entries(values)) {
      if (!this.has(key)) {
        this.set(key, value, 'cartridge_default', cartridgeId);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Filtered queries
  // ---------------------------------------------------------------------------

  /** Get all entries from a specific source. */
  getBySource(source: BlackboardSource): Record<string, BlackboardValue> {
    const result: Record<string, BlackboardValue> = {};
    for (const [key, entry] of this.entries) {
      if (entry.source === source) {
        result[key] = entry.value;
      }
    }
    return result;
  }

  /** Get all entries produced by a specific tool/actor. */
  getByProducer(producedBy: string): Record<string, BlackboardValue> {
    const result: Record<string, BlackboardValue> = {};
    for (const [key, entry] of this.entries) {
      if (entry.producedBy === producedBy) {
        result[key] = entry.value;
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /** Serialize to a plain object for IndexedDB storage. */
  serialize(): SerializedBlackboard {
    const result: SerializedBlackboard = {};
    for (const [key, entry] of this.entries) {
      result[key] = entry;
    }
    return result;
  }

  /** Restore from a serialized object. Replaces current state. */
  static deserialize(data: SerializedBlackboard): Blackboard {
    const board = new Blackboard();
    for (const [key, entry] of Object.entries(data)) {
      board.entries.set(key, entry);
    }
    return board;
  }

  // ---------------------------------------------------------------------------
  // Context compaction
  // ---------------------------------------------------------------------------

  /**
   * Produce a compact text summary suitable for LLM context.
   * One line per entry: "key = value (source)"
   * Arrays and objects are JSON-stringified inline.
   */
  summarize(): string {
    if (this.entries.size === 0) return '(empty)';

    const lines: string[] = [];
    for (const [key, entry] of this.entries) {
      const valueStr = formatValue(entry.value);
      lines.push(`${key} = ${valueStr} [${entry.source}]`);
    }
    return lines.join('\n');
  }

  /**
   * Produce a compact summary with a token budget.
   * Prioritizes user and tool_result entries over cartridge_default.
   */
  summarizeWithBudget(maxChars: number): string {
    if (this.entries.size === 0) return '(empty)';

    // Priority: user > tool_result > llm_inference > cartridge_default
    const priority: Record<BlackboardSource, number> = {
      user: 0,
      tool_result: 1,
      llm_inference: 2,
      cartridge_default: 3,
    };

    const sorted = Array.from(this.entries.entries()).sort(
      ([, a], [, b]) => priority[a.source] - priority[b.source],
    );

    const lines: string[] = [];
    let totalChars = 0;

    for (const [key, entry] of sorted) {
      const line = `${key} = ${formatValue(entry.value)} [${entry.source}]`;
      if (totalChars + line.length + 1 > maxChars) break;
      lines.push(line);
      totalChars += line.length + 1; // +1 for newline
    }

    if (lines.length < sorted.length) {
      lines.push(`... (${sorted.length - lines.length} more entries)`);
    }

    return lines.join('\n');
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Format a BlackboardValue for display. */
function formatValue(value: BlackboardValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // Arrays and objects — compact JSON
  return JSON.stringify(value);
}
