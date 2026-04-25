/**
 * Web (browser) providers — used for Vite dev server and the desktop preview.
 * Not the production path on Android (see capacitor.ts).
 *
 * - MediaProvider uses `getUserMedia` + `<input type=file capture>` fallback.
 * - StorageProvider uses IndexedDB via `idb`.
 * - ShareProvider uses the Web Share API when available; otherwise downloads.
 * - GeoProvider uses navigator.geolocation.
 * - SpeechProvider uses Web Speech API (Chrome) or returns empty.
 */

import type {
  GeoPosition,
  GeoProvider,
  MediaProvider,
  PhotoCaptureOptions,
  PhotoRef,
  ShareChannel,
  ShareProvider,
  SharePDFOptions,
  SpeechListenOptions,
  SpeechProvider,
  SpeechTranscriptionResult,
  StorageProvider,
  VoiceClip,
} from "./types";

/* StorageProvider — IndexedDB-backed via the existing idb wrapper. */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "skillos-providers";
const DB_VERSION = 1;
const BLOB_STORE = "blobs";

interface ProvidersDB {
  blobs: {
    key: string;
    value: { uri: string; bytes: ArrayBuffer; mime: string; bucket: string; created_at: number };
  };
}

let dbPromise: Promise<IDBPDatabase<ProvidersDB>> | null = null;

function getDB(): Promise<IDBPDatabase<ProvidersDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ProvidersDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(BLOB_STORE)) {
          db.createObjectStore(BLOB_STORE, { keyPath: "uri" });
        }
      },
    });
  }
  return dbPromise;
}

let webBlobCounter = 0;

export class WebStorageProvider implements StorageProvider {
  async saveBlob(bytes: Blob | ArrayBuffer | Uint8Array, opts: { bucket?: string; mime?: string } = {}): Promise<string> {
    const db = await getDB();
    const bucket = opts.bucket ?? "blobs";
    webBlobCounter += 1;
    const id = `${Date.now().toString(36)}_${webBlobCounter.toString(36)}`;
    const uri = `local://${bucket}/${id}`;
    const buf =
      bytes instanceof Blob
        ? await bytes.arrayBuffer()
        : bytes instanceof Uint8Array
          ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          : bytes;
    await db.put(BLOB_STORE, {
      uri,
      bytes: buf,
      mime: opts.mime ?? (bytes instanceof Blob ? bytes.type : "application/octet-stream"),
      bucket,
      created_at: Date.now(),
    });
    return uri;
  }

  async getBlob(uri: string): Promise<Blob | undefined> {
    const db = await getDB();
    const row = await db.get(BLOB_STORE, uri);
    if (!row) return undefined;
    return new Blob([row.bytes], { type: row.mime });
  }

  async deleteBlob(uri: string): Promise<void> {
    const db = await getDB();
    await db.delete(BLOB_STORE, uri);
  }

  async estimateSize(): Promise<number> {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return est.usage ?? 0;
    }
    return 0;
  }
}

/* MediaProvider — file input + getUserMedia. */

export class WebMediaProvider implements MediaProvider {
  constructor(private readonly storage: StorageProvider) {}

  async capturePhoto(opts: PhotoCaptureOptions = {}): Promise<PhotoRef> {
    const blob = await pickImageViaInput();
    const uri = await this.storage.saveBlob(blob, { bucket: "photos", mime: blob.type || "image/jpeg" });
    const dims = await readImageDims(blob);
    return {
      uri,
      taken_at: new Date().toISOString(),
      role: opts.role ?? "detail",
      width: dims?.width,
      height: dims?.height,
      byte_size: blob.size,
    };
  }

  async recordVoice(maxDurationMs = 30_000): Promise<VoiceClip> {
    const blob = await recordViaMediaRecorder(maxDurationMs);
    const uri = await this.storage.saveBlob(blob, { bucket: "voice", mime: blob.type || "audio/webm" });
    return {
      uri,
      duration_ms: maxDurationMs,
      mime: blob.type || "audio/webm",
      taken_at: new Date().toISOString(),
    };
  }

  async isCameraAvailable(): Promise<boolean> {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  async isVoiceAvailable(): Promise<boolean> {
    return typeof window !== "undefined" && typeof (window as { MediaRecorder?: unknown }).MediaRecorder === "function";
  }
}

function pickImageViaInput(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("WebMediaProvider.capturePhoto requires a DOM"));
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) reject(new Error("no file chosen"));
      else resolve(file);
    };
    input.click();
  });
}

async function readImageDims(blob: Blob): Promise<{ width: number; height: number } | undefined> {
  if (typeof Image === "undefined") return undefined;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(undefined);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function recordViaMediaRecorder(maxDurationMs: number): Promise<Blob> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia not available");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();
  await new Promise((r) => setTimeout(r, maxDurationMs));
  return new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };
    recorder.stop();
  });
}

/* ShareProvider — Web Share + download fallback. */

export class WebShareProvider implements ShareProvider {
  constructor(private readonly storage: StorageProvider) {}

  async sharePDF(uri: string, opts: SharePDFOptions = {}): Promise<{ shared: boolean }> {
    const blob = await this.storage.getBlob(uri);
    if (!blob) return { shared: false };
    const filename = opts.title ? `${opts.title.replace(/[^\w\-]+/g, "_")}.pdf` : "report.pdf";
    const file = new File([blob], filename, { type: "application/pdf" });
    if (
      typeof navigator !== "undefined" &&
      typeof (navigator as { share?: unknown }).share === "function" &&
      typeof (navigator as { canShare?: (data: unknown) => boolean }).canShare === "function" &&
      (navigator as { canShare: (data: unknown) => boolean }).canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file], title: opts.title, text: opts.message });
      return { shared: true };
    }
    if (typeof document !== "undefined" && typeof URL !== "undefined") {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return { shared: true };
    }
    return { shared: false };
  }

  async supportedChannels(): Promise<ShareChannel[]> {
    return ["system"];
  }
}

/* GeoProvider — navigator.geolocation. */

export class WebGeoProvider implements GeoProvider {
  async getPosition(timeoutMs = 5_000): Promise<GeoPosition | undefined> {
    if (typeof navigator === "undefined" || !navigator.geolocation) return undefined;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
            timestamp: pos.timestamp,
          }),
        () => resolve(undefined),
        { timeout: timeoutMs },
      );
    });
  }

  async isAvailable(): Promise<boolean> {
    return typeof navigator !== "undefined" && !!navigator.geolocation;
  }
}

/* SpeechProvider — Web Speech API (Chrome only). */

interface SpeechRecognitionResultLike {
  0: { transcript: string; confidence: number };
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
type SpeechRecognitionCtor = new () => {
  lang?: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
};

export class WebSpeechProvider implements SpeechProvider {
  async transcribe(audioUri: string, language?: string): Promise<SpeechTranscriptionResult> {
    // Web Speech API operates on live audio, not pre-recorded clips.
    // For pre-recorded URIs we return an empty result — the LiteRT/Capacitor
    // impl is the production path. Surfacing this honestly is better than
    // a broken playback hack.
    void audioUri;
    return { text: "", confidence: 0, language };
  }

  async listen(opts: SpeechListenOptions = {}): Promise<SpeechTranscriptionResult> {
    if (typeof window === "undefined") return { text: "", language: opts.language };
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return { text: "", language: opts.language };
    const lang = opts.language ?? "es-UY";
    const rec = new Ctor();
    rec.lang = lang;
    return new Promise((resolve) => {
      let final = "";
      let confidence = 0;
      const timeout = setTimeout(() => rec.stop(), opts.max_duration_ms ?? 12_000);
      rec.onresult = (e) => {
        const results = e.results;
        for (let i = 0; i < results.length; i++) {
          const r = results[i][0];
          final += r.transcript;
          confidence = Math.max(confidence, r.confidence);
        }
        opts.onpartial?.(final);
      };
      rec.onerror = () => {
        clearTimeout(timeout);
        resolve({ text: final.trim(), confidence, language: lang });
      };
      rec.onend = () => {
        clearTimeout(timeout);
        resolve({ text: final.trim(), confidence, language: lang });
      };
      rec.start();
    });
  }

  async isAvailable(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }
}

export function makeWebProviders(): {
  media: MediaProvider;
  storage: StorageProvider;
  share: ShareProvider;
  geo: GeoProvider;
  speech: SpeechProvider;
} {
  const storage = new WebStorageProvider();
  return {
    storage,
    media: new WebMediaProvider(storage),
    share: new WebShareProvider(storage),
    geo: new WebGeoProvider(),
    speech: new WebSpeechProvider(),
  };
}
