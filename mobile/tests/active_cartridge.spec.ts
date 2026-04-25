/**
 * active_cartridge store tests. Verifies persistence + round-trip via
 * IndexedDB meta, and that clearing returns the store to default state.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { _resetDBForTests, putFile } from "../src/lib/storage/db";
import {
  activeCartridge,
  loadActiveCartridge,
  setActiveCartridge,
  _resetActiveCartridgeForTests,
} from "../src/lib/state/active_cartridge.svelte";

const ELECTRICISTA_YAML = `
name: trade-electricista
description: x
entry_intents: []
flows:
  intervention: [vision-diagnoser]
default_flow: intervention
blackboard_schema: {}
validators: []
ui:
  brand_color: "#2563EB"
  emoji: "⚡"
  primary_action: { label: "Nuevo trabajo", flow: intervention }
`;

const PLOMERO_YAML = `
name: trade-plomero
description: x
entry_intents: []
flows:
  urgencia: [vision-diagnoser]
default_flow: urgencia
blackboard_schema: {}
validators: []
ui:
  brand_color: "#0EA5E9"
  emoji: "🔧"
`;

describe("active_cartridge store", () => {
  beforeEach(async () => {
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
    _resetDBForTests();
    _resetActiveCartridgeForTests();
    await putFile("cartridges/trade-electricista/cartridge.yaml", ELECTRICISTA_YAML);
    await putFile("cartridges/trade-plomero/cartridge.yaml", PLOMERO_YAML);
  });

  afterEach(() => {
    _resetActiveCartridgeForTests();
  });

  it("loads with no active cartridge by default", async () => {
    await loadActiveCartridge();
    const s = activeCartridge();
    expect(s.loaded).toBe(true);
    expect(s.name).toBeNull();
    expect(s.manifest).toBeNull();
  });

  it("setActiveCartridge persists and surfaces the manifest", async () => {
    await loadActiveCartridge();
    await setActiveCartridge("trade-electricista");
    const s = activeCartridge();
    expect(s.name).toBe("trade-electricista");
    expect(s.manifest?.ui?.brand_color).toBe("#2563EB");
  });

  it("survives a reload cycle", async () => {
    await loadActiveCartridge();
    await setActiveCartridge("trade-plomero");

    _resetActiveCartridgeForTests();
    await loadActiveCartridge();
    const s = activeCartridge();
    expect(s.name).toBe("trade-plomero");
    expect(s.manifest?.ui?.emoji).toBe("🔧");
  });

  it("clears with setActiveCartridge(null)", async () => {
    await loadActiveCartridge();
    await setActiveCartridge("trade-electricista");
    await setActiveCartridge(null);
    const s = activeCartridge();
    expect(s.name).toBeNull();
    expect(s.manifest).toBeNull();
  });

  it("throws on unknown cartridge name", async () => {
    await loadActiveCartridge();
    await expect(setActiveCartridge("trade-nonexistent")).rejects.toThrow(/unknown cartridge/);
  });

  it("self-heals stale meta when the cartridge no longer exists", async () => {
    await loadActiveCartridge();
    await setActiveCartridge("trade-electricista");

    // Simulate the cartridge being deleted between sessions.
    const { deleteFile } = await import("../src/lib/storage/db");
    await deleteFile("cartridges/trade-electricista/cartridge.yaml");

    _resetActiveCartridgeForTests();
    await loadActiveCartridge();
    const s = activeCartridge();
    expect(s.name).toBeNull();
  });
});
