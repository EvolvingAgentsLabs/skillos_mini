/**
 * Capacitor (Android) providers — production path on device.
 *
 * Wraps @capacitor/camera, @capacitor/share, @capacitor/geolocation,
 * @capacitor/filesystem, @capacitor-community/speech-recognition.
 *
 * Why these specific plugins: see CLAUDE.md §7.
 *
 * iOS support is intentionally not the focus today (CLAUDE.md §3.2).
 * The Android plugins also work on iOS, so when M12 lifts the iOS
 * gate, this provider should "just work" with minor exceptions
 * called out inline below.
 */

import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Geolocation } from "@capacitor/geolocation";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

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

const PHOTO_DIR = "skillos/photos";
const VOICE_DIR = "skillos/voice";
const PDF_DIR = "skillos/pdf";

let blobCounter = 0;

function nextId(): string {
  blobCounter += 1;
  return `${Date.now().toString(36)}_${blobCounter.toString(36)}`;
}

/* StorageProvider — Capacitor Filesystem on the user's app data directory. */

export class CapacitorStorageProvider implements StorageProvider {
  async saveBlob(bytes: Blob | ArrayBuffer | Uint8Array, opts: { bucket?: string; mime?: string } = {}): Promise<string> {
    const bucket = opts.bucket ?? "blobs";
    const id = nextId();
    const ext = mimeToExt(opts.mime, bytes instanceof Blob ? bytes.type : undefined);
    const path = `skillos/${bucket}/${id}${ext}`;

    const data = await toBase64(bytes);
    await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Data,
      recursive: true,
    });

    // Return a stable internal URI; getBlob resolves it back to a file path.
    return `capacitor-fs://${path}`;
  }

  async getBlob(uri: string): Promise<Blob | undefined> {
    if (!uri.startsWith("capacitor-fs://")) return undefined;
    const path = uri.slice("capacitor-fs://".length);
    try {
      const result = await Filesystem.readFile({ path, directory: Directory.Data });
      const data = typeof result.data === "string" ? result.data : await blobToBase64(result.data);
      const bytes = base64ToUint8(data);
      const buf = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buf).set(bytes);
      return new Blob([buf], { type: extToMime(path) });
    } catch {
      return undefined;
    }
  }

  async deleteBlob(uri: string): Promise<void> {
    if (!uri.startsWith("capacitor-fs://")) return;
    const path = uri.slice("capacitor-fs://".length);
    try {
      await Filesystem.deleteFile({ path, directory: Directory.Data });
    } catch {
      /* swallow */
    }
  }

  async estimateSize(): Promise<number> {
    // Capacitor doesn't expose a directory-size API; the shell shows a
    // "tap to recompute" affordance in Settings if it really needs the number.
    return 0;
  }
}

/* MediaProvider — @capacitor/camera + @capacitor/filesystem. */

export class CapacitorMediaProvider implements MediaProvider {
  constructor(private readonly storage: StorageProvider) {}

  async capturePhoto(opts: PhotoCaptureOptions = {}): Promise<PhotoRef> {
    const photo = await Camera.getPhoto({
      quality: opts.quality ?? 85,
      width: opts.max_dim ?? 1600,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      saveToGallery: false,
      correctOrientation: true,
    });

    const base64 = photo.base64String ?? "";
    const bytes = base64ToUint8(base64);
    const uri = await this.storage.saveBlob(bytes, { bucket: "photos", mime: "image/jpeg" });

    let geo: PhotoRef["geo"];
    if (opts.with_geo) {
      try {
        const pos = await Geolocation.getCurrentPosition({ timeout: 4000 });
        geo = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
        };
      } catch {
        /* permission denied or no fix — drop silently */
      }
    }

    return {
      uri,
      taken_at: new Date().toISOString(),
      role: opts.role ?? "detail",
      byte_size: bytes.byteLength,
      geo,
      exif: photo.exif as Record<string, unknown> | undefined,
    };
  }

  async recordVoice(maxDurationMs = 30_000): Promise<VoiceClip> {
    // Voice recording on Capacitor needs a community plugin
    // (@capacitor-community/voice-recorder). It is NOT installed in MVP.
    // Until it is, voice annotations on Android fall back to: take a
    // text annotation, or rely on the SpeechProvider live-transcribe path.
    void maxDurationMs;
    throw new Error(
      "voice recording not yet wired on Capacitor — install @capacitor-community/voice-recorder when M3 voice annotation lands",
    );
  }

  async isCameraAvailable(): Promise<boolean> {
    try {
      const perm = await Camera.checkPermissions();
      return perm.camera !== "denied";
    } catch {
      return false;
    }
  }

  async isVoiceAvailable(): Promise<boolean> {
    return false;
  }
}

/* ShareProvider — @capacitor/share. */

export class CapacitorShareProvider implements ShareProvider {
  constructor(private readonly storage: StorageProvider) {}

  async sharePDF(uri: string, opts: SharePDFOptions = {}): Promise<{ shared: boolean }> {
    if (!uri.startsWith("capacitor-fs://")) {
      return { shared: false };
    }
    const path = uri.slice("capacitor-fs://".length);

    // Capacitor Share needs a file:// URL; resolve via Filesystem.
    let fileUri: string;
    try {
      const r = await Filesystem.getUri({ path, directory: Directory.Data });
      fileUri = r.uri;
    } catch {
      return { shared: false };
    }

    const text = opts.message ?? "";
    const title = opts.title ?? "Reporte";
    try {
      await Share.share({ title, text, url: fileUri, dialogTitle: title });
      return { shared: true };
    } catch {
      return { shared: false };
    }
  }

  async supportedChannels(): Promise<ShareChannel[]> {
    // The system sheet shows whatever the OS has — we cannot enumerate
    // ahead of time on Android. Hint that WhatsApp is typically present.
    return ["system", "whatsapp", "email"];
  }
}

/* GeoProvider — @capacitor/geolocation. */

export class CapacitorGeoProvider implements GeoProvider {
  async getPosition(timeoutMs = 5_000): Promise<GeoPosition | undefined> {
    try {
      const pos = await Geolocation.getCurrentPosition({ timeout: timeoutMs });
      return {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
        timestamp: pos.timestamp,
      };
    } catch {
      return undefined;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const perm = await Geolocation.checkPermissions();
      return perm.location !== "denied";
    } catch {
      return false;
    }
  }
}

/* SpeechProvider — @capacitor-community/speech-recognition.
   transcribe(uri) is not supported on Android (the plugin is live-only).
   listen() opens the mic, accumulates partial results, and resolves with
   the final transcript when the user stops speaking or the timeout fires. */

export class CapacitorSpeechProvider implements SpeechProvider {
  async transcribe(audioUri: string, language?: string): Promise<SpeechTranscriptionResult> {
    // Pre-recorded URI transcription needs a separate plugin (e.g. on-device
    // Whisper). Returning empty is honest until that lands.
    void audioUri;
    return { text: "", confidence: 0, language };
  }

  async listen(opts: SpeechListenOptions = {}): Promise<SpeechTranscriptionResult> {
    const language = opts.language ?? "es-UY";
    const max_duration_ms = opts.max_duration_ms ?? 12_000;
    try {
      const perm = await SpeechRecognition.checkPermissions();
      if (perm.speechRecognition !== "granted") {
        const req = await SpeechRecognition.requestPermissions();
        if (req.speechRecognition !== "granted") {
          return { text: "", confidence: 0, language };
        }
      }

      const partials: string[] = [];
      const handler = (data: { matches?: string[] }) => {
        const t = (data?.matches?.[0] ?? "").trim();
        if (t) {
          partials.push(t);
          opts.onpartial?.(t);
        }
      };
      const sub = await SpeechRecognition.addListener("partialResults", handler);

      const startResult = SpeechRecognition.start({
        language,
        maxResults: 1,
        prompt: "",
        partialResults: true,
        popup: false,
      } as Parameters<typeof SpeechRecognition.start>[0]);

      // Hard timeout — Android STT doesn't always fire endOfSpeech reliably.
      const timeoutHandle = setTimeout(() => {
        SpeechRecognition.stop().catch(() => {});
      }, max_duration_ms);

      let finalMatches: string[] | undefined;
      try {
        const r = (await startResult) as unknown as { matches?: string[] } | undefined;
        finalMatches = r?.matches;
      } catch {
        finalMatches = undefined;
      } finally {
        clearTimeout(timeoutHandle);
        await sub.remove();
      }

      const finalText = (finalMatches?.[0] ?? partials[partials.length - 1] ?? "").trim();
      return { text: finalText, language };
    } catch {
      return { text: "", confidence: 0, language };
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const a = await SpeechRecognition.available();
      return a.available === true;
    } catch {
      return false;
    }
  }
}

export function makeCapacitorProviders(): {
  media: MediaProvider;
  storage: StorageProvider;
  share: ShareProvider;
  geo: GeoProvider;
  speech: SpeechProvider;
} {
  const storage = new CapacitorStorageProvider();
  return {
    storage,
    media: new CapacitorMediaProvider(storage),
    share: new CapacitorShareProvider(storage),
    geo: new CapacitorGeoProvider(),
    speech: new CapacitorSpeechProvider(),
  };
}

/* helpers */

async function toBase64(bytes: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  if (bytes instanceof Blob) return blobToBase64(bytes);
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.byteLength; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}

async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader === "undefined") {
    const buf = await blob.arrayBuffer();
    return toBase64(buf);
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const s = String(r.result ?? "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = typeof atob === "function" ? atob(b64) : "";
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function mimeToExt(mime?: string, fallback?: string): string {
  const m = (mime || fallback || "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("pdf")) return ".pdf";
  if (m.includes("m4a")) return ".m4a";
  if (m.includes("webm")) return ".webm";
  if (m.includes("wav")) return ".wav";
  return "";
}

function extToMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".m4a")) return "audio/m4a";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

// Track unused import; kept here so `Encoding` is reserved for future text APIs
// without re-tweaking the import block later.
void Encoding;
void PHOTO_DIR;
void VOICE_DIR;
void PDF_DIR;
