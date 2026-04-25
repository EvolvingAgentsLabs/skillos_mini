/**
 * job_store tests — verify the trade flow's data backbone:
 *   - newJob → addPhoto → setDiagnosis → setClientReport → finalize
 *   - persistence via saveJob / loadJob round-trips through IndexedDB
 *   - listJobsForProject returns the right rows in the right order
 *   - defaultClientReport produces a schema-shaped object
 *
 * Pure logic — no DOM needed. Uses fake-indexeddb already wired by
 * tests/setup.ts.
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
  defaultClientReport,
  deleteJob,
  finalize,
  listJobsForProject,
  loadJob,
  newJob,
  saveJob,
  setClientReport,
  setDiagnosis,
} from "../src/lib/state/job_store.svelte";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED = resolve(__dirname, "../../cartridges/_shared/schemas");

function clientReportValidator(): ValidateFunction {
  const text = readFileSync(resolve(SHARED, "client_report.schema.json"), "utf8");
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

describe("job_store mutations", () => {
  it("newJob seeds an empty photos array and sets timestamps", () => {
    const j = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "intervention" });
    expect(j.photos).toEqual([]);
    expect(j.finalized).toBe(false);
    expect(j.created_at).toBe(j.updated_at);
    expect(j.id).toMatch(/^job_/);
  });

  it("addPhoto appends and bumps updated_at", async () => {
    const j0 = newJob({ project_id: "p1", cartridge: "trade-pintor", flow: "trabajo" });
    // Force a clock tick.
    await new Promise((r) => setTimeout(r, 5));
    const j1 = addPhoto(j0, {
      uri: "mock://photos/1",
      taken_at: new Date().toISOString(),
      role: "before",
    });
    expect(j1.photos.length).toBe(1);
    expect(j1.updated_at >= j0.updated_at).toBe(true);
  });

  it("setDiagnosis + setClientReport + finalize compose immutably", () => {
    const j0 = newJob({ project_id: "p1", cartridge: "trade-plomero", flow: "urgencia" });
    const j1 = setDiagnosis(j0, {
      trade: "plomero",
      severity: 4,
      problem_categories: ["perdida_presion_activa"],
    });
    expect(j0.diagnosis).toBeUndefined();
    expect(j1.diagnosis?.severity).toBe(4);

    const j2 = setClientReport(j1, {
      summary: "x",
      work_done: [{ title: "t", description: "d" }],
      professional_disclaimer: "z",
    });
    expect(j2.client_report?.summary).toBe("x");

    const j3 = finalize(j2);
    expect(j3.finalized).toBe(true);
    expect(j2.finalized).toBe(false); // immutability
  });
});

describe("job_store persistence", () => {
  it("saveJob → loadJob round-trips photos + diagnosis + client_report", async () => {
    let j = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "intervention" });
    j = addPhoto(j, { uri: "mock://photos/1", taken_at: new Date().toISOString(), role: "before" });
    j = setDiagnosis(j, { trade: "electricista", severity: 3, problem_categories: ["x"] });
    j = setClientReport(j, {
      summary: "ok",
      work_done: [{ title: "t", description: "d" }],
      professional_disclaimer: "z",
    });
    await saveJob(j);

    const loaded = await loadJob(j.id);
    expect(loaded).toBeDefined();
    expect(loaded!.photos.length).toBe(1);
    expect(loaded!.diagnosis?.severity).toBe(3);
    expect(loaded!.client_report?.summary).toBe("ok");
  });

  it("listJobsForProject returns rows in updated_at desc order", async () => {
    const a = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "intervention" });
    await saveJob(a);
    await new Promise((r) => setTimeout(r, 10));

    const b = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "intervention" });
    await saveJob(b);
    await new Promise((r) => setTimeout(r, 10));

    // Mutate `a` so it becomes the most recently updated.
    let aRefreshed = (await loadJob(a.id))!;
    aRefreshed = addPhoto(aRefreshed, {
      uri: "mock://photos/9",
      taken_at: new Date().toISOString(),
      role: "after",
    });
    await saveJob(aRefreshed);

    const list = await listJobsForProject("p1");
    expect(list.length).toBe(2);
    expect(list[0].id).toBe(a.id);
    expect(list[1].id).toBe(b.id);
  });

  it("deleteJob removes the row", async () => {
    const j = newJob({ project_id: "p1", cartridge: "trade-pintor", flow: "presupuesto" });
    await saveJob(j);
    await deleteJob(j.id);
    expect(await loadJob(j.id)).toBeUndefined();
  });
});

describe("defaultClientReport", () => {
  const validate = clientReportValidator();

  it("produces a client_report that passes the shared schema", () => {
    let j = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "intervention" });
    j = addPhoto(j, { uri: "mock://photos/1", taken_at: new Date().toISOString(), role: "before" });
    j = addPhoto(j, { uri: "mock://photos/2", taken_at: new Date().toISOString(), role: "after" });
    j = setDiagnosis(j, {
      summary: "tablero VC 1.5 insuficiente para horno",
      client_explanation: "Hay que cambiar el cable y agregar disyuntor",
    });
    const report = defaultClientReport(j, {
      "cartridge.warranty_default": "Garantía 6 meses",
      "cartridge.professional_disclaimer": "Trabajo por matriculado UTE",
    });
    expect(validate(report)).toBe(true);
    expect(report.before_photos).toEqual(["mock://photos/1"]);
    expect(report.after_photos).toEqual(["mock://photos/2"]);
    expect(report.professional_disclaimer).toBe("Trabajo por matriculado UTE");
  });

  it("falls back to a generic disclaimer when no cartridge vars supplied", () => {
    const j = newJob({ project_id: "p1", cartridge: "trade-plomero", flow: "urgencia" });
    const report = defaultClientReport(j);
    expect(validate(report)).toBe(true);
    expect(report.professional_disclaimer.length).toBeGreaterThan(0);
  });
});
