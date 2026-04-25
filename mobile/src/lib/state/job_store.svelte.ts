/**
 * Job store — the trade-shell's surface for the work-in-progress blackboard
 * of a single trade job (CLAUDE.md §5.3 + §6).
 *
 * A "job" maps to a `BlackboardRecord` row. Unlike the legacy LLM run path
 * (which materializes blackboards through the full agent pipeline), the
 * trade flow lets the user assemble structured entries (photos, diagnosis,
 * client_report) incrementally in the UI and persists them as the user
 * progresses. This is the data backbone for §5.3 / §5.4 / §7.7.
 *
 * The store is intentionally CRUD-only — the agents will write into the same
 * blackboard once §7.3 vision pipeline lands. Both code paths read the same
 * shape via the `_shared/schemas/*.schema.json` contracts.
 */

import { getDB, type BlackboardRecord } from "../storage/db";
import type { ClientReport, ProfessionalInfo } from "../report/pdf";
import type { Quote, QuoteLineItem } from "../report/quote_pdf";
import type { ProfessionalProfile } from "./professional_profile.svelte";

export interface PhotoEntry {
  uri: string;
  taken_at: string;
  role: "before" | "during" | "after" | "detail";
  byte_size?: number;
  width?: number;
  height?: number;
  notes?: string;
}

export interface DiagnosisEntry {
  trade?: string;
  severity?: number;
  problem_categories?: string[];
  summary?: string;
  client_explanation?: string;
  hazards?: { kind: string; description: string; requires_immediate_action?: boolean }[];
  confidence?: number;
}

export interface JobState {
  id: string;
  project_id: string;
  cartridge: string;
  flow: string;
  created_at: string;
  updated_at: string;
  photos: PhotoEntry[];
  diagnosis?: DiagnosisEntry;
  quote?: Quote;
  client_report?: ClientReport;
  /** UI-side flag: the user marked the job as ready-to-share. */
  finalized: boolean;
}

/* ──────────────────────────────────────────────────────────────────── */
/*                              Persistence                             */
/* ──────────────────────────────────────────────────────────────────── */

function jobStateToRecord(j: JobState): BlackboardRecord {
  return {
    id: j.id,
    project_id: j.project_id,
    run_id: j.id, // 1 job = 1 run for the trade flow
    cartridge: j.cartridge,
    flow: j.flow,
    snapshot: {
      photo_set: { photos: j.photos },
      diagnosis: j.diagnosis,
      quote: j.quote,
      client_report: j.client_report,
      finalized: j.finalized,
      updated_at: j.updated_at,
    },
    created_at: j.created_at,
  };
}

function recordToJobState(r: BlackboardRecord): JobState {
  const snap = (r.snapshot ?? {}) as Record<string, unknown>;
  const photoSet = (snap.photo_set ?? {}) as { photos?: PhotoEntry[] };
  return {
    id: r.id,
    project_id: r.project_id,
    cartridge: r.cartridge,
    flow: r.flow,
    created_at: r.created_at,
    updated_at:
      typeof snap.updated_at === "string" ? (snap.updated_at as string) : r.created_at,
    photos: Array.isArray(photoSet.photos) ? photoSet.photos : [],
    diagnosis:
      snap.diagnosis && typeof snap.diagnosis === "object"
        ? (snap.diagnosis as DiagnosisEntry)
        : undefined,
    quote:
      snap.quote && typeof snap.quote === "object" ? (snap.quote as Quote) : undefined,
    client_report:
      snap.client_report && typeof snap.client_report === "object"
        ? (snap.client_report as ClientReport)
        : undefined,
    finalized: snap.finalized === true,
  };
}

export async function saveJob(j: JobState): Promise<void> {
  j.updated_at = new Date().toISOString();
  const db = await getDB();
  await db.put("blackboards", jobStateToRecord(j));
}

export async function loadJob(id: string): Promise<JobState | undefined> {
  const db = await getDB();
  const rec = await db.get("blackboards", id);
  if (!rec) return undefined;
  return recordToJobState(rec);
}

export async function listJobsForProject(projectId: string): Promise<JobState[]> {
  const db = await getDB();
  const tx = db.transaction("blackboards", "readonly");
  const idx = tx.store.index("by-project");
  const out: JobState[] = [];
  let cursor = await idx.openCursor(projectId);
  while (cursor) {
    out.push(recordToJobState(cursor.value));
    cursor = await cursor.continue();
  }
  out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return out;
}

/**
 * List jobs across all projects for a given cartridge. Used by the trade-shell
 * Library section so the user sees their full electricista history regardless
 * of which Project row holds it.
 */
export async function listJobsForCartridge(cartridge: string, limit?: number): Promise<JobState[]> {
  const db = await getDB();
  const all = await db.getAll("blackboards");
  const out: JobState[] = [];
  for (const r of all) {
    if (r.cartridge !== cartridge) continue;
    out.push(recordToJobState(r));
  }
  out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return typeof limit === "number" ? out.slice(0, limit) : out;
}

export async function deleteJob(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("blackboards", id);
}

/* ──────────────────────────────────────────────────────────────────── */
/*                               Mutations                              */
/* ──────────────────────────────────────────────────────────────────── */

export function newJob(input: {
  project_id: string;
  cartridge: string;
  flow: string;
  id?: string;
}): JobState {
  const now = new Date().toISOString();
  return {
    id: input.id ?? newJobId(),
    project_id: input.project_id,
    cartridge: input.cartridge,
    flow: input.flow,
    created_at: now,
    updated_at: now,
    photos: [],
    finalized: false,
  };
}

export function addPhoto(job: JobState, photo: PhotoEntry): JobState {
  return {
    ...job,
    photos: [...job.photos, photo],
    updated_at: new Date().toISOString(),
  };
}

export function setDiagnosis(job: JobState, d: DiagnosisEntry): JobState {
  return {
    ...job,
    diagnosis: { ...d },
    updated_at: new Date().toISOString(),
  };
}

export function setClientReport(job: JobState, report: ClientReport): JobState {
  return {
    ...job,
    client_report: report,
    updated_at: new Date().toISOString(),
  };
}

export function setQuote(job: JobState, quote: Quote): JobState {
  return {
    ...job,
    quote: { ...quote },
    updated_at: new Date().toISOString(),
  };
}

/**
 * Recompute totals from line_items + tax_rate. Used by the quote editor
 * so the user editing qty/unit_price sees consistent totals.
 *
 * Pure (no I/O), so easy to unit-test.
 */
export function recalcQuote(quote: Quote): Quote {
  const line_items = quote.line_items.map((li) => {
    const total = roundMoney(li.qty * li.unit_price);
    return { ...li, total };
  });
  const subtotal = roundMoney(line_items.reduce((s, li) => s + li.total, 0));
  const tax_rate = typeof quote.tax_rate === "number" ? quote.tax_rate : 0;
  const tax = roundMoney(subtotal * tax_rate);
  const total = roundMoney(subtotal + tax);
  return { ...quote, line_items, subtotal, tax, total };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function finalize(job: JobState): JobState {
  return { ...job, finalized: true, updated_at: new Date().toISOString() };
}

/**
 * Pick the step the trade-flow should resume on for a given job. Pure logic
 * so it's trivially testable.
 *
 * The quote-only flow uses a separate axis: the work-loop steps
 * (capture / review / report) and the quote-loop steps (capture / quote / share).
 * Callers that know they're on the quote_only path should call
 * `resumeQuoteStepFor` instead.
 */
export function resumeStepFor(job: JobState): "capture" | "review" | "report" {
  if (job.client_report) return "report";
  if (job.photos.length > 0) return "review";
  return "capture";
}

export function resumeQuoteStepFor(job: JobState): "capture" | "quote" | "share" {
  if (job.quote) return "share";
  if (job.photos.length > 0) return "quote";
  return "capture";
}

const TRADE_FLOWS_QUOTE_ONLY = new Set([
  "quote_only",
  "presupuesto",
]);

export function isQuoteOnlyFlow(flowName: string): boolean {
  return TRADE_FLOWS_QUOTE_ONLY.has(flowName);
}

/**
 * Build a default `client_report` from a job's photos + diagnosis. Used by
 * the trade-flow Report step when the user has not yet generated one via
 * the LLM (which lands with §7.3). The output is the *minimum* shape the
 * client_report schema accepts so the PDF can render — the trade is
 * expected to edit it before sharing.
 *
 * `profile` (when present) populates the `professional` block consumed by
 * the PDF footer (CLAUDE.md §14 Q3).
 */
export function defaultClientReport(
  job: JobState,
  cartridgeVars: Record<string, string> = {},
  profile?: ProfessionalProfile | null,
): ClientReport {
  const before = job.photos.filter((p) => p.role === "before").map((p) => p.uri);
  const after = job.photos.filter((p) => p.role === "after").map((p) => p.uri);
  const during = job.photos.filter((p) => p.role === "during").map((p) => p.uri);

  const summary =
    job.diagnosis?.client_explanation ??
    job.diagnosis?.summary ??
    "Trabajo realizado y documentado.";

  const work_done = [
    {
      title: "Trabajo realizado",
      description:
        job.diagnosis?.summary ??
        "Detalle del trabajo a completar por el profesional antes de compartir.",
    },
  ];

  return {
    summary,
    before_photos: before,
    during_photos: during,
    after_photos: after,
    work_done,
    warranty_terms: cartridgeVars["cartridge.warranty_default"] ?? undefined,
    professional_disclaimer:
      cartridgeVars["cartridge.professional_disclaimer"] ??
      "Trabajo realizado por el profesional declarado en el pie de página.",
    professional: profile ? professionalProfileToReportInfo(profile) : undefined,
  };
}

function professionalProfileToReportInfo(p: ProfessionalProfile): ProfessionalInfo {
  return {
    name: p.name,
    business_name: p.business_name,
    matriculation_id: p.matriculation_id,
    matriculated: p.matriculated,
    phone: p.phone,
    rut: p.rut,
    logo_uri: p.logo_uri,
  };
}

/**
 * Build a starter Quote from a job's diagnosis + cartridge variables.
 *
 * The schema requires at least one line_item, so we seed one labor row the
 * trade edits before sharing. Subtotal/tax/total are pre-populated and
 * stay consistent via `recalcQuote()` whenever the trade tweaks line items.
 *
 * Currency, tax_rate and warranty pull from cartridge.yaml.variables when
 * the host passes them in. Defaults: UYU, 22% IVA, 14-day validity.
 */
export function defaultQuote(
  job: JobState,
  cartridgeVars: Record<string, unknown> = {},
): Quote {
  const currency = stringOr(cartridgeVars.currency, "UYU");
  const tax_rate = numberOr(cartridgeVars.tax_rate, 0.22);
  const warranty = stringOr(cartridgeVars["cartridge.warranty_default"], "");

  const seedItem: QuoteLineItem = {
    kind: "labor",
    name: "Mano de obra (estimar)",
    qty: 1,
    unit: "hora",
    unit_price: 0,
    total: 0,
  };

  const description =
    job.diagnosis?.client_explanation ??
    job.diagnosis?.summary ??
    "Trabajo a presupuestar — el profesional completa los items.";

  const valid_until = isoDateInDays(14);

  const draft: Quote = {
    description,
    line_items: [seedItem],
    labor_hours: 1,
    labor_rate: 0,
    subtotal: 0,
    tax_rate,
    tax: 0,
    total: 0,
    currency,
    valid_until,
    warranty_terms: warranty || undefined,
  };
  return recalcQuote(draft);
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function numberOr(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function isoDateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ──────────────────────────────────────────────────────────────────── */
/*                                 Helpers                              */
/* ──────────────────────────────────────────────────────────────────── */

function newJobId(): string {
  // 22-char base36 — collision-resistant for the tens-of-jobs-per-trade scale
  // we expect locally. Not crypto-grade; fine for IDB keys.
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 12);
  return `job_${t}_${r}`;
}
