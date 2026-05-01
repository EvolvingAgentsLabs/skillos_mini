/**
 * ui_compat — Compatibility shim for UI components.
 *
 * Provides CartridgeManifest-compatible shapes from v2 MANIFEST frontmatter.
 * This lets Svelte components keep their existing props/types while the
 * runtime switches from v1 CartridgeRunner to v2 Navigator.
 *
 * Phase D: UI components change import path only, not logic.
 * Phase E: Once all UI is validated, v1 files get deleted.
 */

import type { CartridgeManifestV2, NavigatorEvent } from './types';

// =============================================================================
// Legacy-compatible types (subset of v1 CartridgeManifest used by UI)
// =============================================================================

export interface CartridgeUIAction {
  label: string;
  flow: string;
  icon?: string;
}

export interface CartridgeUI {
  brand_color?: string;
  accent_color?: string;
  emoji?: string;
  primary_action?: CartridgeUIAction;
  secondary_actions?: CartridgeUIAction[];
  library_default_mode?: 'list' | 'portfolio';
}

/**
 * Legacy CartridgeManifest shape as used by UI components.
 * Adapts from CartridgeManifestV2 frontmatter.
 */
export interface CartridgeManifest {
  name: string;
  path: string;
  description: string;
  entry_intents: string[];
  type: 'standard' | 'js-skills';
  category?: string;
  tags?: string[];
  ui?: CartridgeUI;
  // Minimal subset — components only read these fields
  default_flow: string;
  preferred_tier: 'local' | 'cloud' | 'auto';
}

// =============================================================================
// Adapter: v2 manifest → legacy CartridgeManifest
// =============================================================================

/**
 * Convert a v2 CartridgeManifestV2 into the legacy CartridgeManifest shape
 * that 11+ Svelte components expect.
 */
export function manifestV2ToLegacy(v2: CartridgeManifestV2): CartridgeManifest {
  return {
    name: v2.title,
    path: v2.id,
    description: v2.description,
    entry_intents: v2.entry_intents,
    type: 'standard',
    default_flow: 'navigate',
    preferred_tier: 'local',
    category: 'trade',
    tags: v2.entry_intents,
    ui: {
      brand_color: '#2563EB',
      emoji: tradeEmoji(v2.id),
      primary_action: {
        label: 'Iniciar',
        flow: 'navigate',
      },
    },
  };
}

// =============================================================================
// Navigator event → legacy RunEvent adapter
// =============================================================================

export type RunEventType =
  | 'run-start'
  | 'step-start'
  | 'step-end'
  | 'tool-call'
  | 'run-end'
  | 'error';

export interface RunEvent {
  type: RunEventType;
  payload: Record<string, unknown>;
  timestamp: number;
}

/**
 * Convert NavigatorEvent to legacy RunEvent for UI consumption.
 */
export function navigatorEventToRunEvent(event: NavigatorEvent): RunEvent | null {
  const timestamp = Date.now();

  switch (event.type) {
    case 'nav-start':
      return { type: 'run-start', payload: { cartridgeId: event.cartridgeId, task: event.task }, timestamp };
    case 'doc-enter':
      return { type: 'step-start', payload: { docId: event.docId, title: event.title }, timestamp };
    case 'tool-call':
      return { type: 'tool-call', payload: { tool: event.tool, args: event.args }, timestamp };
    case 'nav-end':
      return { type: 'run-end', payload: { reason: event.terminationReason }, timestamp };
    case 'error':
      return { type: 'error', payload: { message: event.message }, timestamp };
    default:
      return null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function tradeEmoji(cartridgeId: string): string {
  if (cartridgeId.includes('electric')) return '⚡';
  if (cartridgeId.includes('plom') || cartridgeId.includes('plumb')) return '🔧';
  if (cartridgeId.includes('pint') || cartridgeId.includes('paint')) return '🎨';
  return '🔨';
}
