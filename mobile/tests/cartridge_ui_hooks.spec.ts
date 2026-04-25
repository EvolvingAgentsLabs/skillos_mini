/**
 * Test that the cartridge registry parses the new `ui:` and `hooks:` blocks
 * (CLAUDE.md §4.1) without breaking older cartridges that have neither.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { CartridgeRegistry } from "../src/lib/cartridge/registry";
import { _resetDBForTests, putFile } from "../src/lib/storage/db";

const ELECTRICISTA_YAML = `
name: trade-electricista
description: Test fixture
entry_intents:
  - electricista
flows:
  intervention:
    - vision-diagnoser
default_flow: intervention
blackboard_schema: {}
validators: []
ui:
  brand_color: "#2563EB"
  emoji: "⚡"
  primary_action:
    label: "Nuevo trabajo"
    flow: intervention
    icon: bolt
  secondary_actions:
    - label: "Sólo presupuestar"
      flow: quote_only
      icon: clipboard
  library_default_mode: list
hooks:
  on_quote_generated:
    - send_to_blackboard: client_message
  on_job_closed:
    - generate_report: true
    - prompt_corpus_consent: false
`;

const LEGACY_YAML = `
name: legacy-cooking
description: Test fixture for cartridge without ui/hooks
entry_intents:
  - plan menu
flows:
  weekly:
    - menu-planner
default_flow: weekly
blackboard_schema: {}
validators: []
`;

describe("cartridge registry — ui:/hooks: parsing", () => {
  beforeEach(() => {
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
    _resetDBForTests();
  });

  it("parses ui: and hooks: from a trade cartridge", async () => {
    await putFile("cartridges/trade-electricista/cartridge.yaml", ELECTRICISTA_YAML);

    const reg = new CartridgeRegistry();
    await reg.init();

    const m = reg.get("trade-electricista");
    expect(m).toBeDefined();
    expect(m!.ui).toBeDefined();
    expect(m!.ui!.brand_color).toBe("#2563EB");
    expect(m!.ui!.emoji).toBe("⚡");
    expect(m!.ui!.primary_action).toEqual({ label: "Nuevo trabajo", flow: "intervention", icon: "bolt" });
    expect(m!.ui!.secondary_actions).toHaveLength(1);
    expect(m!.ui!.secondary_actions![0].flow).toBe("quote_only");
    expect(m!.ui!.library_default_mode).toBe("list");

    expect(m!.hooks).toBeDefined();
    expect(m!.hooks!.on_quote_generated).toHaveLength(1);
    expect(m!.hooks!.on_job_closed).toHaveLength(2);
    // `prompt_corpus_consent: false` must round-trip as false (key+value), not be dropped.
    const corpusHook = m!.hooks!.on_job_closed!.find((h) => "prompt_corpus_consent" in (h as Record<string, unknown>));
    expect(corpusHook).toBeDefined();
    expect((corpusHook as Record<string, unknown>).prompt_corpus_consent).toBe(false);
  });

  it("leaves ui/hooks undefined on a legacy cartridge", async () => {
    await putFile("cartridges/legacy-cooking/cartridge.yaml", LEGACY_YAML);

    const reg = new CartridgeRegistry();
    await reg.init();

    const m = reg.get("legacy-cooking");
    expect(m).toBeDefined();
    expect(m!.ui).toBeUndefined();
    expect(m!.hooks).toBeUndefined();
  });

  it("ignores malformed primary_action (missing flow)", async () => {
    const yaml = `
name: bad-ui
description: x
entry_intents: []
flows: { f1: [a] }
default_flow: f1
blackboard_schema: {}
validators: []
ui:
  brand_color: "#000"
  primary_action:
    label: "no flow"
`;
    await putFile("cartridges/bad-ui/cartridge.yaml", yaml);
    const reg = new CartridgeRegistry();
    await reg.init();
    const m = reg.get("bad-ui");
    expect(m!.ui!.brand_color).toBe("#000");
    expect(m!.ui!.primary_action).toBeUndefined();
  });
});
