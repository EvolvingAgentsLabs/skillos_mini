/**
 * Mock providers for Vitest. In-memory only.
 *
 * Tests that exercise capture/storage/share flow should use these — they
 * give deterministic URIs, no external IO, and explicit failure injection
 * (set `failNext` on any provider to make the next call throw).
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

let blobCounter = 0;

function nextUri(bucket: string): string {
  blobCounter += 1;
  return `mock://${bucket}/${String(blobCounter).padStart(6, "0")}`;
}

/**
 * Coerce a Uint8Array | ArrayBuffer into a fresh ArrayBuffer so the Blob
 * constructor accepts it under strict TS lib settings (where Uint8Array's
 * underlying buffer is typed as ArrayBufferLike, including SharedArrayBuffer).
 */
function toArrayBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  // Always copy: cheap for our sizes, removes ambiguity over view ranges.
  const out = new ArrayBuffer(input.byteLength);
  new Uint8Array(out).set(input);
  return out;
}

export class MockStorageProvider implements StorageProvider {
  private store = new Map<string, Blob>();
  failNext = false;

  async saveBlob(bytes: Blob | ArrayBuffer | Uint8Array, opts: { bucket?: string; mime?: string } = {}): Promise<string> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("mock saveBlob failure");
    }
    const bucket = opts.bucket ?? "blobs";
    const blob =
      bytes instanceof Blob
        ? bytes
        : new Blob([toArrayBuffer(bytes)], {
            type: opts.mime ?? "application/octet-stream",
          });
    const uri = nextUri(bucket);
    this.store.set(uri, blob);
    return uri;
  }

  async getBlob(uri: string): Promise<Blob | undefined> {
    return this.store.get(uri);
  }

  async deleteBlob(uri: string): Promise<void> {
    this.store.delete(uri);
  }

  async estimateSize(): Promise<number> {
    let total = 0;
    for (const b of this.store.values()) total += b.size;
    return total;
  }
}

export class MockMediaProvider implements MediaProvider {
  failNext = false;
  cameraAvailable = true;
  voiceAvailable = true;
  /** Optional bytes returned by next capturePhoto. Default is a 4-byte stub. */
  nextPhotoBytes?: Uint8Array;
  /** Optional override for the role auto-applied if caller omits it. */
  defaultRole: PhotoRef["role"] = "detail";

  constructor(private readonly storage: StorageProvider) {}

  async capturePhoto(opts: PhotoCaptureOptions = {}): Promise<PhotoRef> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("mock capturePhoto failure");
    }
    const bytes = this.nextPhotoBytes ?? new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    this.nextPhotoBytes = undefined;
    const uri = await this.storage.saveBlob(bytes, { bucket: "photos", mime: "image/jpeg" });
    return {
      uri,
      taken_at: new Date().toISOString(),
      role: opts.role ?? this.defaultRole,
      width: 1600,
      height: 1200,
      byte_size: bytes.byteLength,
    };
  }

  async recordVoice(maxDurationMs = 30_000): Promise<VoiceClip> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("mock recordVoice failure");
    }
    const bytes = new Uint8Array([0x66, 0x74, 0x79, 0x70]);
    const uri = await this.storage.saveBlob(bytes, { bucket: "voice", mime: "audio/m4a" });
    return {
      uri,
      duration_ms: Math.min(maxDurationMs, 1500),
      mime: "audio/m4a",
      taken_at: new Date().toISOString(),
    };
  }

  async isCameraAvailable(): Promise<boolean> {
    return this.cameraAvailable;
  }

  async isVoiceAvailable(): Promise<boolean> {
    return this.voiceAvailable;
  }
}

export class MockShareProvider implements ShareProvider {
  shared: { uri: string; opts: SharePDFOptions | undefined }[] = [];
  channels: ShareChannel[] = ["whatsapp", "email", "system"];
  failNext = false;

  async sharePDF(uri: string, opts?: SharePDFOptions): Promise<{ shared: boolean }> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("mock sharePDF failure");
    }
    this.shared.push({ uri, opts });
    return { shared: true };
  }

  async supportedChannels(): Promise<ShareChannel[]> {
    return this.channels;
  }
}

export class MockGeoProvider implements GeoProvider {
  next?: GeoPosition;
  available = true;
  failNext = false;

  async getPosition(): Promise<GeoPosition | undefined> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("mock getPosition failure");
    }
    return this.next;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }
}

export class MockSpeechProvider implements SpeechProvider {
  available = true;
  /** Lookup table: audioUri → result. Falls back to empty string. */
  results = new Map<string, SpeechTranscriptionResult>();
  /** Programmable response for the next listen() call. */
  nextListen: SpeechTranscriptionResult | null = null;
  /** Optional partial-result emissions for the next listen(). */
  nextPartials: string[] = [];
  failNext = false;

  async transcribe(audioUri: string, language?: string): Promise<SpeechTranscriptionResult> {
    return (
      this.results.get(audioUri) ?? {
        text: "",
        confidence: 0,
        language,
      }
    );
  }

  async listen(opts: SpeechListenOptions = {}): Promise<SpeechTranscriptionResult> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("mock listen failure");
    }
    for (const p of this.nextPartials) opts.onpartial?.(p);
    this.nextPartials = [];
    const result = this.nextListen ?? {
      text: "",
      confidence: 0,
      language: opts.language,
    };
    this.nextListen = null;
    return result;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }
}

export function makeMockProviders(): {
  media: MockMediaProvider;
  storage: MockStorageProvider;
  share: MockShareProvider;
  geo: MockGeoProvider;
  speech: MockSpeechProvider;
} {
  const storage = new MockStorageProvider();
  return {
    storage,
    media: new MockMediaProvider(storage),
    share: new MockShareProvider(),
    geo: new MockGeoProvider(),
    speech: new MockSpeechProvider(),
  };
}
