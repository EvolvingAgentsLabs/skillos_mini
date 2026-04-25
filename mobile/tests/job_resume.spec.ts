/**
 * job_store: resumeStepFor + listJobsForCartridge.
 *
 * The first picks the right step for a resumed job (capture/review/report)
 * and the second filters the cross-project jobs index by cartridge — the
 * core query used by JobsList in the trade-shell.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { _resetDBForTests } from "../src/lib/storage/db";
import {
  addPhoto,
  finalize,
  listJobsForCartridge,
  newJob,
  resumeStepFor,
  saveJob,
  setClientReport,
  setDiagnosis,
} from "../src/lib/state/job_store.svelte";

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  _resetDBForTests();
});

describe("resumeStepFor", () => {
  it("returns 'capture' on a fresh job", () => {
    const j = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "intervention" });
    expect(resumeStepFor(j)).toBe("capture");
  });

  it("returns 'review' once photos are attached but no client_report", () => {
    let j = newJob({ project_id: "p1", cartridge: "trade-plomero", flow: "urgencia" });
    j = addPhoto(j, { uri: "mock://photos/1", taken_at: new Date().toISOString(), role: "before" });
    expect(resumeStepFor(j)).toBe("review");
  });

  it("returns 'review' even when diagnosis is filled but report not", () => {
    let j = newJob({ project_id: "p1", cartridge: "trade-plomero", flow: "urgencia" });
    j = addPhoto(j, { uri: "mock://photos/1", taken_at: new Date().toISOString(), role: "before" });
    j = setDiagnosis(j, { trade: "plomero", severity: 3, problem_categories: ["x"] });
    expect(resumeStepFor(j)).toBe("review");
  });

  it("returns 'report' once a client_report has been generated", () => {
    let j = newJob({ project_id: "p1", cartridge: "trade-pintor", flow: "trabajo" });
    j = addPhoto(j, { uri: "mock://photos/1", taken_at: new Date().toISOString(), role: "after" });
    j = setClientReport(j, {
      summary: "x",
      work_done: [{ title: "t", description: "d" }],
      professional_disclaimer: "z",
    });
    expect(resumeStepFor(j)).toBe("report");
  });

  it("still returns 'report' for a finalized job (re-share path)", () => {
    let j = newJob({ project_id: "p1", cartridge: "trade-pintor", flow: "trabajo" });
    j = addPhoto(j, { uri: "mock://photos/1", taken_at: new Date().toISOString(), role: "after" });
    j = setClientReport(j, {
      summary: "x",
      work_done: [{ title: "t", description: "d" }],
      professional_disclaimer: "z",
    });
    j = finalize(j);
    expect(resumeStepFor(j)).toBe("report");
  });
});

describe("listJobsForCartridge", () => {
  it("filters by cartridge and sorts updated_at desc", async () => {
    const a = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "intervention" });
    await saveJob(a);
    await new Promise((r) => setTimeout(r, 5));
    const b = newJob({ project_id: "p2", cartridge: "trade-plomero", flow: "urgencia" });
    await saveJob(b);
    await new Promise((r) => setTimeout(r, 5));
    const c = newJob({ project_id: "p3", cartridge: "trade-electricista", flow: "intervention" });
    await saveJob(c);

    const electricistas = await listJobsForCartridge("trade-electricista");
    expect(electricistas.map((j) => j.id)).toEqual([c.id, a.id]);

    const plomeros = await listJobsForCartridge("trade-plomero");
    expect(plomeros.map((j) => j.id)).toEqual([b.id]);
  });

  it("respects the limit argument", async () => {
    for (let i = 0; i < 5; i++) {
      await saveJob(
        newJob({
          project_id: "p1",
          cartridge: "trade-pintor",
          flow: "trabajo",
          id: `job_${i}`,
        }),
      );
      await new Promise((r) => setTimeout(r, 2));
    }
    const list = await listJobsForCartridge("trade-pintor", 3);
    expect(list.length).toBe(3);
  });

  it("returns an empty array when no jobs for the cartridge", async () => {
    await saveJob(
      newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "intervention" }),
    );
    const empty = await listJobsForCartridge("trade-pintor");
    expect(empty).toEqual([]);
  });
});
