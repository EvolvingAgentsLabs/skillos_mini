/**
 * Navigator — v2 cartridge state machine.
 *
 * Phases:
 *   IDLE → LOADING → ROUTING → WALKING → COMPOSING → DONE
 *
 * The Navigator:
 *   1. Loads the cartridge (MANIFEST + index + tool verification)
 *   2. Routes user task to an entry document (via LLM)
 *   3. Walks the document tree:
 *      a. Parse doc → extract tool-calls + prose + cross-refs
 *      b. Resolve args → invoke tools deterministically
 *      c. Ask LLM to pick next cross-ref (or declare done)
 *   4. Composes final artifact (if cartridge specifies one)
 *
 * Key design: the LLM NEVER generates tool calls. All tool execution is
 * pre-parsed from markdown and executed deterministically by this module.
 */

import type {
  NavPhase,
  NavState,
  NavigatorEvent,
  NavigatorDeps,
  InferenceFn,
  FileReaderFn,
  CartridgeManifestV2,
  ToolResultEntry,
  WalkLogEntry,
  TerminationReason,
} from './types';
import { parseDoc } from './md_walker';
import { resolveArgs, type ResolverContext } from './arg_resolver';
import { Blackboard } from './blackboard';
import { invokeTool, type ToolRegistry } from './tool_invoker';
import { loadCartridge, type CartridgeBundle } from './cartridge_loader';
import { compactContext } from './context_compactor';
import type { ToolContext } from '../tool-library/types';

// =============================================================================
// Types
// =============================================================================

export interface NavigatorConfig {
  /** Base path to the cartridge directory. */
  basePath: string;
  /** List of all .md doc paths in the cartridge (excluding MANIFEST). */
  docPaths: string[];
  /** User's task/question. */
  userTask: string;
  /** Tool registry with all required tools registered. */
  registry: ToolRegistry;
  /** Max hops override (defaults to cartridge manifest setting). */
  maxHops?: number;
}

export type EventListener = (event: NavigatorEvent) => void;

// =============================================================================
// Navigator class
// =============================================================================

export class Navigator {
  private state: NavState;
  private deps: NavigatorDeps;
  private config: NavigatorConfig;
  private blackboard: Blackboard;
  private listener: EventListener | null = null;
  private startedAt: string;

  constructor(deps: NavigatorDeps, config: NavigatorConfig) {
    this.deps = deps;
    this.config = config;
    this.blackboard = new Blackboard();
    this.startedAt = new Date().toISOString();

    this.state = {
      phase: 'idle',
      cartridgeId: '',
      userTask: config.userTask,
      manifest: null,
      frontmatterIndex: new Map(),
      dataRegistry: new Map(),
      entryDocId: null,
      currentDocId: null,
      visitedDocs: new Set(),
      hopCount: 0,
      maxHops: config.maxHops ?? 12,
      toolResults: [],
      walkLog: [],
      terminationReason: null,
      artifactUri: null,
      error: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Subscribe to navigator events. */
  onEvent(listener: EventListener): void {
    this.listener = listener;
  }

  /** Get current phase. */
  getPhase(): NavPhase {
    return this.state.phase;
  }

  /** Get full state (read-only snapshot). */
  getState(): Readonly<NavState> {
    return this.state;
  }

  /** Get blackboard for external reads. */
  getBlackboard(): Blackboard {
    return this.blackboard;
  }

  /** Provide a user answer to an unresolved arg. */
  provideUserInput(key: string, value: unknown): void {
    this.blackboard.set(key, value as any, 'user', 'user_input');
  }

  /**
   * Run the full navigation session.
   * Resolves when done/error. Emits events along the way.
   */
  async run(): Promise<NavState> {
    try {
      await this.phaseLoading();
      await this.phaseRouting();
      await this.phaseWalking();
      // COMPOSING is optional — only if cartridge declares a final artifact
      this.transition('done');
      this.emit({ type: 'nav-end', terminationReason: this.state.terminationReason ?? 'completed' });
    } catch (err) {
      this.state.error = err instanceof Error ? err.message : String(err);
      this.transition('error');
      this.emit({ type: 'error', message: this.state.error });
    }
    return this.state;
  }

  // ---------------------------------------------------------------------------
  // Phase: LOADING
  // ---------------------------------------------------------------------------

  private async phaseLoading(): Promise<void> {
    this.transition('loading');

    const result = await loadCartridge(
      this.config.basePath,
      this.config.docPaths,
      this.deps.readFile,
      this.config.registry,
    );

    if (!result.ok) {
      throw new Error(`Cartridge load failed: ${result.error}`);
    }

    const { bundle } = result;
    this.state.manifest = bundle.manifest;
    this.state.cartridgeId = bundle.manifest.id;
    this.state.maxHops = this.config.maxHops ?? bundle.manifest.navigation?.max_hops ?? 12;
    this.state.frontmatterIndex = bundle.index.docs;

    // Apply cartridge locale defaults to blackboard
    if (bundle.manifest.locale) {
      this.blackboard.setDefaults(
        bundle.manifest.locale as unknown as Record<string, any>,
        bundle.manifest.id,
      );
    }

    this.emit({ type: 'nav-start', cartridgeId: this.state.cartridgeId, task: this.state.userTask });
  }

  // ---------------------------------------------------------------------------
  // Phase: ROUTING
  // ---------------------------------------------------------------------------

  private async phaseRouting(): Promise<void> {
    this.transition('routing');

    const manifest = this.state.manifest!;

    // If cartridge has entry_index, try to use that directly
    if (manifest.entry_index) {
      this.state.entryDocId = manifest.entry_index.replace(/\.md$/, '');
      // Read the index doc to see if it has routes
      try {
        const indexContent = await this.deps.readFile(
          `${this.config.basePath}/${manifest.entry_index}`,
        );
        const indexDoc = parseDoc(indexContent);

        // If the index doc has routes, use LLM to match
        if (indexDoc.frontmatter.routes && indexDoc.frontmatter.routes.length > 0) {
          const routeOptions = indexDoc.frontmatter.routes
            .map(r => `- "${r.intent}" → #${r.next}`)
            .join('\n');

          const system = `You are a router. Pick the best route for the user's task. Reply with ONLY the doc id (e.g. "cable_subdimensionado"). If no route matches, reply "none".`;
          const user = `Task: ${this.state.userTask}\n\nRoutes:\n${routeOptions}`;

          this.emit({ type: 'llm-turn', purpose: 'routing' });
          const response = await this.deps.infer(system, user);
          const picked = response.trim().replace(/^#/, '');

          if (picked !== 'none' && this.state.frontmatterIndex.has(picked)) {
            this.state.entryDocId = picked;
          }
        }
      } catch {
        // If index is unreadable, proceed with manifest's entry_index as fallback
      }
    }

    if (!this.state.entryDocId) {
      throw new Error('No entry document found for routing');
    }
  }

  // ---------------------------------------------------------------------------
  // Phase: WALKING
  // ---------------------------------------------------------------------------

  private async phaseWalking(): Promise<void> {
    this.transition('walking');
    this.state.currentDocId = this.state.entryDocId;

    while (this.state.currentDocId && this.state.hopCount < this.state.maxHops) {
      const docId = this.state.currentDocId;
      this.state.visitedDocs.add(docId);
      this.state.hopCount++;

      // Read and parse the current document
      const docPath = this.resolveDocPath(docId);
      const content = await this.deps.readFile(docPath);
      const doc = parseDoc(content);

      this.emit({ type: 'doc-enter', docId, title: doc.frontmatter.title || docId });

      // Execute tool-calls deterministically
      const docToolResults: ToolResultEntry[] = [];
      for (const toolCall of doc.toolCalls) {
        const ctx: ResolverContext = {
          getBlackboard: (key) => this.blackboard.get(key),
          toolResults: this.state.toolResults,
        };

        const { resolved, unresolved } = resolveArgs(toolCall.args, ctx);

        // If there are unresolved args, ask the user
        if (unresolved.length > 0) {
          for (const key of unresolved) {
            this.emit({ type: 'ask-user', key, prompt: `Ingrese ${key}:` });
          }
          // In a real implementation, we'd pause here for user input.
          // For now, skip this tool call if args are unresolved.
          continue;
        }

        this.emit({ type: 'tool-call', tool: toolCall.tool, args: resolved });

        const toolCtx: ToolContext = {
          cartridgeId: this.state.cartridgeId,
          cartridgeVersion: this.state.manifest?.version ?? 2,
          locale: this.state.manifest?.locale as any ?? {
            region: 'UY', currency: 'UYU', language: 'es-UY',
          },
          cartridgeData: { read: () => { throw new Error('no data'); }, has: () => false },
        };

        const start = Date.now();
        const invokeResult = invokeTool(this.config.registry, toolCall.tool, resolved, toolCtx);
        const durationMs = Date.now() - start;

        const entry: ToolResultEntry = {
          tool: toolCall.tool,
          args: resolved,
          result: invokeResult.result ?? { error: invokeResult.error },
          docId,
          timestamp: Date.now(),
          durationMs,
        };

        docToolResults.push(entry);
        this.state.toolResults.push(entry);

        this.emit({ type: 'tool-result', tool: toolCall.tool, result: entry.result });

        // Write tool results to blackboard
        if (invokeResult.ok && invokeResult.result && typeof invokeResult.result === 'object') {
          this.blackboard.setFromToolResult(
            invokeResult.result as Record<string, any>,
            toolCall.tool,
          );
        }
      }

      // Record walk log
      const walkEntry: WalkLogEntry = {
        docId,
        title: doc.frontmatter.title || docId,
        toolsCalled: docToolResults.map(tr => tr.tool),
        summary: this.buildDocSummary(docToolResults),
        timestamp: Date.now(),
      };
      this.state.walkLog.push(walkEntry);

      // If no cross-refs, we've reached a terminal document
      if (doc.crossRefs.length === 0) {
        this.state.terminationReason = 'completed';
        break;
      }

      // Ask LLM to pick next step
      const compacted = compactContext({
        userTask: this.state.userTask,
        currentProse: doc.prose,
        currentToolResults: docToolResults,
        walkLog: this.state.walkLog,
        blackboard: this.blackboard,
        crossRefs: doc.crossRefs,
      });

      const system = `You are navigating a technical cartridge. Based on the context, pick the best next document to visit. Reply with ONLY the doc id (e.g. "#presupuesto_recableado") or "DONE" if the task is complete.`;

      this.emit({ type: 'llm-turn', purpose: 'pick-next' });
      const response = await this.deps.infer(system, compacted);
      const nextId = response.trim().replace(/^#/, '');

      if (nextId === 'DONE' || nextId === 'done') {
        this.state.terminationReason = 'completed';
        break;
      }

      if (this.state.frontmatterIndex.has(nextId) || doc.crossRefs.includes(nextId)) {
        this.state.currentDocId = nextId;
      } else {
        // LLM gave invalid ref — treat as dead end
        this.state.terminationReason = 'dead_end';
        break;
      }
    }

    // Check if we hit max hops
    if (this.state.hopCount >= this.state.maxHops && !this.state.terminationReason) {
      this.state.terminationReason = 'max_hops';
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private transition(phase: NavPhase): void {
    const from = this.state.phase;
    this.state.phase = phase;
    this.emit({ type: 'phase-change', from, to: phase });
  }

  private emit(event: NavigatorEvent): void {
    if (this.listener) this.listener(event);
  }

  private resolveDocPath(docId: string): string {
    // Try common patterns: docId.md, docId/index.md, find in docPaths
    const candidates = [
      `${this.config.basePath}/${docId}.md`,
      `${this.config.basePath}/${docId}/index.md`,
    ];

    // Check if any doc path contains the id
    for (const path of this.config.docPaths) {
      if (path.includes(docId)) return path;
    }

    return candidates[0]; // fallback to simplest path
  }

  private buildDocSummary(toolResults: ToolResultEntry[]): string {
    if (toolResults.length === 0) return 'no tools called';
    const verdicts = toolResults.map(tr => {
      const v = (tr.result as any)?.verdict ?? '?';
      return `${tr.tool.split('.').pop()}:${v}`;
    });
    return verdicts.join(', ');
  }
}
