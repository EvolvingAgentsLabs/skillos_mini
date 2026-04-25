/**
 * SpeechProvider live-listen tests.
 *
 * MockSpeechProvider.listen is a programmable surface — these tests verify:
 *   - it returns the programmed result
 *   - it emits partials via the onpartial callback
 *   - it propagates failNext as a thrown error
 *   - isAvailable reflects the `available` field
 *
 * Plus a small append-semantics test mirroring the trade-flow's textarea
 * insertion logic.
 */

import { describe, expect, it } from "vitest";
import { MockSpeechProvider, makeMockProviders } from "../src/lib/providers/mock";

describe("MockSpeechProvider.listen", () => {
  it("returns the programmed nextListen result", async () => {
    const sp = new MockSpeechProvider();
    sp.nextListen = { text: "hola que tal", confidence: 0.92, language: "es-UY" };
    const r = await sp.listen({ language: "es-UY" });
    expect(r.text).toBe("hola que tal");
    expect(r.confidence).toBe(0.92);
    expect(r.language).toBe("es-UY");
  });

  it("returns empty when nothing programmed", async () => {
    const sp = new MockSpeechProvider();
    const r = await sp.listen();
    expect(r.text).toBe("");
  });

  it("emits partials in order via onpartial", async () => {
    const sp = new MockSpeechProvider();
    sp.nextPartials = ["se", "se ve", "se ve mancha en la pared"];
    sp.nextListen = { text: "se ve mancha en la pared" };
    const seen: string[] = [];
    const r = await sp.listen({ onpartial: (t) => seen.push(t) });
    expect(seen).toEqual(["se", "se ve", "se ve mancha en la pared"]);
    expect(r.text).toBe("se ve mancha en la pared");
  });

  it("clears nextListen after one call (single-shot)", async () => {
    const sp = new MockSpeechProvider();
    sp.nextListen = { text: "primero" };
    const r1 = await sp.listen();
    const r2 = await sp.listen();
    expect(r1.text).toBe("primero");
    expect(r2.text).toBe("");
  });

  it("propagates failNext", async () => {
    const sp = new MockSpeechProvider();
    sp.failNext = true;
    await expect(sp.listen()).rejects.toThrow(/listen/);
  });

  it("isAvailable reflects the field", async () => {
    const sp = new MockSpeechProvider();
    expect(await sp.isAvailable()).toBe(true);
    sp.available = false;
    expect(await sp.isAvailable()).toBe(false);
  });
});

describe("makeMockProviders speech path", () => {
  it("exposes listen() through the bundle", async () => {
    const { speech } = makeMockProviders();
    speech.nextListen = { text: "rojo", confidence: 0.7 };
    const r = await speech.listen!();
    expect(r.text).toBe("rojo");
  });
});

describe("appendChunk semantics (mirrors TradeFlowSheet helper)", () => {
  // Inline duplicate of the helper used inside TradeFlowSheet.svelte, kept
  // here as a regression test for the dictation UX. If the helper changes,
  // both sites should change together.
  function appendChunk(existing: string, chunk: string): string {
    const trimmedExisting = existing.replace(/\s+$/, "");
    if (!trimmedExisting) return chunk;
    return `${trimmedExisting} ${chunk}`;
  }

  it("returns the chunk as-is when textarea is empty", () => {
    expect(appendChunk("", "primera frase")).toBe("primera frase");
  });

  it("trims trailing whitespace before joining", () => {
    expect(appendChunk("ya escribí algo \n  \t", "y ahora dicto esto")).toBe(
      "ya escribí algo y ahora dicto esto",
    );
  });

  it("preserves the exact chunk text without further mangling", () => {
    expect(appendChunk("uno", "DOS — tres")).toBe("uno DOS — tres");
  });
});
