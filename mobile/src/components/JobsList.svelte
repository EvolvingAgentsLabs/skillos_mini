<script lang="ts">
  /**
   * JobsList — recent jobs for the active cartridge.
   *
   * Two modes (CLAUDE.md §5.5):
   *   - "list":      chronological cards with status. Default for
   *                  electricista/plomero.
   *   - "portfolio": grid of antes/después pairs. Default for pintor.
   *
   * Mode is read from `manifest.ui.library_default_mode`. Callers can also
   * force it via prop (e.g., a future "Switch view" toggle).
   *
   * Tapping a job emits `onresume(jobId)` — the host (HomeScreen) re-opens
   * TradeFlowSheet with that id, which rehydrates state and seeds the
   * appropriate step (capture/review/report).
   */
  import { onMount } from "svelte";
  import { getProviders } from "$lib/providers";
  import type { ProviderBundle } from "$lib/providers/types";
  import type { CartridgeManifest } from "$lib/cartridge/types";
  import { listJobsForCartridge, type JobState } from "$lib/state/job_store.svelte";

  interface Props {
    manifest: CartridgeManifest;
    /** When set, override the cartridge's library_default_mode. */
    mode_override?: "list" | "portfolio" | null;
    /** Bump this to force a refresh after a job finishes elsewhere in the app. */
    refresh_token?: number;
    onresume?: (jobId: string) => void;
  }

  let { manifest, mode_override = null, refresh_token = 0, onresume }: Props = $props();

  let jobs = $state<JobState[]>([]);
  let loaded = $state(false);
  let providers = $state<ProviderBundle | null>(null);
  // Photo URI → object URL for thumbnail rendering.
  const previews = $state<Record<string, string>>({});

  const mode = $derived<"list" | "portfolio">(
    mode_override ?? manifest.ui?.library_default_mode ?? "list",
  );

  onMount(async () => {
    providers = await getProviders();
    await refresh();
  });

  $effect(() => {
    // refresh_token change forces re-fetch.
    void refresh_token;
    if (loaded) void refresh();
  });

  $effect(() => {
    // Cartridge change → discard cached previews and re-fetch.
    void manifest.name;
    if (loaded) void refresh();
    return () => {
      // Cleanup object URLs on unmount or manifest swap.
      for (const url of Object.values(previews)) URL.revokeObjectURL(url);
      for (const k of Object.keys(previews)) delete previews[k];
    };
  });

  async function refresh(): Promise<void> {
    const list = await listJobsForCartridge(manifest.name, 24);
    jobs = list;
    loaded = true;
    void hydrateThumbnails(list);
  }

  async function hydrateThumbnails(list: JobState[]): Promise<void> {
    if (!providers) return;
    const wanted = new Set<string>();
    for (const j of list) {
      const before = j.photos.find((p) => p.role === "before");
      if (before) wanted.add(before.uri);
      const after = j.photos.find((p) => p.role === "after");
      if (after) wanted.add(after.uri);
    }
    for (const uri of wanted) {
      if (previews[uri]) continue;
      const blob = await providers.storage.getBlob(uri);
      if (blob) previews[uri] = URL.createObjectURL(blob);
    }
  }

  function thumbFor(j: JobState): string | undefined {
    const ref = j.photos.find((p) => p.role === "after") ?? j.photos[0];
    return ref ? previews[ref.uri] : undefined;
  }

  function beforeFor(j: JobState): string | undefined {
    const ref = j.photos.find((p) => p.role === "before") ?? j.photos[0];
    return ref ? previews[ref.uri] : undefined;
  }

  function afterFor(j: JobState): string | undefined {
    const ref = j.photos.find((p) => p.role === "after") ?? j.photos[j.photos.length - 1];
    return ref ? previews[ref.uri] : undefined;
  }

  function statusLabel(j: JobState): string {
    if (j.finalized) return "Compartido";
    if (j.client_report) return "Listo para compartir";
    if (j.diagnosis) return "Diagnóstico hecho";
    if (j.photos.length > 0) return "Fotos cargadas";
    return "Borrador";
  }

  function shortDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-UY", { day: "numeric", month: "short" });
    } catch {
      return iso;
    }
  }

  const brand = $derived(manifest.ui?.brand_color ?? "#374151");
</script>

{#if !loaded}
  <div class="empty muted">Cargando…</div>
{:else if jobs.length === 0}
  <div class="empty muted">Aún no hay trabajos. El primero arranca con "Nuevo trabajo".</div>
{:else if mode === "portfolio"}
  <section class="portfolio" style="--brand: {brand}">
    <header class="head">
      <h2>Portfolio ({jobs.length})</h2>
    </header>
    <div class="portfolio-grid">
      {#each jobs as j (j.id)}
        <button
          type="button"
          class="card portfolio-card"
          onclick={() => onresume?.(j.id)}
          aria-label={`Abrir trabajo ${shortDate(j.updated_at)}`}
        >
          <div class="diptych">
            <div class="diptych-half" class:has-img={beforeFor(j)}>
              {#if beforeFor(j)}
                <img src={beforeFor(j)} alt="Antes" loading="lazy" />
              {/if}
              <span class="tag">Antes</span>
            </div>
            <div class="diptych-half" class:has-img={afterFor(j)}>
              {#if afterFor(j)}
                <img src={afterFor(j)} alt="Después" loading="lazy" />
              {/if}
              <span class="tag">Después</span>
            </div>
          </div>
          <div class="card-foot">
            <span class="date">{shortDate(j.updated_at)}</span>
            <span class="status" class:finalized={j.finalized}>
              {statusLabel(j)}
            </span>
          </div>
        </button>
      {/each}
    </div>
  </section>
{:else}
  <section class="list" style="--brand: {brand}">
    <header class="head">
      <h2>Trabajos recientes ({jobs.length})</h2>
    </header>
    <ul class="rows">
      {#each jobs as j (j.id)}
        <li>
          <button
            type="button"
            class="row"
            onclick={() => onresume?.(j.id)}
            aria-label={`Abrir trabajo ${shortDate(j.updated_at)}`}
          >
            <div class="thumb">
              {#if thumbFor(j)}
                <img src={thumbFor(j)} alt="" loading="lazy" />
              {:else}
                <span class="thumb-placeholder">📷</span>
              {/if}
            </div>
            <div class="row-body">
              <div class="row-top">
                <span class="row-summary">{rowSummary(j)}</span>
                <span class="row-date">{shortDate(j.updated_at)}</span>
              </div>
              <div class="row-bottom">
                <span class="status" class:finalized={j.finalized}>{statusLabel(j)}</span>
                <span class="muted">{j.photos.length} fotos</span>
              </div>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<script lang="ts" module>
  import type { JobState as JobStateM } from "$lib/state/job_store.svelte";
  function rowSummary(j: JobStateM): string {
    return (
      j.diagnosis?.client_explanation?.slice(0, 80) ??
      j.diagnosis?.summary?.slice(0, 80) ??
      j.client_report?.summary?.slice(0, 80) ??
      "Sin diagnóstico aún"
    );
  }
</script>

<style>
  .empty {
    padding: 16px;
    text-align: center;
    font-size: 13px;
  }
  .muted {
    color: var(--fg-dim, #6b7280);
  }
  .head {
    padding: 12px 16px 6px;
  }
  .head h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--brand);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* List mode */
  .list {
    margin-bottom: 8px;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0 16px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: stretch;
    gap: 10px;
    width: 100%;
    padding: 10px;
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 12px;
    cursor: pointer;
    text-align: left;
    color: var(--fg, #111);
    font: inherit;
  }
  .row:hover {
    border-color: var(--brand);
  }
  .thumb {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    border-radius: 8px;
    background: var(--bg-3, #f3f4f6);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .thumb-placeholder {
    font-size: 22px;
    opacity: 0.4;
  }
  .row-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 4px;
  }
  .row-top {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: baseline;
  }
  .row-summary {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }
  .row-date {
    font-size: 11px;
    color: var(--fg-dim, #6b7280);
    flex-shrink: 0;
  }
  .row-bottom {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
  .status {
    color: var(--brand);
    font-weight: 600;
  }
  .status.finalized {
    color: #16a34a;
  }

  /* Portfolio mode */
  .portfolio {
    margin-bottom: 8px;
  }
  .portfolio-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
    padding: 0 16px 8px;
  }
  .portfolio-card {
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 12px;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    color: var(--fg, #111);
    font: inherit;
    text-align: left;
  }
  .portfolio-card:hover {
    border-color: var(--brand);
  }
  .diptych {
    display: grid;
    grid-template-columns: 1fr 1fr;
    aspect-ratio: 2 / 1;
  }
  .diptych-half {
    position: relative;
    background: var(--bg-3, #f3f4f6);
    overflow: hidden;
  }
  .diptych-half img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .diptych-half:not(.has-img) {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-dim, #9ca3af);
    font-size: 11px;
  }
  .tag {
    position: absolute;
    bottom: 4px;
    left: 4px;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 10px;
  }
  .card-foot {
    display: flex;
    justify-content: space-between;
    padding: 8px 10px;
    font-size: 11px;
  }
  .date {
    color: var(--fg-dim, #6b7280);
  }
</style>
