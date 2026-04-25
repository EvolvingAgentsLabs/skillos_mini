<script lang="ts">
  /**
   * TradeBanner — primary CTA for the active cartridge.
   *
   * Reads `manifest.ui.primary_action` and `secondary_actions`, emits the
   * chosen flow back to the host. Lives at the top of HomeScreen when a
   * cartridge is active (CLAUDE.md §5.1).
   *
   * Render-empty when no cartridge or no `ui:` block — additive, no
   * regression for legacy cartridges.
   */
  import type { CartridgeManifest, CartridgeUIAction } from "$lib/cartridge/types";

  interface Props {
    manifest: CartridgeManifest | null;
    onaction?: (a: CartridgeUIAction) => void;
    onswitch?: () => void;
  }

  let { manifest, onaction, onswitch }: Props = $props();

  const ui = $derived(manifest?.ui ?? null);
  const brand = $derived(ui?.brand_color ?? "#374151");
  const accent = $derived(ui?.accent_color ?? brand);
  const emoji = $derived(ui?.emoji ?? "🧩");
  const primary = $derived(ui?.primary_action ?? null);
  const secondary = $derived(ui?.secondary_actions ?? []);
  const tradeLabel = $derived(manifest ? prettyName(manifest.name) : "");

  function prettyName(name: string): string {
    return name.replace(/^trade-/, "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
</script>

{#if manifest && (primary || secondary.length > 0)}
  <section class="banner" style="--brand: {brand}; --accent: {accent}">
    <header class="head">
      <div class="title">
        <span class="emoji">{emoji}</span>
        <span>{tradeLabel}</span>
      </div>
      <button class="ghost" type="button" onclick={onswitch} aria-label="Cambiar oficio">
        Cambiar
      </button>
    </header>
    {#if primary}
      <button class="primary" type="button" onclick={() => onaction?.(primary)}>
        {primary.label}
      </button>
    {/if}
    {#if secondary.length > 0}
      <div class="secondary-row">
        {#each secondary as a (a.flow)}
          <button class="secondary" type="button" onclick={() => onaction?.(a)}>
            {a.label}
          </button>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .banner {
    margin: 12px 16px 16px;
    padding: 16px;
    background: var(--brand);
    color: #fff;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 16px;
    letter-spacing: 0.01em;
  }
  .emoji {
    font-size: 18px;
  }
  .ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: #fff;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    cursor: pointer;
  }
  .primary {
    width: 100%;
    padding: 14px;
    background: #fff;
    color: var(--brand);
    border: 0;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
  }
  .secondary-row {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .secondary {
    flex: 1 1 auto;
    background: var(--accent);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 14px;
    cursor: pointer;
    min-width: 120px;
  }
</style>
