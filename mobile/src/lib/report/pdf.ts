/**
 * On-device PDF generator for client_report — CLAUDE.md §7.5.
 *
 * Uses pdfmake. Photo refs are resolved via StorageProvider, converted to
 * base64 data URLs, and embedded inline. The whole pipeline runs without
 * any network call (privacy invariant §9.3).
 *
 * Inputs:
 *   - `report`: a `ClientReport` shaped per `_shared/schemas/client_report.schema.json`.
 *   - `branding`: optional cartridge ui hints (brand color, emoji, accent).
 *   - `professional`: optional onboarding info baked into the footer.
 *
 * Output: a `local://...` URI (resolves via StorageProvider.getBlob) of
 * the generated PDF blob, plus a `Blob` for direct hand-off to share/save.
 */

import { getProviders } from "../providers";
import type { ProviderBundle } from "../providers/types";

// pdfmake's TS types use a slightly older shape than the runtime; cast to a
// permissive surface for the bits we touch.
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

// dep-justification: pdfmake bundles its default vfs as
// `pdfFonts.pdfMake.vfs` historically; newer versions ship a top-level vfs.
// Try both shapes.
function ensureVfs(): void {
  const anyMake = pdfMake as unknown as { vfs?: Record<string, string> };
  if (anyMake.vfs) return;
  const legacy = pdfFonts as unknown as { pdfMake?: { vfs: Record<string, string> }; vfs?: Record<string, string> };
  const vfs = legacy.pdfMake?.vfs ?? legacy.vfs;
  if (vfs) anyMake.vfs = vfs;
}

export interface ProfessionalInfo {
  name?: string;
  business_name?: string;
  matriculation_id?: string;
  matriculated?: boolean;
  phone?: string;
  rut?: string;
  logo_uri?: string;
}

export interface ReportBranding {
  brand_color?: string;
  accent_color?: string;
  emoji?: string;
  trade_label?: string;
}

export interface ClientReport {
  summary: string;
  before_photos?: string[];
  during_photos?: string[];
  after_photos?: string[];
  work_done: { title: string; description: string; photos_refs?: string[] }[];
  materials_used?: { brand?: string; name: string; qty: number; unit: string }[];
  warranty_terms?: string;
  follow_up?: { needed?: boolean; after_days?: number; reason?: string };
  professional_disclaimer: string;
  professional?: ProfessionalInfo;
}

export interface BuildPDFOptions {
  branding?: ReportBranding;
  /** When the report has placeholders like `{{cartridge.warranty_default}}`, supply substitutions here. */
  variables?: Record<string, string>;
  /** Override the StorageProvider used to write the resulting PDF. */
  providers?: ProviderBundle;
  /** Override the StorageProvider used to read photos. Defaults to providers.storage. */
  photoStorage?: ProviderBundle["storage"];
  /** Title shown in the PDF metadata + share-sheet default. */
  title?: string;
}

export interface BuildPDFResult {
  uri: string;
  blob: Blob;
  byte_size: number;
}

/**
 * Render a ClientReport to a PDF blob, persist it via StorageProvider, and
 * return both the URI and the Blob.
 */
export async function buildClientReportPDF(
  report: ClientReport,
  opts: BuildPDFOptions = {},
): Promise<BuildPDFResult> {
  ensureVfs();

  const providers = opts.providers ?? (await getProviders());
  const photoStorage = opts.photoStorage ?? providers.storage;
  const branding = opts.branding ?? {};
  const variables = opts.variables ?? {};
  const title = opts.title ?? "Reporte";

  const docDef = await buildDocDefinition({
    report,
    branding,
    variables,
    photoStorage,
    title,
  });

  const blob = await renderToBlob(docDef);
  const uri = await providers.storage.saveBlob(blob, {
    bucket: "pdf",
    mime: "application/pdf",
  });
  return { uri, blob, byte_size: blob.size };
}

/* ──────────────────────────────────────────────────────────────────── */
/*                               Internals                              */
/* ──────────────────────────────────────────────────────────────────── */

interface DocCtx {
  report: ClientReport;
  branding: ReportBranding;
  variables: Record<string, string>;
  photoStorage: ProviderBundle["storage"];
  title: string;
}

async function buildDocDefinition(ctx: DocCtx): Promise<unknown> {
  const { report, branding } = ctx;
  const brand = branding.brand_color ?? "#1f2937";
  const accent = branding.accent_color ?? brand;

  const beforeImages = await imagesFor(ctx, report.before_photos ?? []);
  const afterImages = await imagesFor(ctx, report.after_photos ?? []);
  const duringImages = await imagesFor(ctx, report.during_photos ?? []);

  // Optional logo. Resolved through the same StorageProvider path so the
  // PDF stays self-contained.
  let logoDataUrl: string | undefined;
  if (report.professional?.logo_uri) {
    const blob = await ctx.photoStorage.getBlob(report.professional.logo_uri);
    if (blob) logoDataUrl = await blobToDataUrl(blob);
  }

  const workSections: unknown[] = [];
  for (const w of report.work_done ?? []) {
    workSections.push({ text: w.title, style: "h3", margin: [0, 8, 0, 2] });
    workSections.push({ text: w.description, style: "body" });
    if (Array.isArray(w.photos_refs) && w.photos_refs.length > 0) {
      const imgs = await imagesFor(ctx, w.photos_refs);
      if (imgs.length > 0) workSections.push(imageRow(imgs, 140));
    }
  }

  const materialsRows = (report.materials_used ?? []).map((m) => [
    `${m.brand ? m.brand + " — " : ""}${m.name}`,
    `${m.qty}`,
    m.unit,
  ]);

  const docDef: unknown = {
    info: { title: ctx.title },
    pageSize: "A4",
    pageMargins: [40, 60, 40, 70],
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#111827" },
    styles: {
      h1: { fontSize: 22, bold: true, color: brand, margin: [0, 0, 0, 4] },
      h2: { fontSize: 14, bold: true, color: brand, margin: [0, 16, 0, 6] },
      h3: { fontSize: 12, bold: true, color: accent },
      body: { fontSize: 10, color: "#111827", lineHeight: 1.35 },
      muted: { fontSize: 9, color: "#6b7280" },
      footer: { fontSize: 8, color: "#6b7280" },
    },
    header: () => ({
      columns: [
        {
          width: "*",
          stack: [
            { text: ctx.title, style: "h1" },
            { text: brandTagline(branding), style: "muted" },
          ],
        },
        professionalBlock(report.professional, logoDataUrl),
      ],
      margin: [40, 16, 40, 0],
    }),
    footer: (current: number, total: number) => ({
      columns: [
        { text: substitute(report.professional_disclaimer, ctx.variables), style: "footer", width: "*" },
        { text: `${current} / ${total}`, style: "footer", alignment: "right", width: 48 },
      ],
      margin: [40, 0, 40, 24],
    }),
    content: [
      { text: "Resumen", style: "h2" },
      { text: report.summary, style: "body" },

      ...(beforeImages.length > 0
        ? [{ text: "Antes", style: "h2" }, imageRow(beforeImages, 180)]
        : []),

      ...(workSections.length > 0
        ? [{ text: "Trabajo realizado", style: "h2" }, ...workSections]
        : []),

      ...(duringImages.length > 0
        ? [{ text: "Durante", style: "h2" }, imageRow(duringImages, 140)]
        : []),

      ...(afterImages.length > 0
        ? [{ text: "Después", style: "h2" }, imageRow(afterImages, 180)]
        : []),

      ...(materialsRows.length > 0
        ? [
            { text: "Materiales", style: "h2" },
            {
              table: {
                widths: ["*", 60, 60],
                body: [["Material", "Cantidad", "Unidad"], ...materialsRows],
              },
              layout: "lightHorizontalLines",
              fontSize: 10,
            },
          ]
        : []),

      ...(report.warranty_terms
        ? [
            { text: "Garantía", style: "h2" },
            { text: substitute(report.warranty_terms, ctx.variables), style: "body" },
          ]
        : []),

      ...(report.follow_up?.needed
        ? [
            { text: "Seguimiento", style: "h2" },
            {
              text:
                (report.follow_up.reason ?? "Visita de seguimiento sugerida.") +
                (report.follow_up.after_days
                  ? ` (en aproximadamente ${report.follow_up.after_days} días)`
                  : ""),
              style: "body",
            },
          ]
        : []),
    ],
  };
  return docDef;
}

function professionalBlock(p?: ProfessionalInfo, logoDataUrl?: string): unknown {
  if (!p && !logoDataUrl) return { text: "", width: 180 };
  const lines: unknown[] = [];
  if (logoDataUrl) {
    lines.push({ image: logoDataUrl, fit: [120, 48], alignment: "right", margin: [0, 0, 0, 4] });
  }
  if (p?.business_name) lines.push({ text: p.business_name, bold: true, fontSize: 10 });
  if (p?.name) lines.push({ text: p.name, fontSize: 9 });
  if (p?.matriculation_id) lines.push({ text: `Mat. ${p.matriculation_id}`, fontSize: 9, color: "#6b7280" });
  if (p?.phone) lines.push({ text: p.phone, fontSize: 9, color: "#6b7280" });
  if (p?.rut) lines.push({ text: `RUT ${p.rut}`, fontSize: 9, color: "#6b7280" });
  return { width: 180, alignment: "right", stack: lines };
}

function brandTagline(b: ReportBranding): string {
  return b.trade_label ?? "Reporte de trabajo";
}

interface ResolvedImage {
  dataUrl: string;
}

async function imagesFor(ctx: DocCtx, uris: string[]): Promise<ResolvedImage[]> {
  const out: ResolvedImage[] = [];
  for (const uri of uris) {
    const blob = await ctx.photoStorage.getBlob(uri);
    if (!blob) continue;
    const dataUrl = await blobToDataUrl(blob);
    out.push({ dataUrl });
  }
  return out;
}

function imageRow(imgs: ResolvedImage[], width: number): unknown {
  // Up to 3 per row to keep printing reasonable.
  const rows: unknown[][] = [];
  for (let i = 0; i < imgs.length; i += 3) {
    const slice = imgs.slice(i, i + 3);
    rows.push(slice.map((img) => ({ image: img.dataUrl, width, margin: [0, 4, 4, 4] })));
  }
  return { columns: rows.flat() };
}

async function renderToBlob(docDef: unknown): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const make = pdfMake as unknown as {
        createPdf: (def: unknown) => { getBlob: (cb: (b: Blob) => void) => void };
      };
      make.createPdf(docDef).getBlob((b) => resolve(b));
    } catch (err) {
      reject(err);
    }
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  // Node fallback used during Vitest.
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i]);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return `data:${blob.type || "application/octet-stream"};base64,${b64}`;
}

function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key) => {
    const v = vars[key];
    return typeof v === "string" ? v : "";
  });
}
