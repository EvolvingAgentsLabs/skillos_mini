/**
 * Mock provider contract tests. Smoke-tests the round-trip through the
 * provider interfaces — capturePhoto → storage saveBlob → getBlob →
 * sharePDF. Real providers are tested manually against device hardware.
 */

import { describe, expect, it } from "vitest";
import {
  MockMediaProvider,
  MockShareProvider,
  MockSpeechProvider,
  MockStorageProvider,
  makeMockProviders,
} from "../src/lib/providers/mock";

describe("MockStorageProvider", () => {
  it("round-trips bytes through saveBlob → getBlob", async () => {
    const s = new MockStorageProvider();
    const uri = await s.saveBlob(new Uint8Array([1, 2, 3, 4]), { bucket: "photos", mime: "image/jpeg" });
    expect(uri).toMatch(/^mock:\/\/photos\//);
    const blob = await s.getBlob(uri);
    expect(blob).toBeDefined();
    expect(blob!.size).toBe(4);
  });

  it("deletes blobs", async () => {
    const s = new MockStorageProvider();
    const uri = await s.saveBlob(new Uint8Array([1]));
    await s.deleteBlob(uri);
    expect(await s.getBlob(uri)).toBeUndefined();
  });

  it("estimateSize returns total stored bytes", async () => {
    const s = new MockStorageProvider();
    await s.saveBlob(new Uint8Array(100));
    await s.saveBlob(new Uint8Array(50));
    expect(await s.estimateSize()).toBe(150);
  });

  it("propagates failNext", async () => {
    const s = new MockStorageProvider();
    s.failNext = true;
    await expect(s.saveBlob(new Uint8Array([1]))).rejects.toThrow(/saveBlob/);
  });
});

describe("MockMediaProvider", () => {
  it("returns a PhotoRef with the requested role", async () => {
    const storage = new MockStorageProvider();
    const media = new MockMediaProvider(storage);
    const ref = await media.capturePhoto({ role: "before" });
    expect(ref.role).toBe("before");
    expect(ref.uri).toMatch(/^mock:\/\/photos\//);
    expect(ref.byte_size).toBeGreaterThan(0);
    const blob = await storage.getBlob(ref.uri);
    expect(blob).toBeDefined();
  });

  it("uses defaultRole when caller omits role", async () => {
    const storage = new MockStorageProvider();
    const media = new MockMediaProvider(storage);
    media.defaultRole = "after";
    const ref = await media.capturePhoto();
    expect(ref.role).toBe("after");
  });

  it("returns voice clip with positive duration", async () => {
    const storage = new MockStorageProvider();
    const media = new MockMediaProvider(storage);
    const clip = await media.recordVoice(2000);
    expect(clip.duration_ms).toBeGreaterThan(0);
    expect(clip.mime).toMatch(/audio/);
  });

  it("isCameraAvailable reflects the field", async () => {
    const storage = new MockStorageProvider();
    const media = new MockMediaProvider(storage);
    expect(await media.isCameraAvailable()).toBe(true);
    media.cameraAvailable = false;
    expect(await media.isCameraAvailable()).toBe(false);
  });
});

describe("MockShareProvider", () => {
  it("records every share call", async () => {
    const share = new MockShareProvider();
    await share.sharePDF("mock://pdf/abc", { title: "Reporte", to: "+59899", channel: "whatsapp" });
    expect(share.shared.length).toBe(1);
    expect(share.shared[0].uri).toBe("mock://pdf/abc");
    expect(share.shared[0].opts?.channel).toBe("whatsapp");
  });

  it("propagates failNext", async () => {
    const share = new MockShareProvider();
    share.failNext = true;
    await expect(share.sharePDF("mock://x")).rejects.toThrow(/sharePDF/);
  });
});

describe("makeMockProviders", () => {
  it("wires media → storage round trip end-to-end", async () => {
    const { media, storage, share } = makeMockProviders();
    const ref = await media.capturePhoto({ role: "before" });
    const blob = await storage.getBlob(ref.uri);
    expect(blob).toBeDefined();
    await share.sharePDF(ref.uri);
    expect((share as MockShareProvider).shared.length).toBe(1);
  });
});

describe("MockSpeechProvider", () => {
  it("returns programmed result by URI", async () => {
    const sp = new MockSpeechProvider();
    sp.results.set("mock://voice/1", { text: "hola", confidence: 0.9, language: "es" });
    const r = await sp.transcribe("mock://voice/1");
    expect(r.text).toBe("hola");
  });

  it("returns empty for unknown URI", async () => {
    const sp = new MockSpeechProvider();
    const r = await sp.transcribe("mock://voice/missing");
    expect(r.text).toBe("");
  });
});
