import { describe, expect, it } from 'vitest';
import { Navigator, type NavigatorConfig } from '../src/lib/cartridge-v2/navigator';
import type { NavigatorDeps, NavigatorEvent } from '../src/lib/cartridge-v2/types';
import { createToolRegistry, type ToolFn } from '../src/lib/cartridge-v2/tool_invoker';

// =============================================================================
// Mock cartridge filesystem
// =============================================================================

const MOCK_FILES: Record<string, string> = {
  'test-cart/MANIFEST.md': `---
type: cartridge
version: 2
id: test-electricista
title: Test Electricista
language: es-UY
description: Test cartridge
entry_intents:
  - test
entry_index: index.md
tools_required:
  - electrical.checkWireGauge
locale:
  region: UY
  currency: UYU
  language: es-UY
  voltage_v: 230
navigation:
  max_hops: 5
---
Test manifest body.
`,
  'test-cart/index.md': `---
id: index
title: Índice
routes:
  - intent: cable problem
    next: diagnosis
---
Bienvenido. ¿Cuál es el problema eléctrico?

Opciones: [Diagnóstico cable](#diagnosis)
`,
  'test-cart/diagnosis.md': `---
id: diagnosis
title: Diagnóstico Cable
produces: diagnosis_report
next_candidates:
  - quote
---
Revisando el cable instalado.

\`\`\`tool-call
tool: electrical.checkWireGauge
args:
  breaker_amps: \${ctx.breaker_amps}
  wire_section_mm2: \${ctx.wire_section_mm2}
  circuit_length_m: 10
\`\`\`

Según el resultado, proceda al [Presupuesto](#quote).
`,
  'test-cart/quote.md': `---
id: quote
title: Presupuesto
---
El presupuesto final basado en el diagnóstico.
`,
};

// =============================================================================
// Mock dependencies
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
      const content = MOCK_FILES[path];
      if (!content) throw new Error(`File not found: ${path}`);
      return content;
    },
  };
}

function makeRegistry(): ReturnType<typeof createToolRegistry> {
  const reg = createToolRegistry();
  const mockCheck: ToolFn = (args) => ({
    verdict: (args.breaker_amps as number) <= 20 ? 'pass' : 'fail',
    reason: `${args.wire_section_mm2}mm² for ${args.breaker_amps}A breaker`,
    ref: 'IEC 60364-5-52',
  });
  reg.register('electrical.checkWireGauge', mockCheck);
  return reg;
}

function makeConfig(registry: ReturnType<typeof createToolRegistry>): NavigatorConfig {
  return {
    basePath: 'test-cart',
    docPaths: ['test-cart/index.md', 'test-cart/diagnosis.md', 'test-cart/quote.md'],
    userTask: 'Tengo un cable que se calienta',
    registry,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Navigator', () => {
  it('runs through a complete session: load → route → walk → done', async () => {
    const registry = makeRegistry();
    const config = makeConfig(registry);
    // LLM responses: 1. routing picks "diagnosis", 2. walking picks "quote", 3. walking says DONE
    const deps = makeMockDeps(['diagnosis', 'quote', 'DONE']);
    const nav = new Navigator(deps, config);

    // Provide required blackboard values before run
    nav.provideUserInput('breaker_amps', 20);
    nav.provideUserInput('wire_section_mm2', 2.5);

    const events: NavigatorEvent[] = [];
    nav.onEvent((e) => events.push(e));

    const finalState = await nav.run();

    expect(finalState.phase).toBe('done');
    expect(finalState.cartridgeId).toBe('test-electricista');
    expect(finalState.terminationReason).toBe('completed');
    expect(finalState.hopCount).toBeGreaterThanOrEqual(1);

    // Check events
    const phases = events.filter(e => e.type === 'phase-change').map(e => (e as any).to);
    expect(phases).toContain('loading');
    expect(phases).toContain('routing');
    expect(phases).toContain('walking');
    expect(phases).toContain('done');
  });

  it('emits tool-call and tool-result events', async () => {
    const registry = makeRegistry();
    const config = makeConfig(registry);
    const deps = makeMockDeps(['diagnosis', 'DONE']);
    const nav = new Navigator(deps, config);

    nav.provideUserInput('breaker_amps', 20);
    nav.provideUserInput('wire_section_mm2', 2.5);

    const events: NavigatorEvent[] = [];
    nav.onEvent((e) => events.push(e));

    await nav.run();

    const toolCalls = events.filter(e => e.type === 'tool-call');
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect((toolCalls[0] as any).tool).toBe('electrical.checkWireGauge');

    const toolResults = events.filter(e => e.type === 'tool-result');
    expect(toolResults.length).toBeGreaterThanOrEqual(1);
  });

  it('stops at max_hops', async () => {
    const registry = makeRegistry();
    const config = { ...makeConfig(registry), maxHops: 1 };
    // LLM keeps picking diagnosis
    const deps = makeMockDeps(['diagnosis', 'diagnosis', 'diagnosis']);
    const nav = new Navigator(deps, config);

    nav.provideUserInput('breaker_amps', 20);
    nav.provideUserInput('wire_section_mm2', 2.5);

    const finalState = await nav.run();
    expect(finalState.hopCount).toBeLessThanOrEqual(1);
  });

  it('emits ask-user for unresolved args', async () => {
    const registry = makeRegistry();
    const config = makeConfig(registry);
    const deps = makeMockDeps(['diagnosis', 'DONE']);
    const nav = new Navigator(deps, config);

    // Don't provide breaker_amps — it should be unresolved
    nav.provideUserInput('wire_section_mm2', 2.5);

    const events: NavigatorEvent[] = [];
    nav.onEvent((e) => events.push(e));

    await nav.run();

    const askEvents = events.filter(e => e.type === 'ask-user');
    expect(askEvents.length).toBeGreaterThanOrEqual(1);
    expect((askEvents[0] as any).key).toBe('breaker_amps');
  });

  it('writes tool results to blackboard', async () => {
    const registry = makeRegistry();
    const config = makeConfig(registry);
    const deps = makeMockDeps(['diagnosis', 'DONE']);
    const nav = new Navigator(deps, config);

    nav.provideUserInput('breaker_amps', 20);
    nav.provideUserInput('wire_section_mm2', 2.5);

    await nav.run();

    const bb = nav.getBlackboard();
    // The mock tool returns { verdict, reason, ref } which get written to blackboard
    expect(bb.has('verdict')).toBe(true);
    expect(bb.get('verdict')).toBe('pass');
  });

  it('errors on missing cartridge MANIFEST', async () => {
    const registry = makeRegistry();
    const config: NavigatorConfig = {
      basePath: 'nonexistent',
      docPaths: [],
      userTask: 'test',
      registry,
    };
    const deps = makeMockDeps([]);
    const nav = new Navigator(deps, config);

    const finalState = await nav.run();
    expect(finalState.phase).toBe('error');
    expect(finalState.error).toContain('Cartridge load failed');
  });
});
