/**
 * v2 Cartridge Runtime — Type Definitions
 *
 * Core types for the Navigator, Markdown walker, and session management.
 */

// =============================================================================
// Navigator State Machine
// =============================================================================

export type NavPhase =
  | 'idle'
  | 'loading'
  | 'routing'
  | 'walking'
  | 'composing'
  | 'done'
  | 'error';

export type TerminationReason =
  | 'completed'
  | 'max_hops'
  | 'dead_end'
  | 'tool_error'
  | 'out_of_scope'
  | 'user_cancelled';

export interface NavState {
  phase: NavPhase;
  cartridgeId: string;
  userTask: string;

  // Phase 0 products
  manifest: CartridgeManifestV2 | null;
  frontmatterIndex: Map<string, DocFrontmatter>;
  dataRegistry: Map<string, unknown>;

  // Phase 1 product
  entryDocId: string | null;

  // Phase 2 state (walk loop)
  currentDocId: string | null;
  visitedDocs: Set<string>;
  hopCount: number;
  maxHops: number;

  // Accumulated state
  toolResults: ToolResultEntry[];
  walkLog: WalkLogEntry[];

  // Terminal
  terminationReason: TerminationReason | null;
  artifactUri: string | null;
  error: string | null;
}

// =============================================================================
// Cartridge Manifest (v2)
// =============================================================================

export interface CartridgeManifestV2 {
  type: 'cartridge';
  version: number;
  id: string;
  title: string;
  language: string;
  description: string;
  entry_intents: string[];
  entry_index: string;
  tools_required: string[];
  tools_optional?: string[];
  data?: string[];
  locale: CartridgeLocale;
  confidence: number;
  navigation?: { max_hops?: number };
  generated?: boolean;
  authored_by?: string;
  generated_at?: string;
}

export interface CartridgeLocale {
  region: string;
  currency: string;
  language: string;
  voltage_v?: number;
  frequency_hz?: number;
  tax_rate?: number;
}

// =============================================================================
// Document Types (parsed from .md files)
// =============================================================================

export interface DocFrontmatter {
  id: string;
  title: string;
  purpose?: string;
  entry_intents?: string[];
  prerequisites?: string[];
  produces?: string;
  next_candidates?: string[];
  tools_required?: string[];
  confidence?: number;
  routes?: Array<{ intent: string; next: string }>;
  [key: string]: unknown;
}

export interface ToolCallBlock {
  /** Dotted tool name, e.g. "electrical.checkWireGauge" */
  tool: string;
  /** Raw args — values may contain ${ctx.xxx} expressions */
  args: Record<string, string>;
  /** Original YAML text of the block */
  raw: string;
  /** Line number in the source doc (1-indexed) */
  lineNumber: number;
}

export interface ParsedDoc {
  frontmatter: DocFrontmatter;
  /** Prose blocks (text between tool-call blocks, stripped of fences) */
  prose: string[];
  /** Ordered tool-call blocks extracted from the doc body */
  toolCalls: ToolCallBlock[];
  /** Referenced doc IDs from [text](#id) links */
  crossRefs: string[];
}

// =============================================================================
// Tool Execution
// =============================================================================

export interface ToolResultEntry {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  docId: string;
  timestamp: number;
  durationMs: number;
}

// =============================================================================
// Walk Log
// =============================================================================

export interface WalkLogEntry {
  docId: string;
  title: string;
  toolsCalled: string[];
  /** One-line summary for context compaction */
  summary: string;
  timestamp: number;
}

// =============================================================================
// Session Blackboard
// =============================================================================

export type BlackboardValue =
  | string
  | number
  | boolean
  | null
  | BlackboardValue[]
  | { [key: string]: BlackboardValue };

export type BlackboardSource = 'user' | 'llm_inference' | 'tool_result' | 'cartridge_default';

export interface BlackboardEntry {
  value: BlackboardValue;
  source: BlackboardSource;
  producedAt: string;
  producedBy: string;
  confidence?: number;
}

export type SerializedBlackboard = Record<string, BlackboardEntry>;

// =============================================================================
// Navigator Events
// =============================================================================

export type NavigatorEvent =
  | { type: 'nav-start'; cartridgeId: string; task: string }
  | { type: 'phase-change'; from: NavPhase; to: NavPhase }
  | { type: 'doc-enter'; docId: string; title: string }
  | { type: 'tool-call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool-result'; tool: string; result: unknown }
  | { type: 'ask-user'; key: string; prompt: string }
  | { type: 'llm-turn'; purpose: string; tokens?: number }
  | { type: 'nav-end'; terminationReason: TerminationReason; artifactUri?: string }
  | { type: 'error'; message: string };

// =============================================================================
// Navigator Dependencies (injection)
// =============================================================================

/** Inference function: system prompt + user message → LLM response text */
export type InferenceFn = (system: string, user: string) => Promise<string>;

/** Reads a file from the cartridge directory (filesystem or IndexedDB) */
export type FileReaderFn = (relativePath: string) => Promise<string>;

export interface NavigatorDeps {
  infer: InferenceFn;
  readFile: FileReaderFn;
}
