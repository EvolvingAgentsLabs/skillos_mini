import { describe, expect, it } from 'vitest';
import { resolveArgs, resolveExpression, type ResolverContext } from '../src/lib/cartridge-v2/arg_resolver';
import type { ToolResultEntry } from '../src/lib/cartridge-v2/types';

function makeCtx(
  blackboard: Record<string, unknown> = {},
  toolResults: ToolResultEntry[] = [],
): ResolverContext {
  return {
    getBlackboard: (key) => blackboard[key] as any,
    toolResults,
  };
}

describe('arg_resolver', () => {
  describe('resolveExpression', () => {
    it('passes through literal strings', () => {
      const result = resolveExpression('hello', makeCtx());
      expect(result).toEqual({ ok: true, value: 'hello' });
    });

    it('parses numeric literals', () => {
      expect(resolveExpression('42', makeCtx())).toEqual({ ok: true, value: 42 });
      expect(resolveExpression('-3.14', makeCtx())).toEqual({ ok: true, value: -3.14 });
    });

    it('parses boolean literals', () => {
      expect(resolveExpression('true', makeCtx())).toEqual({ ok: true, value: true });
      expect(resolveExpression('false', makeCtx())).toEqual({ ok: true, value: false });
    });

    it('parses null/none literals', () => {
      expect(resolveExpression('null', makeCtx())).toEqual({ ok: true, value: null });
      expect(resolveExpression('none', makeCtx())).toEqual({ ok: true, value: null });
    });

    it('resolves ${ctx.key} from blackboard', () => {
      const ctx = makeCtx({ breaker_amps: 20 });
      const result = resolveExpression('${ctx.breaker_amps}', ctx);
      expect(result).toEqual({ ok: true, value: 20 });
    });

    it('resolves nested ${ctx.key.sub} from blackboard', () => {
      const ctx = makeCtx({ panel: { brand: 'Square D', amps: 200 } });
      const result = resolveExpression('${ctx.panel.brand}', ctx);
      expect(result).toEqual({ ok: true, value: 'Square D' });
    });

    it('returns ok:false for missing blackboard key', () => {
      const result = resolveExpression('${ctx.missing}', makeCtx());
      expect(result).toEqual({ ok: false });
    });

    it('resolves ${ctx.key | default(value)} with fallback', () => {
      const result = resolveExpression('${ctx.missing | default(60)}', makeCtx());
      expect(result).toEqual({ ok: true, value: 60 });
    });

    it('uses blackboard value over default when present', () => {
      const ctx = makeCtx({ voltage: 127 });
      const result = resolveExpression('${ctx.voltage | default(120)}', ctx);
      expect(result).toEqual({ ok: true, value: 127 });
    });

    it('strips quotes from default string values', () => {
      const result = resolveExpression('${ctx.missing | default("copper")}', makeCtx());
      expect(result).toEqual({ ok: true, value: 'copper' });
    });

    it('resolves ${tool_results.last.field}', () => {
      const toolResults: ToolResultEntry[] = [
        { tool: 'electrical.check', args: {}, result: { compliant: false, gauge: '14 AWG' }, docId: 'doc1', timestamp: 0, durationMs: 10 },
      ];
      const ctx = makeCtx({}, toolResults);
      expect(resolveExpression('${tool_results.last.compliant}', ctx)).toEqual({ ok: true, value: false });
      expect(resolveExpression('${tool_results.last.gauge}', ctx)).toEqual({ ok: true, value: '14 AWG' });
    });

    it('resolves ${tool_results.0.field} by index', () => {
      const toolResults: ToolResultEntry[] = [
        { tool: 'a', args: {}, result: { x: 1 }, docId: 'doc1', timestamp: 0, durationMs: 5 },
        { tool: 'b', args: {}, result: { x: 2 }, docId: 'doc1', timestamp: 1, durationMs: 5 },
      ];
      const ctx = makeCtx({}, toolResults);
      expect(resolveExpression('${tool_results.0.x}', ctx)).toEqual({ ok: true, value: 1 });
      expect(resolveExpression('${tool_results.1.x}', ctx)).toEqual({ ok: true, value: 2 });
    });

    it('returns ok:false for tool_results when none exist', () => {
      const result = resolveExpression('${tool_results.last.field}', makeCtx());
      expect(result).toEqual({ ok: false });
    });
  });

  describe('resolveArgs', () => {
    it('resolves all args successfully', () => {
      const ctx = makeCtx({ breaker_amps: 20, wire_section_mm2: 2.5 });
      const result = resolveArgs(
        { breaker_amps: '${ctx.breaker_amps}', wire_section_mm2: '${ctx.wire_section_mm2}' },
        ctx,
      );
      expect(result.resolved).toEqual({ breaker_amps: 20, wire_section_mm2: 2.5 });
      expect(result.unresolved).toEqual([]);
    });

    it('reports unresolved keys', () => {
      const ctx = makeCtx({ breaker_amps: 20 });
      const result = resolveArgs(
        { breaker_amps: '${ctx.breaker_amps}', wire_section_mm2: '${ctx.wire_section_mm2}' },
        ctx,
      );
      expect(result.resolved).toEqual({ breaker_amps: 20 });
      expect(result.unresolved).toEqual(['wire_section_mm2']);
    });

    it('handles mix of literals and expressions', () => {
      const ctx = makeCtx({ voltage: 127 });
      const result = resolveArgs(
        { voltage: '${ctx.voltage}', code: 'NOM-001-SEDE', compliant: 'true' },
        ctx,
      );
      expect(result.resolved).toEqual({ voltage: 127, code: 'NOM-001-SEDE', compliant: true });
      expect(result.unresolved).toEqual([]);
    });
  });
});
