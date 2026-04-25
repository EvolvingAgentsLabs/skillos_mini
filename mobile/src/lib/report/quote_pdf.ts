/**
 * Quote PDF generator — CLAUDE.md §6.1 quote.schema.json + §7.5.
 *
 * Parallel to buildClientReportPDF: same on-device pdfmake pipeline, same
 * branding contract, same StorageProvider for output. The artifact is
 * what the trade sends to the client BEFORE the work, to get approval.
 *
 * The shape this renders is the schema-valid `Quote` object — line_items,
 * subtotal, tax, total, valid_until. Validators in cartridges/_shared/
 * already enforce "no negative qty" etc.
 */

import { getProviders } from "../providers";
import type { ProviderBundle } from "../providers/types";
import type { ProfessionalInfo, ReportBranding } from "./pdf";

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

function ensureVfs(): void {
  const anyMake = pdfMake as unknown as { vfs?: Record<string, string> };
  if (anyMake.vfs) return;
  const legacy = pdfFonts as unknown as {
    pdfMake?: { vfs: Record<string, string> };
    vfs?: Record<string, string>;
  };
  const vfs = legacy.pdfMake?.vfs ?? legacy.vfs;
  if (vfs) anyMake.vfs = vfs;
}

export type QuoteLineItemKind = "material" | "labor" | "fee" | "discount";

export interface QuoteLineItem {
  kind?: QuoteLineItemKind;
  name: string;
  sku?: string;
  brand?: string;
  qty: number;
  unit: string;
  unit_price: number;
  total: number;
}

export interface Quote {
  description: string;
  line_items: QuoteLineItem[];
  labor_hours?: number;
  labor_rate?: number;
  subtotal: number;
  tax?: number;
  tax_rate?: number;
  total: number;
  currency?: string;
  valid_until: string;
  warranty_terms?: string;
  notes?: string;
}

export interface BuildQuotePDFOptions {
  branding?: ReportBranding;
  professional?: ProfessionalInfo;
  /** Substitute `{{var}}` placeholders in description / notes / warranty. */
  variables?: Record<string, string>;
  /** Override the providers (useful for tests). */
  providers?: ProviderBundle;
  /** Override the StorageProvider used to read the logo. Defaults to providers.storage. */
  photoStorage?: ProviderBundle["storage"];
  /** Title shown in the PDF metadata + share-sheet default. */
  title?: string;
}

export interface BuildQuotePDFResult {
  uri: string;
  blob: Blob;
  byte_size: number;
}

export async function buildQuotePDF(
  quote: Quote,
  opts: BuildQuotePDFOptions = {},
): Promise<BuildQuotePDFResult> {
  ensureVfs();

  const providers = opts.providers ?? (await getProviders());
  const photoStorage = opts.photoStorage ?? providers.storage;
  const branding = opts.branding ?? {};
  const variables = opts.variables ?? {};
  const title = opts.title ?? "Presupuesto";

  let logoDataUrl: string | undefined;
  if (opts.professional?.logo_uri) {
    const blob = await photoStorage.getBlob(opts.professional.logo_uri);
    if (blob) logoDataUrl = await blobToDataUrl(blob);
  }

  const docDef = buildDocDefinition({
    quote,
    branding,
    variables,
    title,
    professional: opts.professional,
    logoDataUrl,
  });

  const blob = await renderToBlob(docDef);
  const uri = await providers.storage.saveBlob(blob, {
    bucket: "pdf",
    mime: "application/pdf",
  });
  return { uri, blob, byte_size: blob.size };
}

interface DocCtx {
  quote: Quote;
  branding: ReportBranding;
  variables: Record<string, string>;
  title: string;
  professional?: ProfessionalInfo;
  logoDataUrl?: string;
}

function buildDocDefinition(ctx: DocCtx): unknown {
  const { quote, branding } = ctx;
  const brand = branding.brand_color ?? "#1f2937";
  const accent = branding.accent_color ?? brand;
  const currency = quote.currency ?? "UYU";

  const moneyHeader = (label: string) => ({ text: label, bold: true, alignment: "right" });
  const tableBody: unknown[][] = [
    [
      { text: "Descripción", bold: true },
      { text: "Cantidad", bold: true, alignment: "right" },
      { text: "Unidad", bold: true },
      moneyHeader("Precio"),
      moneyHeader("Total"),
    ],
  ];
  for (const li of quote.line_items) {
    const name = (li.brand ? `${li.brand} — ` : "") + li.name;
    tableBody.push([
      kindBadge(li.kind) + name,
      { text: numberFmt(li.qty), alignment: "right" },
      li.unit,
      { text: money(li.unit_price, currency), alignment: "right" },
      { text: money(li.total, currency), alignment: "right" },
    ]);
  }

  const totalsTable: unknown[][] = [];
  totalsTable.push([
    { text: "Subtotal", color: "#6b7280" },
    { text: money(quote.subtotal, currency), alignment: "right" },
  ]);
  if (typeof quote.tax === "number" && quote.tax > 0) {
    const taxLabel =
      typeof quote.tax_rate === "number"
        ? `IVA (${(quote.tax_rate * 100).toFixed(0)}%)`
        : "IVA";
    totalsTable.push([
      { text: taxLabel, color: "#6b7280" },
      { text: money(quote.tax, currency), alignment: "right" },
    ]);
  }
  totalsTable.push([
    { text: "Total", bold: true },
    { text: money(quote.total, currency), bold: true, alignment: "right" },
  ]);

  return {
    info: { title: ctx.title },
    pageSize: "A4",
    pageMargins: [40, 60, 40, 70],
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#111827" },
    styles: {
      h1: { fontSize: 22, bold: true, color: brand, margin: [0, 0, 0, 4] },
      h2: { fontSize: 14, bold: true, color: brand, margin: [0, 14, 0, 6] },
      muted: { fontSize: 9, color: "#6b7280" },
      footer: { fontSize: 8, color: "#6b7280" },
      body: { fontSize: 10, lineHeight: 1.35 },
    },
    header: () => ({
      columns: [
        {
          width: "*",
          stack: [
            { text: ctx.title, style: "h1" },
            { text: branding.trade_label ?? "Presupuesto de trabajo", style: "muted" },
          ],
        },
        professionalBlock(ctx.professional, ctx.logoDataUrl),
      ],
      margin: [40, 16, 40, 0],
    }),
    footer: (current: number, total: number) => ({
      columns: [
        {
          text: `Validez: hasta ${quote.valid_until}`,
          style: "footer",
          width: "*",
        },
        { text: `${current} / ${total}`, style: "footer", alignment: "right", width: 48 },
      ],
      margin: [40, 0, 40, 24],
    }),
    content: [
      { text: "Detalle", style: "h2" },
      { text: substitute(quote.description, ctx.variables), style: "body" },

      { text: "Items", style: "h2" },
      {
        table: {
          headerRows: 1,
          widths: ["*", 50, 50, 60, 70],
          body: tableBody,
        },
        layout: "lightHorizontalLines",
        fontSize: 9,
      },

      {
        margin: [0, 12, 0, 0],
        columns: [
          { text: "", width: "*" },
          {
            width: 220,
            table: {
              widths: ["*", "auto"],
              body: totalsTable,
            },
            layout: {
              hLineColor: () => "#e5e7eb",
              vLineColor: () => "#e5e7eb",
              hLineWidth: () => 0.5,
              vLineWidth: () => 0,
            },
          },
        ],
      },

      ...(quote.warranty_terms
        ? [
            { text: "Garantía", style: "h2" },
            { text: substitute(quote.warranty_terms, ctx.variables), style: "body" },
          ]
        : []),

      ...(quote.notes
        ? [
            { text: "Notas", style: "h2" },
            { text: substitute(quote.notes, ctx.variables), style: "body" },
          ]
        : []),
    ],
  };
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

function kindBadge(kind: QuoteLineItemKind | undefined): string {
  // Single-character prefix avoids needing a second column. Discount lines
  // (negative totals) get a `−` so the table reads right-to-left intuitively.
  if (kind === "labor") return "🛠 ";
  if (kind === "material") return "📦 ";
  if (kind === "fee") return "• ";
  if (kind === "discount") return "− ";
  return "";
}

function money(n: number, currency: string): string {
  // Locale-aware fallback: Intl is available in modern Android WebView and Node.
  try {
    return new Intl.NumberFormat("es-UY", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function numberFmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
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
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i]);
  const b64 =
    typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return `data:${blob.type || "application/octet-stream"};base64,${b64}`;
}

function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key) => {
    const v = vars[key];
    return typeof v === "string" ? v : "";
  });
}
