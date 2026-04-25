<script lang="ts">
  import { exportToFiles, importFromFiles, isFileSyncAvailable } from "$lib/storage/file_sync";
  import { seedIfNeeded } from "$lib/storage/seed";
  import { fileCount, getMeta, listFiles, setMeta } from "$lib/storage/db";
  import { listExperiences } from "$lib/memory/smart_memory";
  import {
    activeCartridge,
    loadActiveCartridge,
    setActiveCartridge,
  } from "$lib/state/active_cartridge.svelte";
  import {
    loadProfessionalProfile,
    professionalProfile,
  } from "$lib/state/professional_profile.svelte";
  import { CartridgeRegistry } from "$lib/cartridge/registry";
  import type { CartridgeManifest } from "$lib/cartridge/types";
  import EvalsScreen from "$components/EvalsScreen.svelte";
  import ModelManagerSheet from "$components/ModelManagerSheet.svelte";
  import ProfessionalProfileSheet from "$components/ProfessionalProfileSheet.svelte";
  import { onMount } from "svelte";

  interface Props {
    oncancel: () => void;
  }

  let { oncancel }: Props = $props();
  let evalsOpen = $state(false);
  let modelsOpen = $state(false);
  let profileOpen = $state(false);
  let onDeviceFlag = $state(false);
  let authoringFlag = $state(false);

  let fileTotal = $state(0);
  let projectCount = $state(0);
  let cartridgeCount = $state(0);
  let experienceCount = $state(0);
  let status = $state("");
  let busy = $state(false);
  const native = isFileSyncAvailable();

  // Trade-shell sections.
  const active = activeCartridge();
  const profileStore = professionalProfile();
  let tradeCartridges = $state<CartridgeManifest[]>([]);

  onMount(async () => {
    fileTotal = await fileCount();
    const cartridgePaths = await listFiles("cartridges/");
    cartridgeCount = new Set(cartridgePaths.map((p) => p.split("/")[1]).filter(Boolean)).size;
    const projectPaths = await listFiles("projects/");
    projectCount = new Set(projectPaths.map((p) => p.split("/")[1]).filter(Boolean)).size;
    experienceCount = (await listExperiences()).length;
    onDeviceFlag = Boolean(await getMeta("experimental_on_device_llm"));
    authoringFlag = Boolean(await getMeta("authoring_mode"));

    // Trade-shell hydration — non-blocking; the dev sections render either way.
    await Promise.all([loadActiveCartridge(), loadProfessionalProfile()]);
    const reg = new CartridgeRegistry();
    await reg.init();
    // A "trade" cartridge is one that declares a `ui:` block (CLAUDE.md §4.1).
    tradeCartridges = reg.list().filter((m) => Boolean(m.ui));
  });

  async function pickCartridge(name: string | null): Promise<void> {
    await setActiveCartridge(name);
  }

  function profileSummary(): string {
    const p = profileStore.profile;
    if (!p) return "Sin completar";
    const ident = p.business_name || p.name;
    if (!ident) return "Sin completar";
    const parts: string[] = [ident];
    if (p.matriculated && p.matriculation_id) parts.push(`Mat. ${p.matriculation_id}`);
    if (p.phone) parts.push(p.phone);
    return parts.join(" · ");
  }

  function prettyTradeName(name: string): string {
    return name.replace(/^trade-/, "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  }

  async function toggleOnDevice(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).checked;
    onDeviceFlag = v;
    await setMeta("experimental_on_device_llm", v);
  }

  async function toggleAuthoring(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).checked;
    authoringFlag = v;
    await setMeta("authoring_mode", v);
  }

  async function onResync() {
    busy = true;
    status = "resyncing seed…";
    try {
      const res = await seedIfNeeded(() => {}, { force: true });
      status = res.message ?? `done (${res.completed})`;
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function onExport() {
    busy = true;
    status = "exporting to Documents/SkillOS…";
    try {
      const res = await exportToFiles();
      status = `exported ${res.files} files → ${res.path}`;
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function onImport() {
    busy = true;
    status = "importing from Documents/SkillOS…";
    try {
      const res = await importFromFiles();
      status = `imported ${res.files} files`;
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<button type="button" class="backdrop" onclick={oncancel} aria-label="Close"></button>
<section class="sheet">
  <div class="handle"></div>
  <h2>Settings</h2>

  {#if tradeCartridges.length > 0}
    <h3 class="section-title">Tu perfil</h3>
    <div class="trade-card">
      <div class="trade-row">
        <div>
          <div class="trade-line">{profileSummary()}</div>
          <div class="hint">Aparece en el pie del PDF que mandás al cliente.</div>
        </div>
        <button onclick={() => (profileOpen = true)}>Editar</button>
      </div>
    </div>

    <h3 class="section-title">Oficio activo</h3>
    <div class="trade-card">
      <ul class="trade-list">
        <li>
          <button
            class="trade-pick"
            class:active={active.name === null}
            onclick={() => pickCartridge(null)}
          >
            <span class="trade-emoji">📋</span>
            <span class="trade-name">Sin oficio (modo recetas)</span>
          </button>
        </li>
        {#each tradeCartridges as m (m.name)}
          <li>
            <button
              class="trade-pick"
              class:active={active.name === m.name}
              style:--brand={m.ui?.brand_color ?? "#374151"}
              onclick={() => pickCartridge(m.name)}
            >
              <span class="trade-emoji">{m.ui?.emoji ?? "🧩"}</span>
              <span class="trade-name">{prettyTradeName(m.name)}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <h3 class="section-title">Stats</h3>
  <div class="stats">
    <div><strong>{fileTotal}</strong> files seeded</div>
    <div><strong>{cartridgeCount}</strong> cartridges</div>
    <div><strong>{projectCount}</strong> seeded projects</div>
    <div><strong>{experienceCount}</strong> SmartMemory entries</div>
  </div>

  <div class="row">
    <button onclick={onResync} disabled={busy}>Resync from bundle</button>
    <div class="hint">Reloads the seeded cartridges + example project from the app bundle.</div>
  </div>

  <div class="row" class:disabled={!native}>
    <button onclick={onExport} disabled={busy || !native}>Export to Files…</button>
    <div class="hint">
      Writes every IndexedDB file to <code>Documents/SkillOS/</code> so the desktop
      Python runner can pick them up.
      {#if !native}<br /><em>Requires the installed native app.</em>{/if}
    </div>
  </div>

  <div class="row" class:disabled={!native}>
    <button onclick={onImport} disabled={busy || !native}>Import from Files…</button>
    <div class="hint">
      Walks <code>Documents/SkillOS/</code> and re-loads markdown/yaml into IndexedDB.
      {#if !native}<br /><em>Requires the installed native app.</em>{/if}
    </div>
  </div>

  {#if status}
    <div class="status">{status}</div>
  {/if}

  <div class="row">
    <button onclick={() => (evalsOpen = true)}>Run cartridge evals…</button>
    <div class="hint">
      Execute every cartridge's <code>evals/cases.yaml</code> against your configured
      provider and report pass rates.
    </div>
  </div>

  <h3 class="section-title">Experimental</h3>

  <label class="toggle-row">
    <input type="checkbox" checked={onDeviceFlag} onchange={toggleOnDevice} />
    <div>
      <div class="toggle-label">On-device LLM providers</div>
      <div class="hint">
        Exposes wllama (WASM) + LiteRT (Android) in the Provider picker. Download a model to use them.
      </div>
    </div>
  </label>

  {#if onDeviceFlag}
    <div class="row">
      <button onclick={() => (modelsOpen = true)}>Manage on-device models…</button>
      <div class="hint">Download, delete, and check storage for local Gemma / Qwen builds.</div>
    </div>
  {/if}

  <label class="toggle-row">
    <input type="checkbox" checked={authoringFlag} onchange={toggleAuthoring} />
    <div>
      <div class="toggle-label">Authoring mode</div>
      <div class="hint">
        Unlocks the Library tab (M12) and cartridge / skill editors (M13+). Off in v1 until editors ship.
      </div>
    </div>
  </label>

  <div class="actions">
    <button class="ghost" onclick={oncancel}>Close</button>
  </div>
</section>

{#if evalsOpen}
  <EvalsScreen oncancel={() => (evalsOpen = false)} />
{/if}

{#if modelsOpen}
  <ModelManagerSheet oncancel={() => (modelsOpen = false)} />
{/if}

{#if profileOpen}
  <ProfessionalProfileSheet
    open={profileOpen}
    require_complete={false}
    onclose={() => (profileOpen = false)}
  />
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 10;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-2);
    border-top: 1px solid var(--border);
    border-radius: 14px 14px 0 0;
    padding: 0.7rem 1.1rem 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    z-index: 11;
    padding-bottom: calc(1.3rem + env(safe-area-inset-bottom));
    max-height: 88vh;
    overflow-y: auto;
  }
  .handle {
    width: 36px;
    height: 4px;
    background: var(--bg-3);
    border-radius: 2px;
    align-self: center;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 500;
  }
  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.2rem 0.8rem;
    padding: 0.55rem 0.75rem;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.85rem;
    color: var(--fg-dim);
  }
  .stats strong {
    color: var(--fg);
    font-variant-numeric: tabular-nums;
    margin-right: 0.25rem;
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .row button {
    align-self: flex-start;
    font-size: 0.85rem;
  }
  .row.disabled button {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .hint {
    color: var(--fg-dim);
    font-size: 0.78rem;
  }
  code {
    background: var(--bg-3);
    padding: 0.05rem 0.3rem;
    border-radius: 4px;
  }
  .status {
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.55rem 0.7rem;
    font-size: 0.82rem;
    color: var(--fg);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  .ghost {
    background: transparent;
  }
  .section-title {
    margin: 0.5rem 0 0;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--fg-dim);
  }
  .toggle-row {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-3);
    cursor: pointer;
  }
  .toggle-row input {
    margin-top: 0.2rem;
    transform: scale(1.1);
    accent-color: var(--accent);
  }
  .toggle-label {
    font-size: 0.9rem;
    color: var(--fg);
  }

  /* Trade-shell sections */
  .trade-card {
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.55rem 0.7rem;
    font-size: 0.85rem;
  }
  .trade-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .trade-row > div {
    min-width: 0;
    flex: 1;
  }
  .trade-line {
    color: var(--fg);
    word-break: break-word;
  }
  .trade-row button {
    flex-shrink: 0;
    font-size: 0.8rem;
  }
  .trade-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .trade-pick {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.5rem 0.65rem;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--fg);
    font: inherit;
    font-size: 0.88rem;
    cursor: pointer;
    text-align: left;
  }
  .trade-pick.active {
    border-color: var(--brand, var(--accent));
    background: color-mix(in srgb, var(--brand, var(--accent)) 12%, var(--bg-2));
  }
  .trade-emoji {
    font-size: 1.1rem;
    flex-shrink: 0;
  }
  .trade-name {
    flex: 1;
  }
</style>
