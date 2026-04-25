<script lang="ts">
  /**
   * First-launch onboarding — trade-aware.
   *
   * Replaces the original generic "Recipe library" intro with oficio-first
   * copy + a trade selection step. The user can still skip and land in
   * library mode. CLAUDE.md §7.8.
   *
   * The carousel runs once per device (gated on the `onboarding_seen` meta
   * flag). The Settings sheet has both Profile + Active Oficio surfaces so
   * users who skipped or want to switch later can do so.
   */
  import { onMount } from "svelte";
  import { getMeta, setMeta } from "$lib/storage/db";
  import { CartridgeRegistry } from "$lib/cartridge/registry";
  import type { CartridgeManifest } from "$lib/cartridge/types";
  import {
    loadActiveCartridge,
    setActiveCartridge,
  } from "$lib/state/active_cartridge.svelte";

  let open = $state(false);
  let step = $state(0);
  let tradeCartridges = $state<CartridgeManifest[]>([]);
  let chosenCartridge = $state<string | null>(null);
  let saving = $state(false);

  interface IntroPage {
    title: string;
    body: string;
    icon: string;
  }

  const pages: IntroPage[] = [
    {
      icon: "🛠",
      title: "Tu bitácora del oficio",
      body:
        "Sacá una foto del trabajo, dictá lo que ves, y la app arma un PDF profesional que mandás al cliente por WhatsApp. Sin papeles, sin perder fotos, sin tipear formularios delante del dueño de casa.",
    },
    {
      icon: "📷",
      title: "Foto · Diagnóstico · Reporte",
      body:
        "Capturá las fotos del antes y del después. La app las organiza, te ayuda a explicar el trabajo en lenguaje del cliente y deja todo guardado en el celular.",
    },
    {
      icon: "📄",
      title: "PDF al cliente, ya con tu marca",
      body:
        "Tus datos (nombre, matrícula, teléfono, logo) salen en cada reporte y presupuesto. Compartís por WhatsApp en dos taps. Sin servidores: las fotos del cliente no salen del celular hasta que vos las mandás.",
    },
  ];

  onMount(async () => {
    const seen = await getMeta<boolean>("onboarding_seen");
    if (seen) return;
    open = true;
    await loadActiveCartridge();
    const reg = new CartridgeRegistry();
    await reg.init();
    // Trade cartridges only — those with `ui:` (CLAUDE.md §4.1).
    tradeCartridges = reg.list().filter((m) => Boolean(m.ui));
  });

  async function dismiss() {
    saving = true;
    try {
      if (chosenCartridge) {
        await setActiveCartridge(chosenCartridge);
      }
      await setMeta("onboarding_seen", true);
    } finally {
      saving = false;
      open = false;
    }
  }

  async function next() {
    // Auto-extend the carousel with one extra "trade picker" page when
    // there are trade cartridges available. Otherwise the existing pages
    // are the whole show.
    const lastIntroIdx = pages.length - 1;
    const pickerIdx = lastIntroIdx + 1;
    const finalIdx = tradeCartridges.length > 0 ? pickerIdx : lastIntroIdx;

    if (step < finalIdx) {
      step += 1;
    } else {
      await dismiss();
    }
  }

  function pickTrade(name: string | null) {
    chosenCartridge = name;
  }

  function prettyTradeName(name: string): string {
    return name.replace(/^trade-/, "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  }

  const onPickerStep = $derived(
    tradeCartridges.length > 0 && step === pages.length,
  );
  const dotCount = $derived(
    tradeCartridges.length > 0 ? pages.length + 1 : pages.length,
  );
  const lastStep = $derived(step === dotCount - 1);
</script>

{#if open}
  <button
    type="button"
    class="backdrop"
    onclick={dismiss}
    aria-label="Saltar onboarding"
  ></button>
  <section class="card" role="dialog" aria-modal="true">
    <div class="dots">
      {#each Array(dotCount) as _, i (i)}
        <span class="dot" class:active={i === step}></span>
      {/each}
    </div>

    {#if onPickerStep}
      <h2>¿Cuál es tu oficio?</h2>
      <p class="muted">Elegí uno para empezar — podés cambiar o agregar otros desde Ajustes.</p>
      <ul class="trades">
        {#each tradeCartridges as m (m.name)}
          <li>
            <button
              class="trade-tile"
              class:active={chosenCartridge === m.name}
              style:--brand={m.ui?.brand_color ?? "#374151"}
              onclick={() => pickTrade(m.name)}
            >
              <span class="trade-emoji">{m.ui?.emoji ?? "🧩"}</span>
              <span class="trade-name">{prettyTradeName(m.name)}</span>
              {#if chosenCartridge === m.name}
                <span class="check">✓</span>
              {/if}
            </button>
          </li>
        {/each}
        <li>
          <button
            class="trade-tile skip"
            class:active={chosenCartridge === null && step === dotCount - 1}
            onclick={() => pickTrade(null)}
          >
            <span class="trade-emoji">📋</span>
            <span class="trade-name">Más tarde — entrar al modo recetas</span>
          </button>
        </li>
      </ul>
    {:else}
      <div class="hero">{pages[step].icon}</div>
      <h2>{pages[step].title}</h2>
      <p>{pages[step].body}</p>
    {/if}

    <div class="actions">
      {#if !lastStep}
        <button class="ghost" onclick={dismiss}>Saltar</button>
      {/if}
      <button class="primary" onclick={next} disabled={saving}>
        {#if onPickerStep}
          {chosenCartridge ? `Empezar con ${prettyTradeName(chosenCartridge)}` : "Empezar sin oficio"}
        {:else if lastStep}
          Listo
        {:else}
          Siguiente
        {/if}
      </button>
    </div>
  </section>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    z-index: 20;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .card {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(92vw, 440px);
    max-height: 92vh;
    overflow-y: auto;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 1.4rem 1.5rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    z-index: 21;
  }
  .dots {
    display: flex;
    justify-content: center;
    gap: 0.35rem;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: var(--bg-3);
    transition: background 0.15s, width 0.15s;
  }
  .dot.active {
    background: var(--accent);
    width: 18px;
  }
  .hero {
    text-align: center;
    font-size: 2.2rem;
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    text-align: center;
  }
  p {
    margin: 0;
    color: var(--fg-dim);
    line-height: 1.55;
    text-align: center;
  }
  .muted {
    color: var(--fg-dim);
    font-size: 0.85rem;
    margin-top: -0.2rem;
  }
  .trades {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .trade-tile {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.7rem 0.8rem;
    background: var(--bg-3);
    border: 1.5px solid var(--border);
    border-radius: 10px;
    color: var(--fg);
    font: inherit;
    font-size: 0.95rem;
    cursor: pointer;
    text-align: left;
  }
  .trade-tile.active {
    border-color: var(--brand, var(--accent));
    background: color-mix(in srgb, var(--brand, var(--accent)) 12%, var(--bg-3));
  }
  .trade-tile.skip {
    border-style: dashed;
    color: var(--fg-dim);
  }
  .trade-emoji {
    font-size: 1.4rem;
    flex-shrink: 0;
  }
  .trade-name {
    flex: 1;
    font-weight: 500;
  }
  .check {
    color: var(--brand, var(--accent));
    font-weight: 700;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }
  .primary {
    background: var(--accent);
    color: var(--bg);
    border: none;
    font-weight: 600;
    padding: 0.55rem 1rem;
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg-dim);
    padding: 0.45rem 0.9rem;
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
  }
</style>
