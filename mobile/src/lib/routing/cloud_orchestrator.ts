/**
 * CloudOrchestrator — optional cloud-assisted goal decomposition.
 *
 * For complex goals that exceed a single cartridge flow, the orchestrator
 * uses a cloud LLM to decompose the goal into a sequence of cartridge runs.
 * Each sub-goal is then routed through GoalRouter -> CartridgeRunner.
 *
 * This is the mobile equivalent of the /skillos command's plan step.
 * The cloud model handles ORCHESTRATION only — actual domain work
 * (vision diagnosis, quoting, compliance) runs locally.
 *
 * Privacy: only the goal text and cartridge catalog are sent to cloud.
 * Photos and diagnosis data never leave the device.
 */

import type { LLMProvider } from "../llm/provider";
import type { CartridgeManifest } from "../cartridge/types";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export interface OrchestrationStep {
  /** Sub-goal text to pass to CartridgeRunner */
  goal: string;
  /** Target cartridge name */
  cartridge: string;
  /** Optional flow override */
  flow?: string;
  /** Brief explanation of why this step is needed */
  reason: string;
}

export interface OrchestrationPlan {
  /** Original user goal */
  originalGoal: string;
  /** Decomposed steps in execution order */
  steps: OrchestrationStep[];
  /** Whether the plan requires multiple cartridges */
  isMultiCartridge: boolean;
  /** If single-step, this is just a pass-through */
  isPassThrough: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// System prompt
// ────────────────────────────────────────────────────────────────────────

const DECOMPOSITION_SYSTEM_PROMPT = `You decompose user goals into a sequence of cartridge runs.

Rules:
- Use ONLY cartridges from the provided list
- Most goals map to a SINGLE cartridge — prefer simple plans
- Only decompose into multiple steps when genuinely needed
- Each step must specify a cartridge name and a sub-goal
- Return JSON: {"steps": [{"goal": "...", "cartridge": "...", "flow": "...", "reason": "..."}]}`;

// ────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────

/**
 * Decompose a complex goal into a sequence of cartridge runs.
 * Returns a plan with 1+ steps. Single-step goals are pass-through.
 *
 * @param goal - The user's natural language goal
 * @param cartridges - Available cartridge manifests
 * @param llm - Cloud LLM provider for decomposition
 */
export async function decomposeGoal(
  goal: string,
  cartridges: CartridgeManifest[],
  llm: LLMProvider,
): Promise<OrchestrationPlan> {
  const trimmed = goal.trim();
  if (!trimmed) {
    return emptyPlan(goal);
  }

  if (cartridges.length === 0) {
    return emptyPlan(goal);
  }

  const catalog = buildCatalog(cartridges);
  const userPrompt = buildUserPrompt(trimmed, catalog);

  const result = await llm.chat(
    [
      { role: "system", content: DECOMPOSITION_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { stream: false, temperature: 0.1, maxTokens: 600 },
  );

  const steps = parseResponse(result.content, cartridges);

  if (steps.length === 0) {
    return emptyPlan(goal);
  }

  const cartridgeNames = new Set(steps.map((s) => s.cartridge));

  return {
    originalGoal: trimmed,
    steps,
    isMultiCartridge: cartridgeNames.size > 1,
    isPassThrough: steps.length === 1,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Catalog builder
// ────────────────────────────────────────────────────────────────────────

function buildCatalog(cartridges: CartridgeManifest[]): string {
  const lines = cartridges.map((m) => {
    const flows = Object.keys(m.flows);
    const flowStr = flows.length > 0 ? ` | flows: ${flows.join(", ")}` : "";
    const intentStr =
      m.entry_intents.length > 0
        ? ` | intents: ${m.entry_intents.slice(0, 5).join(", ")}`
        : "";
    return `- ${m.name}: ${truncate(m.description, 120)}${flowStr}${intentStr}`;
  });
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────
// Prompt builder
// ────────────────────────────────────────────────────────────────────────

function buildUserPrompt(goal: string, catalog: string): string {
  return `Goal: ${goal}

Available cartridges:
${catalog}

Decompose the goal into cartridge runs. Return only JSON, no markdown fences.`;
}

// ────────────────────────────────────────────────────────────────────────
// Response parser
// ────────────────────────────────────────────────────────────────────────

function parseResponse(
  raw: string,
  cartridges: CartridgeManifest[],
): OrchestrationStep[] {
  const cleaned = stripFences(raw).trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }

  if (!Array.isArray(obj.steps)) return [];

  const cartridgeNames = new Set(cartridges.map((c) => c.name));
  const validSteps: OrchestrationStep[] = [];

  for (const raw of obj.steps) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;

    const stepGoal = typeof entry.goal === "string" ? entry.goal.trim() : "";
    const cartridge = typeof entry.cartridge === "string" ? entry.cartridge.trim() : "";
    const flow = typeof entry.flow === "string" && entry.flow.trim() ? entry.flow.trim() : undefined;
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";

    if (!stepGoal || !cartridge) continue;

    // Validate cartridge name exists
    if (!cartridgeNames.has(cartridge)) continue;

    // Validate flow exists on the cartridge if specified
    let validatedFlow = flow;
    if (validatedFlow) {
      const manifest = cartridges.find((c) => c.name === cartridge);
      if (manifest && !manifest.flows[validatedFlow]) {
        validatedFlow = undefined;
      }
    }

    validSteps.push({
      goal: stepGoal,
      cartridge,
      flow: validatedFlow,
      reason: reason || `Run ${cartridge} for: ${truncate(stepGoal, 60)}`,
    });
  }

  return validSteps;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function emptyPlan(goal: string): OrchestrationPlan {
  return {
    originalGoal: goal.trim(),
    steps: [],
    isMultiCartridge: false,
    isPassThrough: false,
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

function stripFences(s: string): string {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  return m ? m[1] : s;
}
