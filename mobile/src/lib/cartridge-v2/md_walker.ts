/**
 * md_walker — Markdown parser for v2 cartridge documents.
 *
 * Extracts three things from a .md file:
 *   1. YAML frontmatter (between --- delimiters)
 *   2. tool-call blocks (```tool-call ... ```)
 *   3. Prose (everything else)
 *   4. Cross-references ([text](#id) links)
 *
 * Pure functions, no I/O. Deterministic parsing — no LLM involved.
 */

import yaml from 'js-yaml';
import type { DocFrontmatter, ToolCallBlock, ParsedDoc } from './types';

// =============================================================================
// Public API
// =============================================================================

/**
 * Parse only the frontmatter from a markdown document.
 * Lightweight — skips body parsing entirely.
 */
export function parseFrontmatter(content: string): DocFrontmatter {
  const fm = extractFrontmatterRaw(content);
  if (!fm) {
    return { id: '', title: '' };
  }
  const parsed = yaml.load(fm) as Record<string, unknown>;
  return {
    id: String(parsed.id ?? ''),
    title: String(parsed.title ?? ''),
    purpose: parsed.purpose as string | undefined,
    entry_intents: parsed.entry_intents as string[] | undefined,
    prerequisites: parsed.prerequisites as string[] | undefined,
    produces: parsed.produces as string | undefined,
    next_candidates: parsed.next_candidates as string[] | undefined,
    tools_required: parsed.tools_required as string[] | undefined,
    confidence: parsed.confidence as number | undefined,
    routes: parsed.routes as Array<{ intent: string; next: string }> | undefined,
    ...parsed,
  };
}

/**
 * Full parse of a markdown document — frontmatter + prose + tool-calls + cross-refs.
 */
export function parseDoc(content: string): ParsedDoc {
  const frontmatter = parseFrontmatter(content);
  const body = extractBody(content);
  const toolCalls = extractToolCalls(body);
  const crossRefs = extractCrossRefs(body);
  const prose = extractProse(body);

  return { frontmatter, prose, toolCalls, crossRefs };
}

/**
 * Extract tool-call blocks from the document body.
 * Each block is a fenced code block with language tag "tool-call".
 */
export function extractToolCalls(body: string): ToolCallBlock[] {
  const results: ToolCallBlock[] = [];
  const regex = /```tool-call\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    const raw = match[1].trim();
    const lineNumber = countLines(body, match.index);

    try {
      const parsed = yaml.load(raw) as Record<string, unknown>;
      const tool = String(parsed.tool ?? '');
      const rawArgs = (parsed.args ?? {}) as Record<string, unknown>;

      // Convert all arg values to strings (they may be numbers/booleans in YAML)
      const args: Record<string, string> = {};
      for (const [key, val] of Object.entries(rawArgs)) {
        args[key] = String(val);
      }

      results.push({ tool, args, raw, lineNumber });
    } catch {
      // Malformed YAML in tool-call block — skip but log
      results.push({ tool: '', args: {}, raw, lineNumber });
    }
  }

  return results;
}

/**
 * Extract cross-reference doc IDs from markdown links of the form [text](#id).
 */
export function extractCrossRefs(body: string): string[] {
  const refs: string[] = [];
  const regex = /\[([^\]]*)\]\(#([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    refs.push(match[2]);
  }

  return [...new Set(refs)]; // deduplicate
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Extract raw frontmatter YAML string (between first pair of --- delimiters).
 */
function extractFrontmatterRaw(content: string): string | null {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return null;

  const endIdx = lines.indexOf('---', 1);
  if (endIdx === -1) return null;

  return lines.slice(1, endIdx).join('\n');
}

/**
 * Extract the body (everything after frontmatter).
 */
function extractBody(content: string): string {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return content;

  const endIdx = lines.indexOf('---', 1);
  if (endIdx === -1) return content;

  return lines.slice(endIdx + 1).join('\n');
}

/**
 * Extract prose blocks: everything that ISN'T inside a tool-call fence.
 */
function extractProse(body: string): string[] {
  // Split on tool-call blocks
  const parts = body.split(/```tool-call[\s\S]*?```/g);
  return parts
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Count the line number (1-indexed) of an offset position in a string.
 */
function countLines(text: string, offset: number): number {
  let count = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') count++;
  }
  return count;
}
