import { describe, it, expect } from 'vitest';
import {
  synthesizeOpcodes,
  v2ToKernelManifest,
  DEFAULT_HALT,
  type V2CartridgeInput,
} from '../src/lib/kernel/v2_adapter';

describe('synthesizeOpcodes', () => {
  it('emits a single empty-args opcode when schema is missing', () => {
    expect(synthesizeOpcodes('echo', 'ping', undefined)).toEqual([
      '<|call|>echo.ping {}<|/call|>\n',
    ]);
  });

  it('emits a single empty-args opcode when schema has no properties', () => {
    expect(synthesizeOpcodes('echo', 'ping', { type: 'object', properties: {} })).toEqual([
      '<|call|>echo.ping {}<|/call|>\n',
    ]);
  });

  it('synthesizes one opcode per enum value for a single-arg method', () => {
    const opcodes = synthesizeOpcodes('echo', 'say', {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string', enum: ['hello', 'world', 'ok'] },
      },
    });
    expect(opcodes).toEqual([
      '<|call|>echo.say {"text":"hello"}<|/call|>\n',
      '<|call|>echo.say {"text":"world"}<|/call|>\n',
      '<|call|>echo.say {"text":"ok"}<|/call|>\n',
    ]);
  });

  it('cross-products multi-arg enums', () => {
    const opcodes = synthesizeOpcodes('robot', 'set_speed', {
      type: 'object',
      required: ['axis', 'tier'],
      properties: {
        axis: { type: 'string', enum: ['linear', 'angular'] },
        tier: { type: 'string', enum: ['slow', 'fast'] },
      },
    });
    expect(opcodes).toHaveLength(4);
    expect(opcodes).toContain('<|call|>robot.set_speed {"axis":"linear","tier":"slow"}<|/call|>\n');
    expect(opcodes).toContain('<|call|>robot.set_speed {"axis":"linear","tier":"fast"}<|/call|>\n');
    expect(opcodes).toContain('<|call|>robot.set_speed {"axis":"angular","tier":"slow"}<|/call|>\n');
    expect(opcodes).toContain('<|call|>robot.set_speed {"axis":"angular","tier":"fast"}<|/call|>\n');
  });

  it('returns null when a required arg has no enum constraint', () => {
    const opcodes = synthesizeOpcodes('vision', 'describe', {
      type: 'object',
      required: ['image'],
      properties: {
        image: { type: 'string' }, // free-form, can't enumerate
      },
    });
    expect(opcodes).toBeNull();
  });

  it('handles tetris-shaped manifest correctly', () => {
    const opcodes = synthesizeOpcodes('tetris', 'move', {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['left', 'right', 'down', 'rotate', 'drop'] },
      },
    });
    expect(opcodes).toHaveLength(5);
    expect(opcodes![0]).toBe('<|call|>tetris.move {"action":"left"}<|/call|>\n');
    expect(opcodes![4]).toBe('<|call|>tetris.move {"action":"drop"}<|/call|>\n');
  });
});

describe('v2ToKernelManifest', () => {
  it('produces a kernel manifest from a fully-enumerable v2 cartridge', () => {
    const v2: V2CartridgeInput = {
      id: 'echo',
      version: '0.1.0',
      description: 'Smoke test cartridge',
      methods: {
        say: {
          summary: 'Emit a greeting',
          schema: {
            type: 'object',
            required: ['text'],
            properties: { text: { type: 'string', enum: ['hello', 'world', 'ok'] } },
          },
        },
        ping: {
          summary: 'Liveness probe',
          schema: { type: 'object', additionalProperties: false, properties: {} },
        },
      },
    };
    const report = v2ToKernelManifest(v2);
    expect(report.manifest.name).toBe('echo');
    expect(report.manifest.version).toBe('0.1.0');
    expect(report.enumerable).toEqual(['say', 'ping']);
    expect(report.skipped).toEqual([]);
    expect(report.totalOpcodes).toBe(4); // 3 say + 1 ping
    expect(report.manifest.halt).toEqual(DEFAULT_HALT);
    expect(report.manifest.methods.say.opcodes).toHaveLength(3);
    expect(report.manifest.methods.ping.opcodes).toEqual([
      '<|call|>echo.ping {}<|/call|>\n',
    ]);
  });

  it('skips methods with non-enumerable required args', () => {
    const v2: V2CartridgeInput = {
      id: 'vision',
      methods: {
        describe: {
          schema: {
            type: 'object',
            required: ['image'],
            properties: { image: { type: 'string' } },
          },
        },
        ping: {
          schema: { type: 'object', properties: {} },
        },
      },
    };
    const report = v2ToKernelManifest(v2);
    expect(report.enumerable).toEqual(['ping']);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].method).toBe('describe');
    expect(report.skipped[0].reason).toMatch(/non-enumerable/);
    expect(report.manifest.methods.describe).toBeUndefined();
  });

  it('uses defaults when fields are missing', () => {
    const v2: V2CartridgeInput = { id: 'minimal', methods: {} };
    const report = v2ToKernelManifest(v2);
    expect(report.manifest.name).toBe('minimal');
    expect(report.manifest.version).toBe('0.0.0');
    expect(report.manifest.halt).toEqual(DEFAULT_HALT);
    expect(report.totalOpcodes).toBe(0);
  });
});
