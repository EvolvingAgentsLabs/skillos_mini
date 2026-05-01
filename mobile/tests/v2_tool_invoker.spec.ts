import { describe, expect, it } from 'vitest';
import {
  createToolRegistry,
  registerModule,
  invokeTool,
  verifyTools,
  type ToolFn,
} from '../src/lib/cartridge-v2/tool_invoker';
import type { ToolContext, ToolResult } from '../src/lib/tool-library/types';

function makeCtx(): ToolContext {
  return {
    cartridgeId: 'test',
    cartridgeVersion: 2,
    locale: { region: 'UY', currency: 'UYU', language: 'es-UY', voltage_v: 230 },
    cartridgeData: {
      read: () => { throw new Error('no data'); },
      has: () => false,
    },
  };
}

const mockTool: ToolFn = (args) => ({
  verdict: 'pass' as const,
  reason: `got ${args.x}`,
  ref: 'test',
});

describe('tool_invoker', () => {
  describe('createToolRegistry', () => {
    it('register and retrieve', () => {
      const reg = createToolRegistry();
      reg.register('ns.foo', mockTool);
      expect(reg.has('ns.foo')).toBe(true);
      expect(reg.has('ns.bar')).toBe(false);
      expect(reg.get('ns.foo')).toBe(mockTool);
    });

    it('list returns all names', () => {
      const reg = createToolRegistry();
      reg.register('a.one', mockTool);
      reg.register('b.two', mockTool);
      expect(reg.list().sort()).toEqual(['a.one', 'b.two']);
    });
  });

  describe('registerModule', () => {
    it('registers all functions under namespace', () => {
      const reg = createToolRegistry();
      const module = {
        checkA: () => ({ verdict: 'pass', reason: 'ok', ref: 'x' }),
        checkB: () => ({ verdict: 'fail', reason: 'no', ref: 'y' }),
        _private: () => 'skip',
        CONSTANT: 42,
      };
      registerModule(reg, 'electrical', module);
      expect(reg.has('electrical.checkA')).toBe(true);
      expect(reg.has('electrical.checkB')).toBe(true);
      expect(reg.has('electrical._private')).toBe(false);
      expect(reg.has('electrical.CONSTANT')).toBe(false);
    });
  });

  describe('invokeTool', () => {
    it('invokes successfully and returns result', () => {
      const reg = createToolRegistry();
      reg.register('ns.foo', mockTool);
      const result = invokeTool(reg, 'ns.foo', { x: 42 }, makeCtx());
      expect(result.ok).toBe(true);
      expect(result.tool).toBe('ns.foo');
      expect((result.result as any).reason).toBe('got 42');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns error for missing tool', () => {
      const reg = createToolRegistry();
      const result = invokeTool(reg, 'ns.missing', {}, makeCtx());
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('catches exceptions from tool', () => {
      const reg = createToolRegistry();
      reg.register('ns.boom', () => { throw new Error('kaboom'); });
      const result = invokeTool(reg, 'ns.boom', {}, makeCtx());
      expect(result.ok).toBe(false);
      expect(result.error).toBe('kaboom');
    });
  });

  describe('verifyTools', () => {
    it('returns empty array when all exist', () => {
      const reg = createToolRegistry();
      reg.register('a.one', mockTool);
      reg.register('b.two', mockTool);
      expect(verifyTools(reg, ['a.one', 'b.two'])).toEqual([]);
    });

    it('returns missing tool names', () => {
      const reg = createToolRegistry();
      reg.register('a.one', mockTool);
      expect(verifyTools(reg, ['a.one', 'b.two', 'c.three'])).toEqual(['b.two', 'c.three']);
    });
  });
});
