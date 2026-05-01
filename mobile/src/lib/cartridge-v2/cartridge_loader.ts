/**
 * cartridge_loader — Loads and validates a v2 cartridge from its MANIFEST.md.
 *
 * Responsibilities:
 *   1. Parse MANIFEST.md → CartridgeManifestV2
 *   2. Verify all tools_required exist in the registry
 *   3. Register data files (JSON) as CartridgeDataAccessor
 *   4. Build the frontmatter index for all .md docs in the cartridge
 *
 * Returns a validated CartridgeBundle ready for the Navigator.
 */

import type {
  CartridgeManifestV2,
  FileReaderFn,
} from './types';
import type { CartridgeDataAccessor } from '../tool-library/types';
import { parseFrontmatter } from './md_walker';
import { buildFrontmatterIndex, type FrontmatterIndex } from './frontmatter_index';
import { verifyTools, type ToolRegistry } from './tool_invoker';

// =============================================================================
// Types
// =============================================================================

export interface CartridgeBundle {
  manifest: CartridgeManifestV2;
  index: FrontmatterIndex;
  data: CartridgeDataAccessor;
}

export type LoadResult =
  | { ok: true; bundle: CartridgeBundle }
  | { ok: false; error: string; missingTools?: string[] };

// =============================================================================
// Public API
// =============================================================================

/**
 * Load a cartridge from its base directory.
 *
 * @param basePath - Cartridge root directory path (contains MANIFEST.md)
 * @param docPaths - All .md file paths within the cartridge (excluding MANIFEST)
 * @param readFile - Async file reader
 * @param registry - Tool registry (to verify required tools)
 */
export async function loadCartridge(
  basePath: string,
  docPaths: string[],
  readFile: FileReaderFn,
  registry: ToolRegistry,
): Promise<LoadResult> {
  // 1. Read and parse MANIFEST.md
  let manifestContent: string;
  try {
    manifestContent = await readFile(`${basePath}/MANIFEST.md`);
  } catch {
    return { ok: false, error: `Cannot read MANIFEST.md in ${basePath}` };
  }

  const rawFm = parseFrontmatter(manifestContent);
  if (rawFm.id === '' || !rawFm.id) {
    return { ok: false, error: 'MANIFEST.md missing required "id" field' };
  }

  const manifest = rawFm as unknown as CartridgeManifestV2;

  // Validate type field
  if ((manifest as any).type !== 'cartridge') {
    return { ok: false, error: `MANIFEST.md type must be "cartridge", got "${(manifest as any).type}"` };
  }

  // 2. Verify required tools
  const missing = verifyTools(registry, manifest.tools_required ?? []);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required tools: ${missing.join(', ')}`,
      missingTools: missing,
    };
  }

  // 3. Build data accessor
  const data = await buildDataAccessor(basePath, manifest.data ?? [], readFile);

  // 4. Build frontmatter index
  const index = await buildFrontmatterIndex(docPaths, readFile);

  return {
    ok: true,
    bundle: { manifest, index, data },
  };
}

// =============================================================================
// Internal
// =============================================================================

async function buildDataAccessor(
  basePath: string,
  dataPaths: string[],
  readFile: FileReaderFn,
): Promise<CartridgeDataAccessor> {
  const dataStore = new Map<string, unknown>();

  for (const path of dataPaths) {
    try {
      const content = await readFile(`${basePath}/${path}`);
      const parsed = JSON.parse(content);
      dataStore.set(path, parsed);
    } catch {
      // Data file unreadable — leave it missing (tools will get undefined)
    }
  }

  return {
    read: <T>(path: string): T => {
      const data = dataStore.get(path);
      if (data === undefined) {
        throw new Error(`Data file not found: ${path}`);
      }
      return data as T;
    },
    has: (path: string): boolean => dataStore.has(path),
  };
}
