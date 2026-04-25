/**
 * Quote logic + PDF tests:
 *   - defaultQuote produces a schema-valid Quote with consistent math.
 *   - recalcQuote rounds correctly and keeps total = subtotal + tax.
 *   - resumeQuoteStepFor / isQuoteOnlyFlow pure helpers.
 *   - buildQuotePDF returns %PDF magic bytes and persists via StorageProvider.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import draft07Meta from "ajv/dist/refs/json-schema-draft-07.json" with { type: "json" };
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { _resetDBForTests } from "../src/lib/storage/db";
import {
  addPhoto,
  defaultQuote,
  isQuoteOnlyFlow,
  newJob,
  recalcQuote,
  resumeQuoteStepFor,
  saveJob,
  setDiagnosis,
  setQuote,
} from "../src/lib/state/job_store.svelte";
import { buildQuotePDF, type Quote } from "../src/lib/report/quote_pdf";
import { makeMockProviders } from "../src/lib/providers/mock";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED = resolve(__dirname, "../../cartridges/_shared/schemas");

function quoteValidator(): ValidateFunction {
  const text = readFileSync(resolve(SHARED, "quote.schema.json"), "utf8");
  const schema = JSON.parse(text);
  const ajv = new Ajv2020({ allErrors: false, strict: false });
  if (!ajv.getSchema("http://json-schema.org/draft-07/schema#")) {
    ajv.addMetaSchema(draft07Meta as object);
  }
  addFormats(ajv as unknown as Parameters<typeof addFormats>[0]);
  return ajv.compile(schema);
}

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  _resetDBForTests();
});

describe("recalcQuote", () => {
  it("recomputes line totals + subtotal + tax + total", () => {
    const q: Quote = {
      description: "x",
      line_items: [
        { kind: "labor", name: "labor", qty: 2, unit: "hora", unit_price: 1500, total: 0 },
        { kind: "material", name: "cable", qty: 3, unit: "m", unit_price: 100, total: 0 },
      ],
      subtotal: 0,
      tax_rate: 0.22,
      tax: 0,
      total: 0,
      valid_until: "2026-05-09",
    };
    const r = recalcQuote(q);
    expect(r.line_items[0].total).toBe(3000);
    expect(r.line_items[1].total).toBe(300);
    expect(r.subtotal).toBe(3300);
    expect(r.tax).toBeCloseTo(726, 2);
    expect(r.total).toBeCloseTo(4026, 2);
  });

  it("treats absent tax_rate as zero", () => {
    const r = recalcQuote({
      description: "x",
      line_items: [{ name: "a", qty: 1, unit: "u", unit_price: 100, total: 0 }],
      subtotal: 0,
      total: 0,
      valid_until: "2026-05-09",
    });
    expect(r.tax).toBe(0);
    expect(r.total).toBe(100);
  });

  it("rounds to two decimals", () => {
    const r = recalcQuote({
      description: "x",
      line_items: [
        { name: "a", qty: 1, unit: "u", unit_price: 33.333, total: 0 },
      ],
      subtotal: 0,
      tax_rate: 0.22,
      tax: 0,
      total: 0,
      valid_until: "2026-05-09",
    });
    expect(r.line_items[0].total).toBe(33.33);
    expect(r.subtotal).toBe(33.33);
    expect(r.tax).toBe(7.33);
    expect(r.total).toBe(40.66);
  });
});

describe("defaultQuote", () => {
  const validate = quoteValidator();

  it("produces a schema-valid Quote with consistent math", () => {
    let j = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "quote_only" });
    j = setDiagnosis(j, {
      summary: "tablero VC 1.5 insuficiente",
      client_explanation: "Hay que cambiar el cable",
    });
    const q = defaultQuote(j, { currency: "UYU", tax_rate: 0.22 });
    expect(validate(q)).toBe(true);
    expect(q.currency).toBe("UYU");
    expect(q.line_items.length).toBeGreaterThanOrEqual(1);
    expect(q.total).toBe(0); // unit_price 0 by default
    expect(q.valid_until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back when cartridgeVars are absent", () => {
    const j = newJob({ project_id: "p1", cartridge: "trade-pintor", flow: "presupuesto" });
    const q = defaultQuote(j);
    expect(validate(q)).toBe(true);
    expect(q.currency).toBe("UYU");
    expect(q.tax_rate).toBe(0.22);
  });

  it("uses diagnosis client_explanation as the description when present", () => {
    let j = newJob({ project_id: "p1", cartridge: "trade-plomero", flow: "obra" });
    j = setDiagnosis(j, {
      client_explanation: "Cambio de cañería principal del baño",
    });
    const q = defaultQuote(j);
    expect(q.description).toBe("Cambio de cañería principal del baño");
  });
});

describe("resumeQuoteStepFor + isQuoteOnlyFlow", () => {
  it("returns capture for a fresh job", () => {
    const j = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "quote_only" });
    expect(resumeQuoteStepFor(j)).toBe("capture");
  });

  it("returns quote once photos exist but no quote", () => {
    let j = newJob({ project_id: "p1", cartridge: "trade-pintor", flow: "presupuesto" });
    j = addPhoto(j, { uri: "mock://photos/1", taken_at: new Date().toISOString(), role: "before" });
    expect(resumeQuoteStepFor(j)).toBe("quote");
  });

  it("returns share once a quote is set", () => {
    let j = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "quote_only" });
    j = addPhoto(j, { uri: "mock://photos/1", taken_at: new Date().toISOString(), role: "before" });
    j = setQuote(j, defaultQuote(j));
    expect(resumeQuoteStepFor(j)).toBe("share");
  });

  it("isQuoteOnlyFlow recognizes the canonical names", () => {
    expect(isQuoteOnlyFlow("quote_only")).toBe(true);
    expect(isQuoteOnlyFlow("presupuesto")).toBe(true);
    expect(isQuoteOnlyFlow("intervention")).toBe(false);
    expect(isQuoteOnlyFlow("urgencia")).toBe(false);
    expect(isQuoteOnlyFlow("")).toBe(false);
  });
});

describe("Quote round-trips through the JobState snapshot", () => {
  it("setQuote → saveJob → loadJob preserves the quote", async () => {
    const { loadJob } = await import("../src/lib/state/job_store.svelte");
    let j = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "quote_only" });
    j = setQuote(j, {
      description: "test",
      line_items: [{ name: "x", qty: 1, unit: "u", unit_price: 100, total: 100 }],
      subtotal: 100,
      tax_rate: 0.22,
      tax: 22,
      total: 122,
      currency: "UYU",
      valid_until: "2026-05-09",
    });
    await saveJob(j);
    const loaded = await loadJob(j.id);
    expect(loaded?.quote?.total).toBe(122);
    expect(loaded?.quote?.line_items[0].name).toBe("x");
  });
});

describe("buildQuotePDF", () => {
  it("returns a PDF blob with %PDF magic bytes", async () => {
    const providers = makeMockProviders();
    const j = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "quote_only" });
    const q: Quote = {
      ...defaultQuote(j, { tax_rate: 0.22 }),
      line_items: [
        { kind: "labor", name: "Mano de obra", qty: 2, unit: "hora", unit_price: 1500, total: 3000 },
        { kind: "material", name: "Cable VC 4mm", qty: 1, unit: "rollo", unit_price: 4200, total: 4200 },
      ],
    };
    const recalcd = recalcQuote(q);
    const result = await buildQuotePDF(recalcd, { providers });
    expect(result.byte_size).toBeGreaterThan(500);
    const head = await result.blob.slice(0, 5).arrayBuffer();
    const bytes = new Uint8Array(head);
    expect(String.fromCharCode(...bytes)).toBe("%PDF-");
    expect(result.uri).toMatch(/^mock:\/\/pdf\//);
  });

  it("embeds the professional logo when provided", async () => {
    const providers = makeMockProviders();
    const PNG_1x1_B64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";
    const png = Uint8Array.from(atob(PNG_1x1_B64), (c) => c.charCodeAt(0));
    const logoUri = await providers.storage.saveBlob(png, { bucket: "photos", mime: "image/png" });

    const j = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "quote_only" });
    const q = defaultQuote(j);
    const result = await buildQuotePDF(recalcQuote(q), {
      providers,
      professional: {
        name: "Daniel",
        business_name: "Daniel Electricidad",
        phone: "+598 99 999 999",
        matriculated: true,
        logo_uri: logoUri,
      },
    });
    expect(result.byte_size).toBeGreaterThan(700);
  });
});
