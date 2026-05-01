/**
 * context_compactor — Deterministic context window management for small LLMs.
 *
 * The on-device model (Gemma 4 E2B) has a limited context window.
 * This module builds the LLM prompt by prioritizing:
 *   1. User task (always present)
 *   2. Current doc prose + tool results
 *   3. Blackboard summary
 *   4. Walk history (one-line per visited doc, most recent first)
 *
 * No LLM calls — pure string assembly with a character budget.
 */

import type { WalkLogEntry, ToolResultEntry, AvailableToolsBlock } from './types';
import type { Blackboard } from './blackboard';

// =============================================================================
// Types
// =============================================================================

export interface CompactorInput {
  /** Original user task/question. */
  userTask: string;
  /** Prose blocks from the current document. */
  currentProse: string[];
  /** Tool results from the current document. */
  currentToolResults: ToolResultEntry[];
  /** Walk log (all visited docs so far). */
  walkLog: WalkLogEntry[];
  /** Session blackboard. */
  blackboard: Blackboard;
  /** Available cross-refs in current doc (for LLM to pick from). */
  crossRefs: string[];
}

export interface CompactorConfig {
  /** Max total characters for the user portion of the prompt. Default 3000. */
  maxChars?: number;
  /** Max walk-history entries to include. Default 5. */
  maxHistoryEntries?: number;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Build a compacted user-message for the LLM.
 * The system prompt is set externally; this produces the user content.
 */
export function compactContext(
  input: CompactorInput,
  config: CompactorConfig = {},
): string {
  const maxChars = config.maxChars ?? 3000;
  const maxHistory = config.maxHistoryEntries ?? 5;

  const sections: string[] = [];

  // Section 1: User task (always included)
  sections.push(`## Tarea del usuario\n${input.userTask}`);

  // Section 2: Current doc prose (trimmed if too long)
  if (input.currentProse.length > 0) {
    const prose = input.currentProse.join('\n\n');
    sections.push(`## Documento actual\n${prose}`);
  }

  // Section 3: Tool results from current doc
  if (input.currentToolResults.length > 0) {
    const resultLines = input.currentToolResults.map(tr => {
      const verdict = (tr.result as any)?.verdict ?? 'info';
      const reason = (tr.result as any)?.reason ?? JSON.stringify(tr.result);
      return `- ${tr.tool}: ${verdict} — ${reason}`;
    });
    sections.push(`## Resultados herramientas\n${resultLines.join('\n')}`);
  }

  // Section 4: Blackboard summary
  const bbSummary = input.blackboard.summarizeWithBudget(400);
  if (bbSummary !== '(empty)') {
    sections.push(`## Contexto sesión\n${bbSummary}`);
  }

  // Section 5: Walk history (most recent first, limited)
  if (input.walkLog.length > 0) {
    const historyEntries = input.walkLog
      .slice(-maxHistory)
      .reverse()
      .map(e => `- ${e.docId}: ${e.summary}`);
    sections.push(`## Historial\n${historyEntries.join('\n')}`);
  }

  // Section 6: Available next steps
  if (input.crossRefs.length > 0) {
    sections.push(`## Opciones siguiente paso\n${input.crossRefs.map(r => `- #${r}`).join('\n')}`);
  }

  // Assemble and trim to budget
  let result = sections.join('\n\n');
  if (result.length > maxChars) {
    result = trimToBudget(sections, maxChars);
  }

  return result;
}

// =============================================================================
// Hybrid Tool-Calling Context
// =============================================================================

export interface HybridContextInput {
  /** Original user task. */
  userTask: string;
  /** Prose from the current document. */
  currentProse: string[];
  /** Results from mandatory tool-calls already executed. */
  mandatoryResults: ToolResultEntry[];
  /** Results from previous LLM tool-call turns in this doc. */
  hybridResults: ToolResultEntry[];
  /** Available tools the LLM may call. */
  availableTools: AvailableToolsBlock;
  /** Session blackboard. */
  blackboard: Blackboard;
}

/**
 * Build the user-message for an LLM hybrid tool-calling turn.
 * Includes: user task, doc prose, mandatory results, available tools list.
 */
export function compactHybridContext(
  input: HybridContextInput,
  config: CompactorConfig = {},
): string {
  const maxChars = config.maxChars ?? 3000;
  const sections: string[] = [];

  sections.push(`## Tarea\n${input.userTask}`);

  if (input.currentProse.length > 0) {
    const prose = input.currentProse.join('\n\n');
    sections.push(`## Guía del documento\n${prose}`);
  }

  if (input.mandatoryResults.length > 0) {
    const lines = input.mandatoryResults.map(tr => {
      const verdict = (tr.result as any)?.verdict ?? 'info';
      const reason = (tr.result as any)?.reason ?? JSON.stringify(tr.result);
      return `- ${tr.tool}: ${verdict} — ${reason}`;
    });
    sections.push(`## Resultados obligatorios\n${lines.join('\n')}`);
  }

  if (input.hybridResults.length > 0) {
    const lines = input.hybridResults.map(tr => {
      const verdict = (tr.result as any)?.verdict ?? 'info';
      const reason = (tr.result as any)?.reason ?? JSON.stringify(tr.result);
      return `- ${tr.tool}: ${verdict} — ${reason}`;
    });
    sections.push(`## Resultados previos (tus llamadas)\n${lines.join('\n')}`);
  }

  const bbSummary = input.blackboard.summarizeWithBudget(300);
  if (bbSummary !== '(empty)') {
    sections.push(`## Contexto sesión\n${bbSummary}`);
  }

  const toolList = input.availableTools.tools.map(t => `- ${t}`).join('\n');
  const purpose = input.availableTools.purpose
    ? `\nPropósito: ${input.availableTools.purpose}`
    : '';
  sections.push(`## Herramientas disponibles${purpose}\n${toolList}`);

  let result = sections.join('\n\n');
  if (result.length > maxChars) {
    result = trimToBudget(sections, maxChars);
  }
  return result;
}

// =============================================================================
// Composing Context
// =============================================================================

export interface ComposingContextInput {
  /** Original user task. */
  userTask: string;
  /** ALL tool results from the entire walk. */
  toolResults: ToolResultEntry[];
  /** Session blackboard. */
  blackboard: Blackboard;
  /** Walk log of visited docs. */
  walkLog: WalkLogEntry[];
}

/**
 * Build the user-message for the COMPOSING phase.
 * Higher budget (4000 chars) since this is the final synthesis turn.
 */
export function compactComposingContext(
  input: ComposingContextInput,
  config: CompactorConfig = {},
): string {
  const maxChars = config.maxChars ?? 4000;
  const sections: string[] = [];

  sections.push(`## Tarea del usuario\n${input.userTask}`);

  // Group tool results by doc
  if (input.toolResults.length > 0) {
    const lines = input.toolResults.map(tr => {
      const verdict = (tr.result as any)?.verdict ?? 'info';
      const reason = (tr.result as any)?.reason ?? JSON.stringify(tr.result);
      return `- [${tr.docId}] ${tr.tool}: ${verdict} — ${reason}`;
    });
    sections.push(`## Resultados herramientas\n${lines.join('\n')}`);
  }

  const bbSummary = input.blackboard.summarizeWithBudget(600);
  if (bbSummary !== '(empty)') {
    sections.push(`## Datos sesión\n${bbSummary}`);
  }

  if (input.walkLog.length > 0) {
    const history = input.walkLog
      .map(e => `- ${e.title}: ${e.summary}`)
      .join('\n');
    sections.push(`## Recorrido\n${history}`);
  }

  let result = sections.join('\n\n');
  if (result.length > maxChars) {
    result = trimToBudget(sections, maxChars);
  }
  return result;
}

// =============================================================================
// Internal
// =============================================================================

/**
 * Progressively trim sections from the end to fit budget.
 * Always keeps: user task + current doc + tool results.
 */
function trimToBudget(sections: string[], maxChars: number): string {
  // Try including all sections, removing from the end if over budget
  for (let i = sections.length; i >= 1; i--) {
    const candidate = sections.slice(0, i).join('\n\n');
    if (candidate.length <= maxChars) {
      return candidate;
    }
  }
  // Even the first section is too long — hard truncate
  return sections[0].slice(0, maxChars);
}
