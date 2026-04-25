/**
 * Schema tests for cartridges/_shared/schemas/*. Verifies the contracts the
 * trade cartridges depend on — happy-path acceptance + at least one
 * rejection per schema (CLAUDE.md §9.2).
 *
 * The schemas under test are loaded directly from the cartridge folder so
 * these tests catch drift between the spec and what gets shipped.
 */

import { describe, expect, it } from "vitest";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import draft07Meta from "ajv/dist/refs/json-schema-draft-07.json" with { type: "json" };
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED = resolve(__dirname, "../../cartridges/_shared/schemas");

function loadSchema(name: string) {
  const text = readFileSync(resolve(SHARED, name), "utf8");
  return JSON.parse(text);
}

function makeValidator(name: string): ValidateFunction {
  const schema = loadSchema(name);
  const ajv = new Ajv2020({ allErrors: false, strict: false });
  if (!ajv.getSchema("http://json-schema.org/draft-07/schema#")) {
    ajv.addMetaSchema(draft07Meta as object);
  }
  addFormats(ajv as unknown as Parameters<typeof addFormats>[0]);
  return ajv.compile(schema);
}

describe("photo_set schema", () => {
  const v = makeValidator("photo_set.schema.json");

  it("accepts a minimal photo_set", () => {
    expect(v({ photos: [{ uri: "mock://a", taken_at: "2026-04-25T00:00:00Z", role: "before" }] })).toBe(true);
  });

  it("accepts geo + exif + annotations", () => {
    expect(
      v({
        photos: [
          {
            uri: "mock://a",
            taken_at: "2026-04-25T00:00:00Z",
            role: "during",
            geo: { lat: -34.9, lon: -54.95, accuracy_m: 8 },
            exif: { Orientation: 1 },
            annotations: [{ kind: "voice", text: "filtración por arriba", voice_uri: "mock://v1" }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects unknown role", () => {
    expect(v({ photos: [{ uri: "mock://a", taken_at: "2026-04-25T00:00:00Z", role: "wrong" }] })).toBe(false);
  });

  it("rejects empty photos array", () => {
    expect(v({ photos: [] })).toBe(false);
  });
});

describe("diagnosis schema", () => {
  const v = makeValidator("diagnosis.schema.json");

  it("accepts a complete diagnosis", () => {
    expect(
      v({
        trade: "electricista",
        severity: 4,
        problem_categories: ["cable_subdimensionado"],
        summary: "x",
        client_explanation: "y",
        confidence: 0.7,
      }),
    ).toBe(true);
  });

  it("rejects unknown trade", () => {
    expect(
      v({
        trade: "unknown",
        severity: 1,
        problem_categories: ["foo"],
        confidence: 0.1,
      }),
    ).toBe(false);
  });

  it("rejects severity outside 1..5", () => {
    expect(v({ trade: "plomero", severity: 7, problem_categories: ["x"], confidence: 0.5 })).toBe(false);
    expect(v({ trade: "plomero", severity: 0, problem_categories: ["x"], confidence: 0.5 })).toBe(false);
  });

  it("rejects empty problem_categories", () => {
    expect(v({ trade: "pintor", severity: 1, problem_categories: [], confidence: 0.5 })).toBe(false);
  });
});

describe("work_plan schema", () => {
  const v = makeValidator("work_plan.schema.json");

  it("accepts a minimal plan", () => {
    expect(
      v({ steps: [{ id: "S1", description: "x" }], estimated_hours: 0.1 }),
    ).toBe(true);
  });

  it("accepts a plan with safety_preconditions and materials", () => {
    expect(
      v({
        steps: [
          { id: "S1", description: "Cerrar paso", estimated_minutes: 5, safety_preconditions: ["water_main_closed"] },
        ],
        estimated_hours: 0.1,
        materials: [{ name: "Flexible", qty: 2, unit: "u" }],
        requires_matriculated_professional: false,
      }),
    ).toBe(true);
  });

  it("rejects empty steps", () => {
    expect(v({ steps: [], estimated_hours: 0 })).toBe(false);
  });

  it("rejects negative estimated_hours", () => {
    expect(v({ steps: [{ id: "S1", description: "x" }], estimated_hours: -1 })).toBe(false);
  });
});

describe("quote schema", () => {
  const v = makeValidator("quote.schema.json");

  it("accepts a minimal quote", () => {
    expect(
      v({
        description: "x",
        line_items: [{ name: "labor", qty: 1, unit: "hora", unit_price: 800, total: 800 }],
        subtotal: 800,
        total: 976,
        valid_until: "2026-05-09",
      }),
    ).toBe(true);
  });

  it("rejects empty line_items", () => {
    expect(v({ description: "x", line_items: [], subtotal: 0, total: 0, valid_until: "2026-05-09" })).toBe(false);
  });

  it("rejects negative qty", () => {
    expect(
      v({
        description: "x",
        line_items: [{ name: "x", qty: -1, unit: "u", unit_price: 1, total: -1 }],
        subtotal: -1,
        total: -1,
        valid_until: "2026-05-09",
      }),
    ).toBe(false);
  });

  it("rejects bad date format", () => {
    expect(
      v({
        description: "x",
        line_items: [{ name: "x", qty: 1, unit: "u", unit_price: 1, total: 1 }],
        subtotal: 1,
        total: 1,
        valid_until: "not-a-date",
      }),
    ).toBe(false);
  });
});

describe("execution_trace schema", () => {
  const v = makeValidator("execution_trace.schema.json");

  it("accepts an empty trace", () => {
    expect(v({ actions: [] })).toBe(true);
  });

  it("accepts a populated trace with deviation", () => {
    expect(
      v({
        actions: [
          {
            step_ref: "S1",
            started_at: "2026-04-25T10:00:00Z",
            ended_at: "2026-04-25T10:20:00Z",
            outcome: "partial",
            deviation: { reason: "out of stock", kind: "material_swap" },
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects unknown outcome", () => {
    expect(
      v({ actions: [{ step_ref: "S1", started_at: "2026-04-25T10:00:00Z", outcome: "weird" }] }),
    ).toBe(false);
  });
});

describe("client_report schema", () => {
  const v = makeValidator("client_report.schema.json");

  it("accepts a minimal report", () => {
    expect(
      v({
        summary: "x",
        work_done: [{ title: "t", description: "d" }],
        professional_disclaimer: "z",
      }),
    ).toBe(true);
  });

  it("rejects missing professional_disclaimer", () => {
    expect(
      v({ summary: "x", work_done: [{ title: "t", description: "d" }] }),
    ).toBe(false);
  });

  it("rejects empty work_done", () => {
    expect(
      v({ summary: "x", work_done: [], professional_disclaimer: "z" }),
    ).toBe(false);
  });
});

describe("client_message schema", () => {
  const v = makeValidator("client_message.schema.json");

  it("accepts a basic message", () => {
    expect(v({ text: "Revisé y vuelvo mañana 9-11.", tone: "reassuring", channel_hint: "whatsapp" })).toBe(true);
  });

  it("rejects empty text", () => {
    expect(v({ text: "" })).toBe(false);
  });

  it("rejects unknown tone", () => {
    expect(v({ text: "x", tone: "shouty" })).toBe(false);
  });
});
