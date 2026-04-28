/**
 * TraceLogger — granular per-step run traces for cartridge executions.
 *
 * Extends SmartMemory with step-level detail. Each CartridgeRunner.run()
 * produces one RunTrace containing per-step StepTrace entries.
 * Stored in IndexedDB `memory` store alongside SmartMemory records,
 * using a "trace_" prefix on experience_id to distinguish from "exp_" records.
 */

import { getDB, type MemoryRecord } from "../storage/db";
import type { RunResult } from "../cartridge/runner";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export interface StepTrace {
  agent: string;
  produced_keys: string[];
  validated: boolean;
  message: string;
  attempts: number;
  started_at: string;
  duration_ms: number;
}

export interface RunTrace {
  trace_id: string;
  timestamp: string;
  cartridge: string;
  flow: string;
  goal: string;
  outcome: "success" | "partial" | "failure";
  steps: StepTrace[];
  validator_messages: string[];
  blackboard_keys: string[];
  duration_ms: number;
  provider_id?: string;
}

// ────────────────────────────────────────────────────────────────────────
// Construction
// ────────────────────────────────────────────────────────────────────────

export interface CreateTraceMeta {
  cartridge: string;
  flow: string;
  goal: string;
  durationMs: number;
  providerId?: string;
}

/**
 * Convert a RunResult from CartridgeRunner into a RunTrace.
 *
 * Step-level timing is not available from RunResult (CartridgeRunner does not
 * currently emit per-step timestamps), so `started_at` defaults to the trace
 * timestamp and `duration_ms` defaults to 0. Callers that instrument per-step
 * timing via RunEvent callbacks can patch these fields before calling saveTrace.
 */
export function createRunTrace(result: RunResult, meta: CreateTraceMeta): RunTrace {
  const now = new Date().toISOString();
  const traceId = `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const outcome: RunTrace["outcome"] = result.ok
    ? "success"
    : result.steps.some((s) => s.validated)
      ? "partial"
      : "failure";

  const steps: StepTrace[] = result.steps.map((s) => ({
    agent: s.agent,
    produced_keys: [...s.produced_keys],
    validated: s.validated,
    message: s.message,
    attempts: s.attempts,
    started_at: now,
    duration_ms: 0,
  }));

  const blackboardKeys = Object.keys(result.blackboard);

  return {
    trace_id: traceId,
    timestamp: now,
    cartridge: meta.cartridge,
    flow: meta.flow,
    goal: meta.goal,
    outcome,
    steps,
    validator_messages: [...result.validator_messages],
    blackboard_keys: blackboardKeys,
    duration_ms: meta.durationMs,
    provider_id: meta.providerId,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Persistence — stored as MemoryRecord in the `memory` store
// ────────────────────────────────────────────────────────────────────────

function traceToMemoryRecord(trace: RunTrace): MemoryRecord {
  return {
    experience_id: trace.trace_id,
    timestamp: trace.timestamp,
    session_id: "trace",
    project: trace.cartridge,
    goal: trace.goal,
    outcome: trace.outcome,
    components_used: trace.steps.map((s) => s.agent),
    quality_score: 0,
    cost_estimate_usd: 0,
    duration_seconds: Math.round(trace.duration_ms / 1000),
    output_summary: JSON.stringify(trace),
    learnings: undefined,
  };
}

function memoryRecordToTrace(rec: MemoryRecord): RunTrace | null {
  if (!rec.output_summary) return null;
  try {
    return JSON.parse(rec.output_summary) as RunTrace;
  } catch {
    return null;
  }
}

/** Persist a RunTrace to IndexedDB. */
export async function saveTrace(trace: RunTrace): Promise<void> {
  const db = await getDB();
  await db.put("memory", traceToMemoryRecord(trace));
}

// ────────────────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────────────────

/** List traces, most recent first. Default limit 50. */
export async function listTraces(limit = 50): Promise<RunTrace[]> {
  const db = await getDB();
  const all = await db.getAll("memory");
  const traces: RunTrace[] = [];
  for (const rec of all) {
    if (!rec.experience_id.startsWith("trace_")) continue;
    const t = memoryRecordToTrace(rec);
    if (t) traces.push(t);
  }
  traces.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return traces.slice(0, limit);
}

/** Filter traces by cartridge name, most recent first. */
export async function tracesForCartridge(cartridge: string): Promise<RunTrace[]> {
  const db = await getDB();
  const recs = await db.getAllFromIndex("memory", "by-project", cartridge);
  const traces: RunTrace[] = [];
  for (const rec of recs) {
    if (!rec.experience_id.startsWith("trace_")) continue;
    const t = memoryRecordToTrace(rec);
    if (t) traces.push(t);
  }
  traces.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return traces;
}

/** Aggregate stats across all stored traces. */
export async function traceStats(): Promise<{
  total: number;
  byCartridge: Record<string, { runs: number; successes: number }>;
}> {
  const db = await getDB();
  const all = await db.getAll("memory");
  const byCartridge: Record<string, { runs: number; successes: number }> = {};
  let total = 0;

  for (const rec of all) {
    if (!rec.experience_id.startsWith("trace_")) continue;
    total++;
    const cart = rec.project;
    if (!byCartridge[cart]) {
      byCartridge[cart] = { runs: 0, successes: 0 };
    }
    byCartridge[cart].runs++;
    if (rec.outcome === "success") {
      byCartridge[cart].successes++;
    }
  }

  return { total, byCartridge };
}
