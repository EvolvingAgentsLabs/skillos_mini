/**
 * Provider entrypoint — auto-selects Capacitor on native, Web in browser.
 * Tests should import from `./mock` directly and bypass this resolver.
 *
 * Per CLAUDE.md §4.3: shell and runtime code MUST go through ProviderBundle.
 * Direct Capacitor / Web API imports outside this folder are a guardrail
 * violation (§12).
 */

import { Capacitor } from "@capacitor/core";
import type { ProviderBundle } from "./types";
import { makeWebProviders } from "./web";

export type * from "./types";
export { makeMockProviders } from "./mock";
export { makeWebProviders } from "./web";

let cached: ProviderBundle | null = null;

export async function getProviders(): Promise<ProviderBundle> {
  if (cached) return cached;
  if (Capacitor.isNativePlatform()) {
    const { makeCapacitorProviders } = await import("./capacitor");
    cached = makeCapacitorProviders();
  } else {
    cached = makeWebProviders();
  }
  return cached;
}

/** For tests + edge cases that need to swap the bundle. */
export function setProviders(bundle: ProviderBundle): void {
  cached = bundle;
}

export function resetProviders(): void {
  cached = null;
}
