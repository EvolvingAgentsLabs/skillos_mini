/**
 * Provider interfaces — CLAUDE.md §4.3.
 *
 * The shell and cartridge runtime do NOT import Capacitor APIs directly.
 * They go through these interfaces. Implementations:
 *   - CapacitorMediaProvider — production Android
 *   - WebMediaProvider — browser dev/preview
 *   - MockMediaProvider — Vitest
 *
 * This boundary unblocks future iOS/desktop ports and keeps unit tests
 * trivial. Adding a new provider type requires extending this file plus
 * one mock implementation, never the call sites.
 */

export type PhotoRole = "before" | "during" | "after" | "detail";

export interface PhotoCaptureOptions {
  /** Where this photo sits in the job timeline. Defaults to "detail". */
  role?: PhotoRole;
  /**
   * Maximum dimension (px) the impl should resize to before storing.
   * Default 1600. Vision pipelines downscale anyway; storing larger wastes space.
   */
  max_dim?: number;
  /** JPEG quality 0..100. Default 85. */
  quality?: number;
  /** Include geolocation in the returned `geo` field. Default false. */
  with_geo?: boolean;
}

export interface PhotoRef {
  /** Local URI usable by StorageProvider.getBlob to retrieve the bytes. */
  uri: string;
  /** ISO-8601. */
  taken_at: string;
  role: PhotoRole;
  width?: number;
  height?: number;
  /** Bytes when known. */
  byte_size?: number;
  geo?: { lat: number; lon: number; accuracy_m?: number };
  exif?: Record<string, unknown>;
}

export interface VoiceClip {
  /** URI of the recorded audio blob. */
  uri: string;
  /** ms */
  duration_ms: number;
  /** Mime type, e.g. "audio/m4a". */
  mime: string;
  taken_at: string;
}

export interface MediaProvider {
  capturePhoto(opts?: PhotoCaptureOptions): Promise<PhotoRef>;
  recordVoice(maxDurationMs?: number): Promise<VoiceClip>;
  /** Whether the underlying device exposes a camera. */
  isCameraAvailable(): Promise<boolean>;
  /** Whether voice recording is supported (mic permission may still be denied). */
  isVoiceAvailable(): Promise<boolean>;
}

export interface SaveBlobOptions {
  /** Logical bucket: "photos" | "voice" | "pdf" | etc. Default "blobs". */
  bucket?: string;
  /** Mime hint when known. */
  mime?: string;
}

export interface StorageProvider {
  /** Persist a blob and return a `local://...` URI usable later by `getBlob`. */
  saveBlob(bytes: Blob | ArrayBuffer | Uint8Array, opts?: SaveBlobOptions): Promise<string>;
  getBlob(uri: string): Promise<Blob | undefined>;
  deleteBlob(uri: string): Promise<void>;
  /** Total bytes stored, best-effort. Used by Settings to show storage usage. */
  estimateSize?(): Promise<number>;
}

export type ShareChannel = "whatsapp" | "email" | "drive" | "system";

export interface SharePDFOptions {
  /** Subject/title of the share sheet. */
  title?: string;
  /** Pre-populated message body when the channel supports it. */
  message?: string;
  /** Pre-fill recipient (e.g., WhatsApp phone number, email address). */
  to?: string;
  /** Channel hint. The system sheet is opened for "system". */
  channel?: ShareChannel;
}

export interface ShareProvider {
  sharePDF(uri: string, opts?: SharePDFOptions): Promise<{ shared: boolean }>;
  /** Used internally to find out which channels the host supports. */
  supportedChannels(): Promise<ShareChannel[]>;
}

export interface GeoPosition {
  lat: number;
  lon: number;
  accuracy_m: number;
  timestamp: number;
}

export interface GeoProvider {
  getPosition(timeoutMs?: number): Promise<GeoPosition | undefined>;
  isAvailable(): Promise<boolean>;
}

export interface SpeechTranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
}

export interface SpeechListenOptions {
  /** BCP-47 language tag, default "es-UY". */
  language?: string;
  /** Hard timeout for the listen session, ms. Default 12_000. */
  max_duration_ms?: number;
  /** When the platform emits incremental partials, the host can preview them. */
  onpartial?: (text: string) => void;
}

export interface SpeechProvider {
  /** Transcribe a previously-recorded audio URI. Empty result if not supported. */
  transcribe(audioUri: string, language?: string): Promise<SpeechTranscriptionResult>;
  /**
   * Live STT — opens the mic, accumulates a transcript, returns when the
   * speaker stops or `max_duration_ms` elapses. Optional method (callers
   * must check `isAvailable()` first).
   */
  listen?(opts?: SpeechListenOptions): Promise<SpeechTranscriptionResult>;
  isAvailable(): Promise<boolean>;
}

export interface ProviderBundle {
  media: MediaProvider;
  storage: StorageProvider;
  share: ShareProvider;
  geo: GeoProvider;
  speech: SpeechProvider;
}
