/**
 * LiteRT vision wiring tests.
 *
 * The plugin call-through itself is only meaningful on a real Android
 * device + downloaded model. What we CAN unit-test cleanly is the two
 * pure helpers that bridge ChatMessage[] → LiteRT's image input shape:
 *
 *   - isVisionCapable(catalogEntry) — flag + id-based fallback
 *   - extractImagePayloads(messages) — walks the trailing user message,
 *     strips the `data:...;base64,` prefix, rejects http(s) URLs to
 *     preserve the privacy invariant (CLAUDE.md §9.3)
 */

import { describe, expect, it } from "vitest";
import {
  extractImagePayloads,
  isVisionCapable,
} from "../src/lib/llm/local/litert_backend";
import type { ChatMessage } from "../src/lib/llm/client";
import type { ModelCatalogEntry } from "../src/lib/llm/local/model_catalog";

function entry(over: Partial<ModelCatalogEntry>): ModelCatalogEntry {
  return {
    id: "test",
    name: "Test",
    description: "test",
    url: "https://example.invalid/x.litertlm",
    backend: "litert",
    sizeBytes: 1,
    template: "gemma-v3",
    contextTokens: 8_192,
    tier: "cheap",
    license: "Apache-2.0",
    ...over,
  };
}

describe("isVisionCapable", () => {
  it("returns false when no entry", () => {
    expect(isVisionCapable(undefined)).toBe(false);
  });

  it("returns true when the catalog entry sets vision: true", () => {
    expect(isVisionCapable(entry({ id: "custom", vision: true }))).toBe(true);
  });

  it("returns false for text-only catalog entries", () => {
    expect(isVisionCapable(entry({ id: "qwen2.5-1.5b" }))).toBe(false);
    expect(isVisionCapable(entry({ id: "gemma-2-2b-it-litertlm" }))).toBe(false);
  });

  it("falls back to id heuristic for Gemma 4 entries without the vision flag set", () => {
    expect(isVisionCapable(entry({ id: "gemma-4-e2b-it-litertlm" }))).toBe(true);
    expect(isVisionCapable(entry({ id: "gemma-4-e4b-it-litertlm" }))).toBe(true);
  });

  it("does not accidentally match Gemma 2 / 3", () => {
    expect(isVisionCapable(entry({ id: "gemma-2-2b-it-q4_k_m" }))).toBe(false);
    expect(isVisionCapable(entry({ id: "gemma-3-7b-it-litertlm" }))).toBe(false);
  });
});

describe("extractImagePayloads", () => {
  it("returns empty when no user message has images", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "x" },
      { role: "user", content: "hello" },
    ];
    expect(extractImagePayloads(messages)).toEqual([]);
  });

  it("strips data:image/...;base64, prefix and returns raw base64", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: "look",
        images: [
          "data:image/png;base64,AAA",
          "data:image/jpeg;base64,BBB",
        ],
      },
    ];
    expect(extractImagePayloads(messages)).toEqual(["AAA", "BBB"]);
  });

  it("walks back to the most recent user message", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      {
        role: "user",
        content: "earlier",
        images: ["data:image/jpeg;base64,EARLIER"],
      },
      { role: "assistant", content: "ack" },
      {
        role: "user",
        content: "later",
        images: ["data:image/jpeg;base64,LATER"],
      },
    ];
    expect(extractImagePayloads(messages)).toEqual(["LATER"]);
  });

  it("preserves a raw base64 string when no data: prefix is present", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "x", images: ["RAW_BASE64_PAYLOAD"] },
    ];
    expect(extractImagePayloads(messages)).toEqual(["RAW_BASE64_PAYLOAD"]);
  });

  it("rejects http(s) remote URLs to preserve the privacy invariant", () => {
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: "x",
        images: [
          "https://evil.example/leaks-job-photos.png",
          "data:image/jpeg;base64,SAFE",
        ],
      },
    ];
    expect(extractImagePayloads(messages)).toEqual(["SAFE"]);
  });

  it("returns empty when the trailing user has empty images array", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "x", images: [] },
    ];
    expect(extractImagePayloads(messages)).toEqual([]);
  });

  it("ignores images on assistant or system messages", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "s", images: ["data:image/jpeg;base64,IGNORED"] },
      {
        role: "assistant",
        content: "a",
        images: ["data:image/jpeg;base64,IGNORED2"],
      },
      { role: "user", content: "u" },
    ];
    expect(extractImagePayloads(messages)).toEqual([]);
  });
});
