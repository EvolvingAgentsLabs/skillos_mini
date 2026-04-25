/**
 * Active cartridge — Svelte 5 rune store. Tracks which cartridge is
 * currently driving the trade-shell (home screen colors/labels, capture
 * defaults, etc.).
 *
 * Persisted to IndexedDB `meta` so it survives app restarts. CLAUDE.md §4.1:
 * "the shell consults the cartridge for labels/colors/flows" — this is
 * the shell-side of that contract.
 *
 * Setting the active cartridge to `null` returns the home screen to its
 * default "Recipe library" mode (browse all cartridges, no trade
 * specialization).
 */

import { getMeta, setMeta } from "../storage/db";
import { CartridgeRegistry } from "../cartridge/registry";
import type { CartridgeManifest } from "../cartridge/types";

const META_KEY = "active_cartridge";

interface ActiveCartridgeStore {
  loaded: boolean;
  name: string | null;
  manifest: CartridgeManifest | null;
}

const store = $state<ActiveCartridgeStore>({
  loaded: false,
  name: null,
  manifest: null,
});

export function activeCartridge(): ActiveCartridgeStore {
  return store;
}

let registry: CartridgeRegistry | null = null;

async function getRegistry(): Promise<CartridgeRegistry> {
  if (registry) return registry;
  const r = new CartridgeRegistry();
  await r.init();
  registry = r;
  return r;
}

export async function loadActiveCartridge(): Promise<void> {
  const reg = await getRegistry();
  const stored = await getMeta<string>(META_KEY);
  if (stored) {
    const m = reg.get(stored);
    if (m) {
      store.name = stored;
      store.manifest = m;
    } else {
      // Stale meta — cartridge no longer present. Clear silently.
      store.name = null;
      store.manifest = null;
      await setMeta(META_KEY, "");
    }
  } else {
    store.name = null;
    store.manifest = null;
  }
  store.loaded = true;
}

export async function setActiveCartridge(name: string | null): Promise<void> {
  if (name === null) {
    store.name = null;
    store.manifest = null;
    await setMeta(META_KEY, "");
    return;
  }
  const reg = await getRegistry();
  const m = reg.get(name);
  if (!m) {
    throw new Error(`unknown cartridge: ${name}`);
  }
  store.name = name;
  store.manifest = m;
  await setMeta(META_KEY, name);
}

/**
 * Force a fresh manifest read (e.g., after the user edits cartridge.yaml
 * in the in-app editor and the registry was reloaded).
 */
export async function refreshActiveCartridge(): Promise<void> {
  if (!store.name) return;
  const reg = await getRegistry();
  await reg.reloadCartridge(store.name);
  const m = reg.get(store.name);
  store.manifest = m ?? null;
}

/**
 * Test helper — drop the registry singleton so tests can rebuild from a
 * fresh fake-IndexedDB.
 */
export function _resetActiveCartridgeForTests(): void {
  registry = null;
  store.loaded = false;
  store.name = null;
  store.manifest = null;
}
