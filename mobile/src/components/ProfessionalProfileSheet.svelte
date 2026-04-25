<script lang="ts">
  /**
   * ProfessionalProfileSheet — capture form for the trade's identity (name,
   * business name, matriculation, phone, RUT, optional logo). Used on first
   * trade flow and from Settings later.
   *
   * Designed for fast first-use: required fields are minimal (name OR
   * business_name + phone), everything else is optional. Logo capture goes
   * through MediaProvider — same pipeline as photos.
   *
   * CLAUDE.md §14 Q3 / §7.8 onboarding.
   */
  import { onMount } from "svelte";
  import { getProviders } from "$lib/providers";
  import type { ProviderBundle } from "$lib/providers/types";
  import {
    isProfileComplete,
    loadProfessionalProfile,
    professionalProfile,
    saveProfessionalProfile,
    type ProfessionalProfile,
  } from "$lib/state/professional_profile.svelte";

  interface Props {
    open: boolean;
    /** When true, the sheet cannot be dismissed without completing required fields. */
    require_complete?: boolean;
    onclose: (saved: boolean) => void;
    /** Optional brand color to theme the primary action — comes from active cartridge.ui. */
    brand_color?: string;
  }

  let { open, require_complete = false, onclose, brand_color = "#2563EB" }: Props = $props();

  const store = professionalProfile();
  let providers = $state<ProviderBundle | null>(null);

  let name = $state("");
  let business_name = $state("");
  let matriculation_id = $state("");
  let matriculated = $state(false);
  let phone = $state("");
  let rut = $state("");
  let logo_uri = $state<string | undefined>(undefined);
  let logoPreviewUrl = $state<string | null>(null);

  let busy = $state(false);
  let lastError = $state<string | null>(null);

  onMount(async () => {
    await loadProfessionalProfile();
    providers = await getProviders();
    if (store.profile) {
      hydrateForm(store.profile);
    }
  });

  $effect(() => {
    if (open && store.loaded && store.profile) {
      hydrateForm(store.profile);
    }
  });

  function hydrateForm(p: ProfessionalProfile): void {
    name = p.name ?? "";
    business_name = p.business_name ?? "";
    matriculation_id = p.matriculation_id ?? "";
    matriculated = Boolean(p.matriculated);
    phone = p.phone ?? "";
    rut = p.rut ?? "";
    logo_uri = p.logo_uri;
    void refreshLogoPreview();
  }

  async function refreshLogoPreview(): Promise<void> {
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
      logoPreviewUrl = null;
    }
    if (!logo_uri || !providers) return;
    const blob = await providers.storage.getBlob(logo_uri);
    if (blob) logoPreviewUrl = URL.createObjectURL(blob);
  }

  async function pickLogo(): Promise<void> {
    if (!providers) providers = await getProviders();
    busy = true;
    lastError = null;
    try {
      const ref = await providers.media.capturePhoto({ role: "detail", max_dim: 512, quality: 92 });
      logo_uri = ref.uri;
      await refreshLogoPreview();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function clearLogo(): void {
    logo_uri = undefined;
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
      logoPreviewUrl = null;
    }
  }

  const draft = $derived<ProfessionalProfile>({
    name,
    business_name,
    matriculation_id,
    matriculated,
    phone,
    rut,
    logo_uri,
  });

  const complete = $derived(isProfileComplete(draft));

  async function save(): Promise<void> {
    if (!complete) {
      lastError = "Completá nombre/empresa y teléfono antes de continuar.";
      return;
    }
    busy = true;
    lastError = null;
    try {
      await saveProfessionalProfile(draft);
      onclose(true);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function cancel(): void {
    if (require_complete && !isProfileComplete(store.profile)) {
      // Block dismissal — first-time onboarding requires completion.
      lastError = "Completá los datos básicos para poder generar reportes.";
      return;
    }
    onclose(false);
  }
</script>

{#if open}
  <button
    type="button"
    class="backdrop"
    onclick={cancel}
    aria-label="Cerrar"
  ></button>
  <section class="sheet" role="dialog" aria-modal="true" style="--brand: {brand_color}">
    <header class="head">
      <h2>Tus datos</h2>
      <p class="muted">
        Aparecen en el pie del PDF que mandás al cliente. Podés editarlos cuando quieras.
      </p>
    </header>

    <div class="body">
      <label>
        <span>Nombre</span>
        <input bind:value={name} placeholder="Tu nombre" autocomplete="name" />
      </label>
      <label>
        <span>Empresa o marca</span>
        <input bind:value={business_name} placeholder="Daniel R. Electricidad" />
      </label>
      <label class="row">
        <input type="checkbox" bind:checked={matriculated} />
        <span>Profesional matriculado</span>
      </label>
      {#if matriculated}
        <label>
          <span>Número de matrícula</span>
          <input bind:value={matriculation_id} placeholder="UTE-12345 / IMM-…" />
        </label>
      {/if}
      <label>
        <span>Teléfono / WhatsApp</span>
        <input bind:value={phone} placeholder="+598 99 999 999" inputmode="tel" autocomplete="tel" />
      </label>
      <label>
        <span>RUT (opcional)</span>
        <input bind:value={rut} placeholder="21 1111111 0019" inputmode="numeric" />
      </label>

      <div class="logo-block">
        <span class="logo-label">Logo (opcional)</span>
        {#if logoPreviewUrl}
          <div class="logo-preview">
            <img src={logoPreviewUrl} alt="Logo" />
          </div>
          <div class="logo-actions">
            <button type="button" class="ghost" onclick={pickLogo} disabled={busy}>Cambiar</button>
            <button type="button" class="ghost" onclick={clearLogo}>Quitar</button>
          </div>
        {:else}
          <button type="button" class="logo-add" onclick={pickLogo} disabled={busy}>
            + Agregar logo
          </button>
        {/if}
      </div>

      {#if lastError}
        <p class="error" role="alert">{lastError}</p>
      {/if}
    </div>

    <footer class="bar">
      {#if !require_complete}
        <button class="ghost" onclick={cancel}>Cancelar</button>
      {/if}
      <button class="primary" disabled={busy || !complete} onclick={save}>
        {busy ? "Guardando…" : "Guardar"}
      </button>
    </footer>
  </section>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    border: 0;
    padding: 0;
    cursor: pointer;
    z-index: 40;
  }
  .sheet {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(94vw, 460px);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    background: var(--bg, #fff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 16px;
    z-index: 41;
    overflow: hidden;
  }
  .head {
    padding: 16px 18px 8px;
    border-bottom: 1px solid var(--border, #e5e7eb);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 18px;
    font-weight: 700;
    color: var(--brand);
  }
  .muted {
    margin: 0;
    color: var(--fg-dim, #6b7280);
    font-size: 13px;
  }
  .body {
    flex: 1;
    overflow: auto;
    padding: 12px 18px;
  }
  label {
    display: block;
    margin-bottom: 12px;
  }
  label > span {
    display: block;
    font-size: 12px;
    color: var(--fg-dim, #6b7280);
    margin-bottom: 4px;
  }
  label.row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  label.row > span {
    margin: 0;
    color: inherit;
    font-size: 14px;
  }
  input:not([type="checkbox"]) {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    font: inherit;
    box-sizing: border-box;
  }
  .logo-block {
    margin-top: 4px;
  }
  .logo-label {
    display: block;
    font-size: 12px;
    color: var(--fg-dim, #6b7280);
    margin-bottom: 6px;
  }
  .logo-preview {
    border: 1px dashed var(--border, #e5e7eb);
    border-radius: 8px;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-2, #f9fafb);
  }
  .logo-preview img {
    max-width: 100%;
    max-height: 96px;
  }
  .logo-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .logo-add {
    width: 100%;
    padding: 12px;
    border: 1px dashed var(--border, #e5e7eb);
    border-radius: 8px;
    background: transparent;
    color: var(--fg-dim, #6b7280);
    cursor: pointer;
    font: inherit;
  }
  .error {
    color: #b91c1c;
    margin-top: 8px;
    font-size: 13px;
  }
  .bar {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--border, #e5e7eb);
    background: var(--bg-2, #f9fafb);
  }
  .ghost {
    background: transparent;
    border: 1px solid var(--border, #e5e7eb);
    color: var(--fg, #111);
    padding: 8px 14px;
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
  }
  .primary {
    background: var(--brand);
    color: #fff;
    border: 0;
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    font: inherit;
  }
  .primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
