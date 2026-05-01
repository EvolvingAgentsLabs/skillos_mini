/**
 * Cartridge v2 Runtime — Public API
 */

// Types
export type {
  NavPhase,
  NavState,
  CartridgeManifestV2,
  DocFrontmatter,
  ToolCallBlock,
  ParsedDoc,
  ToolResultEntry,
  WalkLogEntry,
  BlackboardValue,
  BlackboardSource,
  BlackboardEntry,
  SerializedBlackboard,
  NavigatorEvent,
  InferenceFn,
  FileReaderFn,
  NavigatorDeps,
  TerminationReason,
} from './types';

// Foundation
export { parseDoc, parseFrontmatter, extractToolCalls, extractCrossRefs } from './md_walker';
export { resolveArgs, resolveExpression } from './arg_resolver';
export { Blackboard } from './blackboard';

// Tool wiring
export { createToolRegistry, registerModule, invokeTool, verifyTools } from './tool_invoker';
export type { ToolRegistry, ToolFn, InvokeResult } from './tool_invoker';
export { buildFrontmatterIndex, getDoc, validateCrossRefs } from './frontmatter_index';
export type { FrontmatterIndex } from './frontmatter_index';
export { loadCartridge } from './cartridge_loader';
export type { CartridgeBundle, LoadResult } from './cartridge_loader';

// Navigator
export { Navigator } from './navigator';
export type { NavigatorConfig, EventListener } from './navigator';
export { compactContext } from './context_compactor';
export type { CompactorInput, CompactorConfig } from './context_compactor';
export { extractTrace, serializeTrace } from './trace_emitter';
export type { SessionTrace } from './trace_emitter';

// UI compatibility
export { manifestV2ToLegacy, navigatorEventToRunEvent } from './ui_compat';
export type { CartridgeManifest, CartridgeUI, CartridgeUIAction, RunEvent } from './ui_compat';

// LLM adapter
export { wrapProviderAsInferenceFn } from './llm_adapter';
