/**
 * Cartridge data contracts — mirrors dataclasses in
 * C:\evolvingagents\skillos\cartridge_runtime.py lines 192-248.
 */

export type AgentTier = "cheap" | "capable";

export interface AgentSpec {
  name: string;
  path: string;
  body: string;
  needs: string[];
  produces: string[];
  produces_schema: string;
  produces_description: string;
  tools: string[];
  max_turns: number;
  description: string;
  /**
   * Routing hint for M11 `resolveProvider`. `cheap` (default) prefers the
   * project's primary provider; `capable` skips local-first routing and goes
   * straight to the fallback when one is configured.
   */
  tier: AgentTier;
}

export interface SkillStep {
  skill: string;
  needs: string[];
  produces: string[];
  produces_schema: string;
  data_map: Record<string, string>;
  defaults: Record<string, unknown>;
}

export type FlowStep = string | SkillStep;

export type FlowMode = "standard" | "agentic";

export interface FlowDef {
  steps: FlowStep[];
  mode: FlowMode;
}

export function isSkillStep(step: FlowStep): step is SkillStep {
  return typeof step !== "string";
}

export function stepName(step: FlowStep): string {
  return typeof step === "string" ? step : step.skill;
}

export type CartridgeType = "standard" | "js-skills";

export type PreferredTier = "local" | "cloud" | "auto";

/**
 * Optional `ui:` block from cartridge.yaml (CLAUDE.md §4.1).
 * Drives the trade-shell screens. The shell reads these and configures
 * itself per active cartridge — labels, colors, icons, default actions.
 *
 * Cartridges without a `ui:` block (e.g. legacy cooking, residential-electrical)
 * fall back to runtime defaults; manifest fields stay `undefined`.
 */
export interface CartridgeUIAction {
  label: string;
  /** Name of a flow declared in `flows:`. */
  flow: string;
  /** Material-style icon hint, resolved by the shell's icon registry. */
  icon?: string;
}

export interface CartridgeUI {
  /** CSS color string, e.g. "#2563EB". Becomes the `--brand` token in the shell. */
  brand_color?: string;
  /** Optional accent color used for secondary surfaces. */
  accent_color?: string;
  /** Single-glyph emoji shown in the trade chip. */
  emoji?: string;
  /** Big primary CTA on Home. */
  primary_action?: CartridgeUIAction;
  /** Up to ~3 alternative CTAs shown beneath the primary. */
  secondary_actions?: CartridgeUIAction[];
  /**
   * Default Library view mode for this cartridge: `list` (chronological,
   * good for electricista/plomero) or `portfolio` (grid antes/después,
   * good for pintor).
   */
  library_default_mode?: "list" | "portfolio";
}

/**
 * Optional `hooks:` block from cartridge.yaml (CLAUDE.md §4.1).
 * Hooks are *declarative* — the cartridge does NOT call into shell or
 * Capacitor code. The shell observes blackboard mutations and runs
 * declared hooks. This is what keeps cartridges portable.
 */
export type CartridgeHookAction =
  /** Pump a key from blackboard into a different blackboard key. */
  | { send_to_blackboard: string }
  /** Auto-generate the client_report at job close. */
  | { generate_report: boolean }
  /** Show the v1.2 corpus-consent prompt at job close. */
  | { prompt_corpus_consent: boolean }
  /** Free-form action key the shell may handle, ignored if unknown. */
  | { [key: string]: unknown };

export interface CartridgeHooks {
  on_quote_generated?: CartridgeHookAction[];
  on_job_closed?: CartridgeHookAction[];
  on_diagnosis_completed?: CartridgeHookAction[];
}

export interface CartridgeManifest {
  name: string;
  path: string;
  description: string;
  entry_intents: string[];
  flows: Record<string, string[]>; // legacy: list of step names
  flow_defs: Record<string, FlowDef>;
  blackboard_schema: Record<string, string>;
  validators: string[];
  max_turns_per_agent: number;
  default_flow: string;
  variables: Record<string, unknown>;
  type: CartridgeType;
  skills_source: string;
  /**
   * M11 routing hint. `local` asks the smart router to prefer the project's
   * local provider; `cloud` always uses a cloud primary/fallback; `auto`
   * (default) respects the project's primary choice and only falls back on
   * validation failure.
   */
  preferred_tier: PreferredTier;
  /**
   * High-level bucket for the Skills tab / Library UI and the GoalRouter.
   * Declared via cartridge.yaml `category:`. Free-form (productivity,
   * creative, reference, data, …). Optional.
   */
  category?: string;
  /**
   * Free-form tags a cartridge claims to cover — fed into the router's
   * matching prompt alongside `entry_intents` and `description`.
   */
  tags?: string[];
  /**
   * Optional `ui:` block (CLAUDE.md §4.1). Trade-shell reads this to
   * configure colors, copy, and default actions per cartridge.
   */
  ui?: CartridgeUI;
  /**
   * Optional `hooks:` block (CLAUDE.md §4.1). Declarative shell behavior
   * triggered on blackboard events. The cartridge knows nothing about
   * Capacitor or Svelte — it only declares intent.
   */
  hooks?: CartridgeHooks;
}

export interface BlackboardEntry {
  value: unknown;
  schema_ref: string;
  produced_by: string;
  description: string;
  created_at: string;
}

export interface BlackboardSnapshot {
  [key: string]: {
    value: unknown;
    schema_ref: string;
    produced_by: string;
    description: string;
    created_at: string;
  };
}

export interface ValidationResult {
  ok: boolean;
  message: string;
}

export type SchemaValidator = (value: unknown, schemaRef: string) => ValidationResult;
