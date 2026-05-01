/**
 * run_navigator — Orchestrates a v2 Navigator session for a project.
 *
 * This is the v2 equivalent of `run_project.ts`. It:
 *   1. Creates a Navigator with the project's cartridge
 *   2. Wires NavigatorEvents to the UI event system
 *   3. Records the session trace
 *
 * Coexists with v1 `run_project.ts` during migration.
 */

import { Navigator, type NavigatorConfig } from '../cartridge-v2/navigator';
import { createToolRegistry, registerModule } from '../cartridge-v2/tool_invoker';
import { navigatorEventToRunEvent } from '../cartridge-v2/ui_compat';
import { extractTrace, serializeTrace } from '../cartridge-v2/trace_emitter';
import type { NavigatorDeps, NavigatorEvent, NavState } from '../cartridge-v2/types';
import { beginRun, endRun, pushEvent } from './run_events.svelte';

// Tool library modules — static imports for tree-shaking
import * as electrical from '../tool-library/electrical';
import * as safety from '../tool-library/safety';
import * as units from '../tool-library/units';
import * as pricing from '../tool-library/pricing';

// =============================================================================
// Types
// =============================================================================

export interface RunNavigatorOptions {
  /** Cartridge base path (relative to app storage). */
  basePath: string;
  /** All .md doc paths within the cartridge. */
  docPaths: string[];
  /** User's task/goal. */
  userTask: string;
  /** Async file reader (reads from IndexedDB or bundled assets). */
  readFile: (path: string) => Promise<string>;
  /** LLM inference function. */
  infer: (system: string, user: string) => Promise<string>;
  /** Optional: pre-set blackboard values (e.g. from user interview). */
  initialContext?: Record<string, unknown>;
  /** Optional: max hops override. */
  maxHops?: number;
  /** Optional: event listener for raw NavigatorEvents. */
  onEvent?: (event: NavigatorEvent) => void;
}

export interface RunNavigatorResult {
  ok: boolean;
  state: NavState;
  trace: string;
  durationMs: number;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Run a v2 navigator session. Returns when navigation is complete.
 */
export async function runNavigator(
  projectId: string,
  opts: RunNavigatorOptions,
): Promise<RunNavigatorResult> {
  const startedAt = Date.now();

  // Build tool registry
  const registry = createToolRegistry();
  registerModule(registry, 'electrical', electrical);
  registerModule(registry, 'safety', safety);
  registerModule(registry, 'units', units);
  registerModule(registry, 'pricing', pricing);

  // Navigator dependencies
  const deps: NavigatorDeps = {
    infer: opts.infer,
    readFile: opts.readFile,
  };

  const config: NavigatorConfig = {
    basePath: opts.basePath,
    docPaths: opts.docPaths,
    userTask: opts.userTask,
    registry,
    maxHops: opts.maxHops,
  };

  const nav = new Navigator(deps, config);

  // Pre-set initial context
  if (opts.initialContext) {
    for (const [key, value] of Object.entries(opts.initialContext)) {
      nav.provideUserInput(key, value);
    }
  }

  // Wire events
  beginRun(projectId);
  nav.onEvent((event) => {
    opts.onEvent?.(event);
    const runEvent = navigatorEventToRunEvent(event);
    if (runEvent) pushEvent(runEvent as any);
  });

  // Run
  const finalState = await nav.run();
  endRun();

  // Extract and serialize trace
  const traceObj = extractTrace(finalState, new Date(startedAt).toISOString());
  const traceStr = serializeTrace(traceObj);

  return {
    ok: finalState.phase === 'done',
    state: finalState,
    trace: traceStr,
    durationMs: Date.now() - startedAt,
  };
}
