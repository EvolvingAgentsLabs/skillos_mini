/**
 * Vision-diagnoser tests:
 *   - serializeMessage rewrites multimodal messages into the OpenAI content-array shape
 *   - parseDiagnosis tolerates raw, fenced, tagged, and partial outputs
 *   - end-to-end runVisionDiagnoser threads through buildLLM → chat → parser
 *     using a mock LLM provider
 */

import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { _resetDBForTests, putFile } from "../src/lib/storage/db";
import { serializeMessage, type ChatMessage } from "../src/lib/llm/client";
import { parseDiagnosis, runVisionDiagnoser } from "../src/lib/llm/vision_diagnose";
import type { LLMProvider } from "../src/lib/llm/provider";
import { CartridgeRegistry } from "../src/lib/cartridge/registry";
import { makeMockProviders } from "../src/lib/providers/mock";

beforeEach(() => {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  _resetDBForTests();
});

describe("serializeMessage", () => {
  it("preserves plain text messages unchanged", () => {
    const m: ChatMessage = { role: "user", content: "hello" };
    expect(serializeMessage(m)).toEqual({ role: "user", content: "hello" });
  });

  it("rewrites a multimodal message to the OpenAI content-array shape", () => {
    const m: ChatMessage = {
      role: "user",
      content: "describe these photos",
      images: ["data:image/jpeg;base64,AAA", "data:image/png;base64,BBB"],
    };
    expect(serializeMessage(m)).toEqual({
      role: "user",
      content: [
        { type: "text", text: "describe these photos" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } },
        { type: "image_url", image_url: { url: "data:image/png;base64,BBB" } },
      ],
    });
  });

  it("omits the text part when content is empty but images are present", () => {
    const m: ChatMessage = { role: "user", content: "", images: ["data:image/jpeg;base64,AAA"] };
    const out = serializeMessage(m) as { content: unknown[] };
    expect(Array.isArray(out.content)).toBe(true);
    expect(out.content.length).toBe(1);
  });

  it("falls back to plain shape when images is an empty array", () => {
    const m: ChatMessage = { role: "user", content: "hi", images: [] };
    expect(serializeMessage(m)).toEqual({ role: "user", content: "hi" });
  });
});

describe("parseDiagnosis", () => {
  it("parses a tagged <produces> block", () => {
    const raw = `Some preamble.\n<produces>{"diagnosis":{"trade":"plomero","severity":4,"problem_categories":["x"],"summary":"s","client_explanation":"c","confidence":0.7}}</produces>\nTail.`;
    const r = parseDiagnosis(raw);
    expect(r.trade).toBe("plomero");
    expect(r.severity).toBe(4);
    expect(r.problem_categories).toEqual(["x"]);
    expect(r.summary).toBe("s");
    expect(r.client_explanation).toBe("c");
    expect(r.confidence).toBeCloseTo(0.7);
  });

  it("falls back to a fenced code block when no <produces> tag", () => {
    const raw = "Sure thing!\n```json\n{\"diagnosis\":{\"trade\":\"electricista\",\"severity\":3,\"problem_categories\":[\"a\",\"b\"]}}\n```";
    const r = parseDiagnosis(raw);
    expect(r.trade).toBe("electricista");
    expect(r.problem_categories).toEqual(["a", "b"]);
  });

  it("falls back to a bare JSON object when no tag and no fence", () => {
    const raw = '{"diagnosis":{"problem_categories":["one"]}}';
    const r = parseDiagnosis(raw);
    expect(r.problem_categories).toEqual(["one"]);
  });

  it("returns default categories when nothing parses", () => {
    const r = parseDiagnosis("the model went off-script and just talked");
    expect(r.problem_categories).toEqual(["unspecified"]);
    expect(r.summary).toBeUndefined();
  });

  it("clamps severity to 1..5", () => {
    expect(parseDiagnosis('{"diagnosis":{"severity":12,"problem_categories":["x"]}}').severity).toBe(5);
    expect(parseDiagnosis('{"diagnosis":{"severity":-3,"problem_categories":["x"]}}').severity).toBe(1);
  });

  it("clamps confidence to 0..1", () => {
    expect(parseDiagnosis('{"diagnosis":{"confidence":2,"problem_categories":["x"]}}').confidence).toBe(1);
    expect(parseDiagnosis('{"diagnosis":{"confidence":-0.5,"problem_categories":["x"]}}').confidence).toBe(0);
  });

  it("extracts hazards when well-formed", () => {
    const r = parseDiagnosis(
      '{"diagnosis":{"problem_categories":["x"],"hazards":[{"kind":"fire","description":"d","requires_immediate_action":true}]}}',
    );
    expect(r.hazards).toEqual([
      { kind: "fire", description: "d", requires_immediate_action: true },
    ]);
  });

  it("ignores malformed hazard entries", () => {
    const r = parseDiagnosis(
      '{"diagnosis":{"problem_categories":["x"],"hazards":[{"kind":"fire"},null,{"description":"only"}]}}',
    );
    expect(r.hazards).toBeUndefined();
  });
});

describe("runVisionDiagnoser end-to-end (mock LLM)", () => {
  it("loads photos through providers and parses the model output", async () => {
    // Seed a minimal cartridge with a vision-diagnoser agent so the registry can load it.
    const yaml = `
name: trade-electricista
description: x
entry_intents: [a]
flows:
  intervention: [vision-diagnoser]
default_flow: intervention
blackboard_schema: {}
validators: []
ui:
  brand_color: "#2563EB"
  emoji: "⚡"
`;
    await putFile("cartridges/trade-electricista/cartridge.yaml", yaml);
    await putFile(
      "cartridges/trade-electricista/agents/vision-diagnoser.md",
      `---
name: vision-diagnoser
description: test
needs: [photo_set]
produces: [diagnosis]
produces_schema: diagnosis.schema.json
---
# vision diagnoser

You are an electricista. Look at the photos and emit <produces>{...}</produces>.
`,
    );

    const reg = new CartridgeRegistry();
    await reg.init();
    const manifest = reg.get("trade-electricista")!;

    const providers = makeMockProviders();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const photoUri = await providers.storage.saveBlob(png, { bucket: "photos", mime: "image/png" });

    const fakeProvider: LLMProvider = {
      async chat(messages) {
        // Verify we received a multimodal user message (images attached).
        const user = messages.find((m) => m.role === "user");
        expect(user).toBeDefined();
        expect(Array.isArray(user!.images)).toBe(true);
        expect(user!.images!.length).toBe(1);
        return {
          content:
            '<produces>{"diagnosis":{"trade":"electricista","severity":4,"problem_categories":["cable_subdimensionado"],"summary":"x","client_explanation":"y","confidence":0.8}}</produces>',
        };
      },
      async testConnection() {
        return { ok: true, message: "ok" };
      },
    };

    const r = await runVisionDiagnoser({
      manifest,
      photo_uris: [photoUri],
      providerCfg: { providerId: "gemini", apiKey: "x", baseUrl: "https://example", model: "test" },
      providers,
      buildLLM: async () => fakeProvider,
      registry: reg,
    });

    expect(r.trade).toBe("electricista");
    expect(r.severity).toBe(4);
    expect(r.problem_categories).toEqual(["cable_subdimensionado"]);
    expect(r.summary).toBe("x");
    expect(r.client_explanation).toBe("y");
    expect(r.confidence).toBeCloseTo(0.8);
  });

  it("throws when the cartridge has no vision-diagnoser agent", async () => {
    const yaml = `
name: trade-empty
description: x
entry_intents: [a]
flows:
  f1: [a]
default_flow: f1
blackboard_schema: {}
validators: []
`;
    await putFile("cartridges/trade-empty/cartridge.yaml", yaml);

    const reg = new CartridgeRegistry();
    await reg.init();
    const manifest = reg.get("trade-empty")!;

    const providers = makeMockProviders();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const photoUri = await providers.storage.saveBlob(png);

    await expect(
      runVisionDiagnoser({
        manifest,
        photo_uris: [photoUri],
        providerCfg: { providerId: "gemini", apiKey: "x", baseUrl: "https://example", model: "test" },
        providers,
        buildLLM: async () => ({
          chat: async () => ({ content: "" }),
          testConnection: async () => ({ ok: true, message: "ok" }),
        }),
        registry: reg,
      }),
    ).rejects.toThrow(/vision-diagnoser/);
  });
});
