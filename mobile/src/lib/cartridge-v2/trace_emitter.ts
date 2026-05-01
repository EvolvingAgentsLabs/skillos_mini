/**
 * trace_emitter — Emits session traces for dream consolidation.
 *
 * Produces a structured trace of the navigator session:
 *   - Which docs were visited and in what order
 *   - Tool calls and their results
 *   - LLM turns (purpose, duration)
 *   - Final outcome
 *
 * Traces are YAML-frontmatter + markdown (matching the skillos trace format).
 */

import type { NavState, ToolResultEntry, WalkLogEntry, TerminationReason } from './types';

// =============================================================================
// Types
// =============================================================================

export interface SessionTrace {
  /** ISO timestamp when session started. */
  startedAt: string;
  /** ISO timestamp when session ended. */
  endedAt: string;
  /** Cartridge that was loaded. */
  cartridgeId: string;
  /** Original user task. */
  userTask: string;
  /** How the session ended. */
  terminationReason: TerminationReason;
  /** Number of docs visited. */
  hopCount: number;
  /** Walk log (doc visits). */
  walkLog: WalkLogEntry[];
  /** All tool calls with results. */
  toolResults: ToolResultEntry[];
  /** Total session duration in ms. */
  durationMs: number;
  /** Generated artifact URI (if any). */
  artifactUri: string | null;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Extract a SessionTrace from the final NavState.
 */
export function extractTrace(
  state: NavState,
  startedAt: string,
): SessionTrace {
  return {
    startedAt,
    endedAt: new Date().toISOString(),
    cartridgeId: state.cartridgeId,
    userTask: state.userTask,
    terminationReason: state.terminationReason ?? 'completed',
    hopCount: state.hopCount,
    walkLog: state.walkLog,
    toolResults: state.toolResults,
    durationMs: Date.now() - new Date(startedAt).getTime(),
    artifactUri: state.artifactUri,
  };
}

/**
 * Serialize a SessionTrace to YAML-frontmatter + markdown format.
 * Compatible with the skillos dream consolidation reader.
 */
export function serializeTrace(trace: SessionTrace): string {
  const frontmatter = [
    '---',
    `timestamp: ${trace.endedAt}`,
    `cartridge_id: ${trace.cartridgeId}`,
    `goal: "${escapeYaml(trace.userTask)}"`,
    `outcome: ${trace.terminationReason === 'completed' ? 'success' : 'partial'}`,
    `source: cartridge_v2`,
    `hops: ${trace.hopCount}`,
    `duration_ms: ${trace.durationMs}`,
    trace.artifactUri ? `artifact_uri: ${trace.artifactUri}` : null,
    '---',
  ].filter(Boolean).join('\n');

  const walkSection = trace.walkLog.length > 0
    ? `## Walk Log\n\n${trace.walkLog.map(e =>
        `- **${e.docId}** (${e.title}): ${e.summary} [${e.toolsCalled.join(', ') || 'no tools'}]`
      ).join('\n')}`
    : '';

  const toolSection = trace.toolResults.length > 0
    ? `## Tool Calls\n\n${trace.toolResults.map(tr => {
        const verdict = (tr.result as any)?.verdict ?? 'unknown';
        return `- \`${tr.tool}\` → ${verdict} (${tr.durationMs}ms)`;
      }).join('\n')}`
    : '';

  return [frontmatter, '', `# Session: ${trace.userTask}`, '', walkSection, '', toolSection]
    .filter(s => s !== '')
    .join('\n');
}

// =============================================================================
// Internal
// =============================================================================

function escapeYaml(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
}
