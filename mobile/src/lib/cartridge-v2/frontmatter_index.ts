/**
 * frontmatter_index — Scans cartridge .md files and builds a lightweight index.
 *
 * Only parses frontmatter (not body), so it's fast even for large cartridges.
 * The navigator uses this index for:
 *   - Routing: match user intent to entry docs
 *   - Link resolution: validate that cross-ref targets exist
 *   - Tool dependency: know which docs need which tools
 */

import type { DocFrontmatter, FileReaderFn } from './types';
import { parseFrontmatter } from './md_walker';

// =============================================================================
// Types
// =============================================================================

export interface FrontmatterIndex {
  /** All indexed docs by id. */
  docs: Map<string, DocFrontmatter>;
  /** Docs that have entry_intents (potential entry points). */
  entryDocs: DocFrontmatter[];
  /** All doc IDs in the index. */
  ids: string[];
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Build an index from a list of markdown file paths.
 * Only reads frontmatter — skips body parsing for speed.
 */
export async function buildFrontmatterIndex(
  filePaths: string[],
  readFile: FileReaderFn,
): Promise<FrontmatterIndex> {
  const docs = new Map<string, DocFrontmatter>();
  const entryDocs: DocFrontmatter[] = [];

  for (const path of filePaths) {
    try {
      const content = await readFile(path);
      const fm = parseFrontmatter(content);

      // Skip files without an id (not proper cartridge docs)
      if (!fm.id) continue;

      docs.set(fm.id, fm);

      if (fm.entry_intents && fm.entry_intents.length > 0) {
        entryDocs.push(fm);
      }
    } catch {
      // Skip unreadable files
    }
  }

  return {
    docs,
    entryDocs,
    ids: Array.from(docs.keys()),
  };
}

/**
 * Find a doc by id in the index.
 */
export function getDoc(index: FrontmatterIndex, id: string): DocFrontmatter | undefined {
  return index.docs.get(id);
}

/**
 * Validate that all cross-ref targets exist in the index.
 * Returns list of missing IDs.
 */
export function validateCrossRefs(
  index: FrontmatterIndex,
  crossRefs: string[],
): string[] {
  return crossRefs.filter(id => !index.docs.has(id));
}

/**
 * Get all docs that list a specific tool in their tools_required.
 */
export function docsRequiringTool(
  index: FrontmatterIndex,
  toolName: string,
): DocFrontmatter[] {
  const result: DocFrontmatter[] = [];
  for (const doc of index.docs.values()) {
    if (doc.tools_required?.includes(toolName)) {
      result.push(doc);
    }
  }
  return result;
}
