<script lang="ts">
  /**
   * PhotoCapture — single-tap photo capture surface for the trade-app
   * Capture screen (CLAUDE.md §5.2 + §7.2).
   *
   * The component goes through `getProviders()` so it is platform-agnostic
   * (Capacitor on Android, Web in browser, Mock in tests). It NEVER imports
   * @capacitor/* directly — that would violate §4.3.
   *
   * Visual design: large shutter, role chip, side controls. No form pops up
   * after capture — annotations happen later on the Job screen. The trade
   * preference (Daniel's interview): "no me hagas tipear delante del cliente."
   */
  import { onMount } from "svelte";
  import { getProviders } from "$lib/providers";
  import type {
    MediaProvider,
    PhotoRef,
    PhotoRole,
  } from "$lib/providers/types";

  interface Props {
    /** Auto-applied role for the next capture. Caller can change between captures. */
    role?: PhotoRole;
    /** Brand color from active cartridge (CLAUDE.md §4.1 ui.brand_color). */
    brand_color?: string;
    /** Include geolocation in the returned PhotoRef. Default false. */
    with_geo?: boolean;
    /** Called once per successful capture with the resolved PhotoRef. */
    oncapture?: (ref: PhotoRef) => void;
    /** Called when the user dismisses the capture surface. */
    oncancel?: () => void;
  }

  let {
    role = $bindable("detail"),
    brand_color = "#2563EB",
    with_geo = false,
    oncapture,
    oncancel,
  }: Props = $props();

  let media = $state<MediaProvider | null>(null);
  let cameraAvailable = $state<boolean | null>(null);
  let busy = $state(false);
  let lastError = $state<string | null>(null);
  let capturedCount = $state(0);

  const ROLES: PhotoRole[] = ["before", "during", "after", "detail"];

  onMount(async () => {
    try {
      const p = await getProviders();
      media = p.media;
      cameraAvailable = await p.media.isCameraAvailable();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  });

  async function capture(): Promise<void> {
    if (!media || busy) return;
    busy = true;
    lastError = null;
    try {
      const ref = await media.capturePhoto({ role, with_geo });
      capturedCount += 1;
      oncapture?.(ref);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function selectRole(r: PhotoRole): void {
    role = r;
  }

  function cancel(): void {
    oncancel?.();
  }
</script>

<div class="capture" style="--brand: {brand_color}">
  <div class="topbar">
    <button class="ghost" onclick={cancel} aria-label="Cancelar">
      ✕
    </button>
    <div class="roles" role="tablist" aria-label="Momento de la captura">
      {#each ROLES as r}
        <button
          role="tab"
          aria-selected={role === r}
          class="chip"
          class:active={role === r}
          onclick={() => selectRole(r)}
        >
          {labelForRole(r)}
        </button>
      {/each}
    </div>
    <div class="counter" aria-live="polite">{capturedCount}</div>
  </div>

  <div class="viewport">
    {#if cameraAvailable === false}
      <div class="placeholder">
        <p>Cámara no disponible.</p>
        <p class="muted">El dispositivo no expone cámara, o se denegó el permiso.</p>
      </div>
    {:else if media === null}
      <div class="placeholder muted">Inicializando…</div>
    {:else}
      <div class="placeholder muted">
        Tap el botón para sacar la foto. La cámara nativa se abre y vuelve acá.
      </div>
    {/if}

    {#if lastError}
      <p class="error" role="alert">{lastError}</p>
    {/if}
  </div>

  <div class="bottombar">
    <button
      class="shutter"
      disabled={busy || media === null || cameraAvailable === false}
      onclick={capture}
      aria-label="Sacar foto"
    >
      {busy ? "…" : "📷"}
    </button>
  </div>
</div>

<style>
  .capture {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #000;
    color: #fff;
    user-select: none;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.7);
  }
  .ghost {
    background: transparent;
    border: 0;
    color: #fff;
    font-size: 18px;
    padding: 8px 12px;
    cursor: pointer;
  }
  .roles {
    flex: 1;
    display: flex;
    gap: 6px;
    overflow-x: auto;
  }
  .chip {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    border: 0;
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip.active {
    background: var(--brand);
    color: #fff;
  }
  .counter {
    min-width: 28px;
    text-align: right;
    font-feature-settings: "tnum";
    color: #fff;
    opacity: 0.8;
  }
  .viewport {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
    text-align: center;
  }
  .placeholder {
    max-width: 280px;
    line-height: 1.4;
  }
  .muted {
    opacity: 0.7;
  }
  .error {
    margin-top: 12px;
    color: #fca5a5;
    font-size: 13px;
  }
  .bottombar {
    padding: 16px;
    display: flex;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
  }
  .shutter {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: 4px solid #fff;
    background: var(--brand);
    color: #fff;
    font-size: 28px;
    cursor: pointer;
  }
  .shutter:disabled {
    opacity: 0.5;
    cursor: progress;
  }
</style>

<script lang="ts" module>
  import type { PhotoRole as PhotoRoleM } from "$lib/providers/types";
  function labelForRole(r: PhotoRoleM): string {
    switch (r) {
      case "before":
        return "Antes";
      case "during":
        return "Durante";
      case "after":
        return "Después";
      case "detail":
        return "Detalle";
    }
  }
</script>
