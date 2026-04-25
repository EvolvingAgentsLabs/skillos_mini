<script lang="ts">
  /**
   * TradeChip — shows the active cartridge's emoji + name in a brand-colored
   * pill. Visible in the app header so the user always knows which cartridge
   * is driving the shell. Tap to switch (when supported by the host).
   *
   * CLAUDE.md §5.6 cross-cutting trade chip.
   *
   * Render-empty when no cartridge is active — leaves zero footprint in
   * "library" mode.
   */
  import type { CartridgeManifest } from "$lib/cartridge/types";

  interface Props {
    manifest: CartridgeManifest | null;
    onclick?: () => void;
  }

  let { manifest, onclick }: Props = $props();

  const ui = $derived(manifest?.ui ?? null);
  const brand = $derived(ui?.brand_color ?? "#374151");
  const emoji = $derived(ui?.emoji ?? "🧩");
  const label = $derived(manifest ? prettyName(manifest.name) : "");

  function prettyName(name: string): string {
    // trade-electricista → Electricista; legacy names render as-is.
    return name.replace(/^trade-/, "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
</script>

{#if manifest}
  <button
    type="button"
    class="chip"
    style="--brand: {brand}"
    onclick={onclick}
    aria-label="Cambiar oficio"
  >
    <span class="emoji" aria-hidden="true">{emoji}</span>
    <span class="label">{label}</span>
  </button>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--brand);
    color: #fff;
    border: 0;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }
  .emoji {
    font-size: 14px;
    line-height: 1;
  }
  .label {
    letter-spacing: 0.02em;
  }
</style>
