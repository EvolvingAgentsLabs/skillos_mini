import { describe, expect, it } from 'vitest';
import { Navigator, type NavigatorConfig } from '../src/lib/cartridge-v2/navigator';
import type { NavigatorDeps, NavigatorEvent } from '../src/lib/cartridge-v2/types';
import { createToolRegistry, type ToolFn } from '../src/lib/cartridge-v2/tool_invoker';
import { parseDoc, extractAvailableTools } from '../src/lib/cartridge-v2/md_walker';

// =============================================================================
// Mock cartridge with available-tools
// =============================================================================

const HYBRID_FILES: Record<string, string> = {
  'hybrid-cart/MANIFEST.md': `---
type: cartridge
version: 2
id: hybrid-test
title: Hybrid Test
language: es-UY
description: Test hybrid tool-calling
entry_intents:
  - test
entry_index: index.md
tools_required:
  - electrical.checkWireGauge
  - electrical.checkCircuitBreaker
  - safety.checkRCD
locale:
  region: UY
  currency: UYU
  language: es-UY
  voltage_v: 230
navigation:
  max_hops: 5
---
Hybrid test manifest.
`,
  'hybrid-cart/index.md': `---
id: index
title: Índice
routes:
  - intent: check circuits
    next: inspection
---
Bienvenido. ¿Cuál es el problema?

Opciones: [Inspección](#inspection)
`,
  'hybrid-cart/inspection.md': `---
id: inspection
title: Inspección Eléctrica
produces: diagnosis
---
Revisando la instalación eléctrica.

\`\`\`tool-call
tool: electrical.checkWireGauge
args:
  breaker_amps: "20"
  wire_section_mm2: "2.5"
  circuit_length_m: "10"
\`\`\`

El técnico puede ejecutar verificaciones adicionales según los síntomas.

\`\`\`available-tools
tools:
  - electrical.checkCircuitBreaker
  - safety.checkRCD
max_calls: 3
purpose: "Run additional checks based on the symptoms described by the user"
\`\`\`
`,
  // A doc WITHOUT available-tools (backward compat)
  'hybrid-cart/simple.md': `---
id: simple
title: Simple Doc
---
This is a simple doc with no hybrid tools.

\`\`\`tool-call
tool: electrical.checkWireGauge
args:
  breaker_amps: "16"
  wire_section_mm2: "1.5"
  circuit_length_m: "8"
\`\`\`
`,
  // A doc with available-tools but max_calls = 1
  'hybrid-cart/limited.md': `---
id: limited
title: Limited Calls
---
Limited doc.

\`\`\`available-tools
tools:
  - electrical.checkCircuitBreaker
max_calls: 1
\`\`\`
`,
};

// =============================================================================
// Mock tools
// =============================================================================

function makeHybridRegistry() {
  const reg = createToolRegistry();

  const checkWireGauge: ToolFn = (args) => ({
    verdict: Number(args.breaker_amps) <= 20 ? 'pass' : 'fail',
    reason: `${args.wire_section_mm2}mm² for ${args.breaker_amps}A`,
    ref: 'IEC 60364-5-52',
  });

  const checkCircuitBreaker: ToolFn = (args) => ({
    verdict: 'pass',
    reason: `Breaker ${args.breaker_amps ?? 20}A OK`,
    ref: 'IEC 60898',
  });

  const checkRCD: ToolFn = (args) => ({
    verdict: args.has_rcd === 'false' ? 'fail' : 'pass',
    reason: args.has_rcd === 'false' ? 'No RCD installed' : 'RCD 30mA present',
    ref: 'IEC 61008',
  });

  reg.register('electrical.checkWireGauge', checkWireGauge);
  reg.register('electrical.checkCircuitBreaker', checkCircuitBreaker);
  reg.register('safety.checkRCD', checkRCD);
  return reg;
}

// =============================================================================
// Mock deps with configurable LLM responses
// =============================================================================

function makeMockDeps(llmResponses: string[]): NavigatorDeps {
  let callIdx = 0;
  return {
    infer: async (_system: string, _user: string): Promise<string> => {
      const response = llmResponses[callIdx] ?? 'DONE';
      callIdx++;
      return response;
    },
    readFile: async (path: string): Promise<string> => {
      const content = HYBRID_FILES[path];
      if (!content) throw new Error(`File not found: ${path}`);
      return content;
    },
  };
}

function makeConfig(registry: ReturnType<typeof createToolRegistry>): NavigatorConfig {
  return {
    basePath: 'hybrid-cart',
    docPaths: [
      'hybrid-cart/index.md',
      'hybrid-cart/inspection.md',
      'hybrid-cart/simple.md',
      'hybrid-cart/limited.md',
    ],
    userTask: 'Revisar circuitos zona cocina',
    registry,
  };
}

// =============================================================================
// Parser tests
// =============================================================================

describe('extractAvailableTools', () => {
  it('parses available-tools block from markdown body', () => {
    const body = `Some prose.

\`\`\`available-tools
tools:
  - electrical.checkCircuitBreaker
  - safety.checkRCD
max_calls: 3
purpose: "Run additional checks"
\`\`\`

More prose.`;

    const result = extractAvailableTools(body);
    expect(result).not.toBeNull();
    expect(result!.tools).toEqual(['electrical.checkCircuitBreaker', 'safety.checkRCD']);
    expect(result!.max_calls).toBe(3);
    expect(result!.purpose).toBe('Run additional checks');
  });

  it('returns null when no available-tools block present', () => {
    const body = 'Just prose, no tools block.';
    expect(extractAvailableTools(body)).toBeNull();
  });

  it('returns null for empty tools array', () => {
    const body = `\`\`\`available-tools
tools: []
\`\`\``;
    expect(extractAvailableTools(body)).toBeNull();
  });

  it('handles missing optional fields', () => {
    const body = `\`\`\`available-tools
tools:
  - safety.checkRCD
\`\`\``;
    const result = extractAvailableTools(body);
    expect(result).not.toBeNull();
    expect(result!.tools).toEqual(['safety.checkRCD']);
    expect(result!.max_calls).toBeUndefined();
    expect(result!.purpose).toBeUndefined();
  });
});

describe('parseDoc with available-tools', () => {
  it('includes availableTools in parsed doc', () => {
    const content = HYBRID_FILES['hybrid-cart/inspection.md'];
    const doc = parseDoc(content);
    expect(doc.availableTools).not.toBeNull();
    expect(doc.availableTools!.tools).toContain('electrical.checkCircuitBreaker');
    expect(doc.availableTools!.tools).toContain('safety.checkRCD');
    expect(doc.toolCalls.length).toBe(1); // mandatory tool-call
  });

  it('returns null availableTools for docs without the block', () => {
    const content = HYBRID_FILES['hybrid-cart/simple.md'];
    const doc = parseDoc(content);
    expect(doc.availableTools).toBeNull();
    expect(doc.toolCalls.length).toBe(1);
  });
});

// =============================================================================
// Hybrid Navigator tests
// =============================================================================

describe('Navigator hybrid tool-calling', () => {
  it('LLM calls a whitelisted tool and result appears on blackboard', async () => {
    const registry = makeHybridRegistry();
    const config = makeConfig(registry);

    // LLM responses:
    // 1. routing → inspection
    // 2. hybrid turn → LLM calls checkCircuitBreaker
    // 3. hybrid turn → LLM says DONE (stop hybrid loop)
    // 4. pick-next → DONE (no more docs to visit)
    // 5. composing → final artifact
    const deps = makeMockDeps([
      'inspection',
      '<tool_call name="electrical.checkCircuitBreaker">{"breaker_amps": 20}</tool_call>',
      'DONE',
      'DONE',
      'Diagnóstico: instalación OK',
    ]);
    const nav = new Navigator(deps, config);
    const events: NavigatorEvent[] = [];
    nav.onEvent((e) => events.push(e));

    const state = await nav.run();

    expect(state.phase).toBe('done');

    // Check that llm-tool-call event was emitted
    const llmToolCalls = events.filter(e => e.type === 'llm-tool-call');
    expect(llmToolCalls.length).toBe(1);
    expect((llmToolCalls[0] as any).tool).toBe('electrical.checkCircuitBreaker');

    // Check that tool result was stored
    const toolResults = events.filter(e => e.type === 'tool-result');
    // At least 2: one mandatory (checkWireGauge) + one hybrid (checkCircuitBreaker)
    expect(toolResults.length).toBeGreaterThanOrEqual(2);
  });

  it('LLM tool call rejected when not in whitelist', async () => {
    const registry = makeHybridRegistry();
    const config = makeConfig(registry);

    // LLM tries to call checkWireGauge which is NOT in available-tools
    const deps = makeMockDeps([
      'inspection',
      '<tool_call name="electrical.checkWireGauge">{"breaker_amps": 32, "wire_section_mm2": 4}</tool_call>',
      'DONE',
      'DONE',
      'Report',
    ]);
    const nav = new Navigator(deps, config);
    const events: NavigatorEvent[] = [];
    nav.onEvent((e) => events.push(e));

    await nav.run();

    const rejected = events.filter(e => e.type === 'llm-tool-rejected');
    expect(rejected.length).toBe(1);
    expect((rejected[0] as any).tool).toBe('electrical.checkWireGauge');
    expect((rejected[0] as any).reason).toBe('not_in_whitelist');

    // The rejected tool should NOT appear as a llm-tool-call event
    const llmToolCalls = events.filter(e => e.type === 'llm-tool-call');
    expect(llmToolCalls.length).toBe(0);
  });

  it('LLM tool call rejected when tool not in registry', async () => {
    const registry = makeHybridRegistry();
    const config = makeConfig(registry);

    // Add a tool to the whitelist that doesn't exist in registry
    // We need a doc that lists a non-existent tool in available-tools
    HYBRID_FILES['hybrid-cart/phantom.md'] = `---
id: phantom
title: Phantom
---
\`\`\`available-tools
tools:
  - nonexistent.phantomTool
\`\`\`
`;
    config.docPaths.push('hybrid-cart/phantom.md');

    const deps = makeMockDeps([
      'phantom',
      '<tool_call name="nonexistent.phantomTool">{"x": 1}</tool_call>',
      'DONE',
      'Report',
    ]);
    const nav = new Navigator(deps, config);
    const events: NavigatorEvent[] = [];
    nav.onEvent((e) => events.push(e));

    await nav.run();

    const rejected = events.filter(e => e.type === 'llm-tool-rejected');
    expect(rejected.length).toBe(1);
    expect((rejected[0] as any).reason).toBe('not_in_registry');

    // Cleanup
    delete HYBRID_FILES['hybrid-cart/phantom.md'];
  });

  it('max_calls ceiling enforced', async () => {
    const registry = makeHybridRegistry();
    const config = makeConfig(registry);

    // Use the limited.md doc with max_calls=1
    // LLM tries to call tools repeatedly — should stop after 1 turn
    const deps = makeMockDeps([
      'limited',
      '<tool_call name="electrical.checkCircuitBreaker">{"breaker_amps": 20}</tool_call>',
      // This second call should NOT execute because max_calls=1
      '<tool_call name="electrical.checkCircuitBreaker">{"breaker_amps": 16}</tool_call>',
      'DONE',
      'Report',
    ]);
    const nav = new Navigator(deps, config);
    const events: NavigatorEvent[] = [];
    nav.onEvent((e) => events.push(e));

    await nav.run();

    // Only 1 hybrid tool-call turn should have been executed
    const hybridCalls = events.filter(e => e.type === 'llm-tool-call');
    expect(hybridCalls.length).toBe(1);
  });

  it('doc without available-tools skips hybrid loop (backward compatible)', async () => {
    const registry = makeHybridRegistry();
    const config = makeConfig(registry);

    // Route to simple.md which has no available-tools block
    const deps = makeMockDeps([
      'simple',
      'DONE',
      'Report',
    ]);
    const nav = new Navigator(deps, config);
    const events: NavigatorEvent[] = [];
    nav.onEvent((e) => events.push(e));

    await nav.run();

    // No hybrid tool calls should have occurred
    const hybridCalls = events.filter(e => e.type === 'llm-tool-call');
    expect(hybridCalls.length).toBe(0);

    // But the mandatory tool-call should have executed
    const toolCalls = events.filter(e => e.type === 'tool-call');
    expect(toolCalls.length).toBe(1);
    expect((toolCalls[0] as any).tool).toBe('electrical.checkWireGauge');
  });

  it('LLM says DONE immediately in hybrid loop', async () => {
    const registry = makeHybridRegistry();
    const config = makeConfig(registry);

    // LLM immediately says DONE in the hybrid turn (no tools called)
    const deps = makeMockDeps([
      'inspection',
      'DONE', // hybrid: LLM says done immediately
      'DONE', // pick-next
      'Report', // composing
    ]);
    const nav = new Navigator(deps, config);
    const events: NavigatorEvent[] = [];
    nav.onEvent((e) => events.push(e));

    await nav.run();

    const hybridCalls = events.filter(e => e.type === 'llm-tool-call');
    expect(hybridCalls.length).toBe(0);

    // Mandatory tool still ran
    const mandatoryCalls = events.filter(e => e.type === 'tool-call');
    expect(mandatoryCalls.length).toBe(1);
  });
});

// =============================================================================
// COMPOSING phase tests
// =============================================================================

describe('Navigator COMPOSING phase', () => {
  it('produces artifact on blackboard', async () => {
    const registry = makeHybridRegistry();
    const config = makeConfig(registry);

    // simple.md has no cross-refs → no pick-next call → goes straight to composing
    const deps = makeMockDeps([
      'simple',    // routing
      'Diagnóstico completo: cable 2.5mm² adecuado para interruptor 16A. Instalación conforme a IEC 60364.',
    ]);
    const nav = new Navigator(deps, config);
    const events: NavigatorEvent[] = [];
    nav.onEvent((e) => events.push(e));

    const state = await nav.run();

    expect(state.phase).toBe('done');

    // Check composing phase occurred
    const phases = events
      .filter(e => e.type === 'phase-change')
      .map(e => (e as any).to);
    expect(phases).toContain('composing');

    // Check artifact on blackboard
    const bb = nav.getBlackboard();
    expect(bb.has('_artifact')).toBe(true);
    const artifact = bb.get('_artifact') as string;
    expect(artifact).toContain('Diagnóstico completo');
  });

  it('uses inferLong when available for composing', async () => {
    const registry = makeHybridRegistry();
    const config = makeConfig(registry);

    let inferLongCalled = false;
    const deps: NavigatorDeps = {
      infer: async () => {
        // For routing, walking, and hybrid turns
        return 'simple';
      },
      inferLong: async (_system: string, _user: string) => {
        inferLongCalled = true;
        return 'Extended diagnosis report with detailed analysis...';
      },
      readFile: async (path: string) => {
        const content = HYBRID_FILES[path];
        if (!content) throw new Error(`File not found: ${path}`);
        return content;
      },
    };

    // Override infer to handle multiple calls
    let callIdx = 0;
    const responses = ['simple', 'DONE'];
    deps.infer = async () => {
      const r = responses[callIdx] ?? 'DONE';
      callIdx++;
      return r;
    };

    const nav = new Navigator(deps, config);
    await nav.run();

    expect(inferLongCalled).toBe(true);
    expect(nav.getBlackboard().get('_artifact')).toBe('Extended diagnosis report with detailed analysis...');
  });
});

// =============================================================================
// Full integration: walk with hybrid + composing
// =============================================================================

describe('Navigator full integration (hybrid + composing)', () => {
  it('complete flow: mandatory tools → hybrid tools → compose artifact', async () => {
    const registry = makeHybridRegistry();
    const config = makeConfig(registry);

    // inspection.md has no cross-refs → after hybrid loop, terminates → composing
    const deps = makeMockDeps([
      // 1. routing → inspection
      'inspection',
      // 2. hybrid turn: LLM calls checkCircuitBreaker
      '<tool_call name="electrical.checkCircuitBreaker">{"breaker_amps": 20}</tool_call>',
      // 3. hybrid turn: LLM calls checkRCD
      '<tool_call name="safety.checkRCD">{"has_rcd": "true"}</tool_call>',
      // 4. hybrid turn: LLM says DONE
      'DONE',
      // 5. composing: final artifact (no pick-next since no crossRefs)
      'INFORME: Instalación verificada. Cable 2.5mm² OK. Interruptor 20A OK. RCD presente.',
    ]);

    const nav = new Navigator(deps, config);
    const events: NavigatorEvent[] = [];
    nav.onEvent((e) => events.push(e));

    const state = await nav.run();

    expect(state.phase).toBe('done');
    expect(state.terminationReason).toBe('completed');

    // Verify event flow
    const eventTypes = events.map(e => e.type);

    // Should have: nav-start, doc-enter, tool-call (mandatory),
    // tool-result, llm-tool-call (hybrid x2), tool-result (hybrid x2),
    // llm-turn (composing), nav-end
    expect(eventTypes).toContain('nav-start');
    expect(eventTypes).toContain('tool-call');       // mandatory
    expect(eventTypes).toContain('llm-tool-call');   // hybrid
    expect(eventTypes).toContain('nav-end');

    // Check all 3 tools were called (1 mandatory + 2 hybrid)
    const mandatoryToolCalls = events.filter(e => e.type === 'tool-call');
    expect(mandatoryToolCalls.length).toBe(1);
    expect((mandatoryToolCalls[0] as any).tool).toBe('electrical.checkWireGauge');

    const hybridToolCalls = events.filter(e => e.type === 'llm-tool-call');
    expect(hybridToolCalls.length).toBe(2);
    expect((hybridToolCalls[0] as any).tool).toBe('electrical.checkCircuitBreaker');
    expect((hybridToolCalls[1] as any).tool).toBe('safety.checkRCD');

    // Check artifact
    const bb = nav.getBlackboard();
    expect(bb.has('_artifact')).toBe(true);
    const artifact = bb.get('_artifact') as string;
    expect(artifact).toContain('INFORME');

    // Total tool results: 3
    expect(state.toolResults.length).toBe(3);
  });
});
