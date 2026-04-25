/**
 * professional_profile store + integration with defaultClientReport + PDF
 * generator.
 *
 * The profile is the source-of-truth for the PDF footer (CLAUDE.md §14 Q3).
 * These tests verify it round-trips through IndexedDB, that
 * `defaultClientReport` injects it correctly, and that
 * `buildClientReportPDF` embeds the logo when present.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { _resetDBForTests } from "../src/lib/storage/db";
import {
  _resetProfessionalProfileForTests,
  clearProfessionalProfile,
  isProfileComplete,
  loadProfessionalProfile,
  professionalProfile,
  saveProfessionalProfile,
} from "../src/lib/state/professional_profile.svelte";
import { defaultClientReport, newJob } from "../src/lib/state/job_store.svelte";
import { buildClientReportPDF } from "../src/lib/report/pdf";
import { makeMockProviders } from "../src/lib/providers/mock";

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  _resetDBForTests();
  _resetProfessionalProfileForTests();
});

describe("professional_profile store", () => {
  it("loads to null when nothing stored", async () => {
    await loadProfessionalProfile();
    const s = professionalProfile();
    expect(s.loaded).toBe(true);
    expect(s.profile).toBeNull();
  });

  it("save → load round-trips, trims whitespace, drops empties", async () => {
    await saveProfessionalProfile({
      name: "  Daniel R.  ",
      business_name: "Daniel R. Electricidad",
      matriculation_id: "UTE-12345",
      matriculated: true,
      phone: " +598 99 999 999 ",
      rut: "",
    });
    _resetProfessionalProfileForTests();
    await loadProfessionalProfile();
    const s = professionalProfile();
    expect(s.profile?.name).toBe("Daniel R.");
    expect(s.profile?.phone).toBe("+598 99 999 999");
    expect(s.profile?.rut).toBeUndefined();
    expect(s.profile?.matriculated).toBe(true);
    expect(typeof s.profile?.updated_at).toBe("string");
  });

  it("clear removes the row", async () => {
    await saveProfessionalProfile({ matriculated: false, name: "x", phone: "+1 1" });
    await clearProfessionalProfile();
    expect(professionalProfile().profile).toBeNull();
  });

  it("isProfileComplete enforces name/business + phone", () => {
    expect(isProfileComplete(null)).toBe(false);
    expect(isProfileComplete({ matriculated: false })).toBe(false);
    expect(isProfileComplete({ matriculated: false, name: "x" })).toBe(false);
    expect(isProfileComplete({ matriculated: false, phone: "+1 1" })).toBe(false);
    expect(isProfileComplete({ matriculated: false, name: "x", phone: "+1 1" })).toBe(true);
    expect(isProfileComplete({ matriculated: false, business_name: "X SRL", phone: "+1 1" })).toBe(true);
  });
});

describe("defaultClientReport with profile", () => {
  it("populates client_report.professional from the profile", () => {
    const j = newJob({ project_id: "p1", cartridge: "trade-electricista", flow: "intervention" });
    const report = defaultClientReport(j, {}, {
      matriculated: true,
      name: "Daniel",
      business_name: "Daniel Electricidad",
      matriculation_id: "UTE-12345",
      phone: "+598 99 999 999",
      rut: "21 1111111 0019",
    });
    expect(report.professional?.business_name).toBe("Daniel Electricidad");
    expect(report.professional?.matriculated).toBe(true);
    expect(report.professional?.matriculation_id).toBe("UTE-12345");
  });

  it("leaves professional undefined when no profile passed", () => {
    const j = newJob({ project_id: "p1", cartridge: "trade-pintor", flow: "trabajo" });
    const report = defaultClientReport(j);
    expect(report.professional).toBeUndefined();
  });
});

describe("buildClientReportPDF with logo", () => {
  it("embeds the logo blob when professional.logo_uri is set", async () => {
    const providers = makeMockProviders();
    const PNG_1x1_B64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";
    const png = Uint8Array.from(atob(PNG_1x1_B64), (c) => c.charCodeAt(0));
    const logoUri = await providers.storage.saveBlob(png, { bucket: "photos", mime: "image/png" });

    const result = await buildClientReportPDF(
      {
        summary: "x",
        work_done: [{ title: "t", description: "d" }],
        professional_disclaimer: "ok",
        professional: {
          name: "Daniel",
          business_name: "Daniel Electricidad",
          phone: "+598 99 999 999",
          matriculated: true,
          logo_uri: logoUri,
        },
      },
      { providers },
    );
    // Logo embeds inflate the PDF compared to the no-logo baseline.
    expect(result.byte_size).toBeGreaterThan(700);
  });

  it("renders without logo gracefully when logo_uri missing", async () => {
    const providers = makeMockProviders();
    const result = await buildClientReportPDF(
      {
        summary: "x",
        work_done: [{ title: "t", description: "d" }],
        professional_disclaimer: "ok",
        professional: { matriculated: false, name: "Pablo", phone: "+1 1" },
      },
      { providers },
    );
    expect(result.byte_size).toBeGreaterThan(400);
  });
});
