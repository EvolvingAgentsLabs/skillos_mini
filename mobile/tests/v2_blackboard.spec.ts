import { describe, expect, it } from 'vitest';
import { Blackboard } from '../src/lib/cartridge-v2/blackboard';

describe('Blackboard (v2)', () => {
  describe('core API', () => {
    it('set and get', () => {
      const bb = new Blackboard();
      bb.set('voltage', 127, 'user', 'user_input');
      expect(bb.get('voltage')).toBe(127);
    });

    it('has returns true for existing keys', () => {
      const bb = new Blackboard();
      bb.set('x', 'hello', 'user', 'user_input');
      expect(bb.has('x')).toBe(true);
      expect(bb.has('y')).toBe(false);
    });

    it('delete removes key', () => {
      const bb = new Blackboard();
      bb.set('x', 1, 'user', 'user_input');
      expect(bb.delete('x')).toBe(true);
      expect(bb.has('x')).toBe(false);
      expect(bb.delete('x')).toBe(false);
    });

    it('getEntry returns full metadata', () => {
      const bb = new Blackboard();
      bb.set('wire', '14 AWG', 'tool_result', 'electrical.checkWireGauge', 0.95);
      const entry = bb.getEntry('wire');
      expect(entry).toBeDefined();
      expect(entry!.value).toBe('14 AWG');
      expect(entry!.source).toBe('tool_result');
      expect(entry!.producedBy).toBe('electrical.checkWireGauge');
      expect(entry!.confidence).toBe(0.95);
      expect(entry!.producedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('keys returns all keys', () => {
      const bb = new Blackboard();
      bb.set('a', 1, 'user', 'u');
      bb.set('b', 2, 'user', 'u');
      expect(bb.keys().sort()).toEqual(['a', 'b']);
    });

    it('size returns entry count', () => {
      const bb = new Blackboard();
      expect(bb.size).toBe(0);
      bb.set('x', 1, 'user', 'u');
      expect(bb.size).toBe(1);
    });

    it('clear removes all entries', () => {
      const bb = new Blackboard();
      bb.set('a', 1, 'user', 'u');
      bb.set('b', 2, 'user', 'u');
      bb.clear();
      expect(bb.size).toBe(0);
    });

    it('overwriting a key updates the entry', () => {
      const bb = new Blackboard();
      bb.set('x', 'old', 'user', 'u');
      bb.set('x', 'new', 'tool_result', 'tool');
      expect(bb.get('x')).toBe('new');
      expect(bb.getEntry('x')!.source).toBe('tool_result');
    });
  });

  describe('bulk operations', () => {
    it('setFromToolResult sets multiple with tool_result source', () => {
      const bb = new Blackboard();
      bb.setFromToolResult({ gauge: '12 AWG', compliant: true }, 'electrical.checkWireGauge');
      expect(bb.get('gauge')).toBe('12 AWG');
      expect(bb.get('compliant')).toBe(true);
      expect(bb.getEntry('gauge')!.source).toBe('tool_result');
      expect(bb.getEntry('gauge')!.producedBy).toBe('electrical.checkWireGauge');
    });

    it('setFromUser sets multiple with user source', () => {
      const bb = new Blackboard();
      bb.setFromUser({ breaker_amps: 20, wire_section_mm2: 2.5 });
      expect(bb.getEntry('breaker_amps')!.source).toBe('user');
    });

    it('setDefaults does not overwrite existing keys', () => {
      const bb = new Blackboard();
      bb.set('voltage', 127, 'user', 'u');
      bb.setDefaults({ voltage: 120, frequency: 60 }, 'electricista');
      expect(bb.get('voltage')).toBe(127); // not overwritten
      expect(bb.get('frequency')).toBe(60); // set because new
    });
  });

  describe('filtered queries', () => {
    it('getBySource filters entries', () => {
      const bb = new Blackboard();
      bb.set('a', 1, 'user', 'u');
      bb.set('b', 2, 'tool_result', 't');
      bb.set('c', 3, 'user', 'u');
      const userEntries = bb.getBySource('user');
      expect(userEntries).toEqual({ a: 1, c: 3 });
    });

    it('getByProducer filters by producer', () => {
      const bb = new Blackboard();
      bb.set('x', 1, 'tool_result', 'tool_a');
      bb.set('y', 2, 'tool_result', 'tool_b');
      bb.set('z', 3, 'tool_result', 'tool_a');
      expect(bb.getByProducer('tool_a')).toEqual({ x: 1, z: 3 });
    });
  });

  describe('serialization', () => {
    it('serialize and deserialize round-trip', () => {
      const bb = new Blackboard();
      bb.set('voltage', 127, 'user', 'user_input');
      bb.set('result', { compliant: false }, 'tool_result', 'electrical.check');

      const serialized = bb.serialize();
      const restored = Blackboard.deserialize(serialized);

      expect(restored.get('voltage')).toBe(127);
      expect(restored.get('result')).toEqual({ compliant: false });
      expect(restored.getEntry('voltage')!.source).toBe('user');
      expect(restored.size).toBe(2);
    });

    it('serialize produces plain object', () => {
      const bb = new Blackboard();
      bb.set('x', 42, 'user', 'u');
      const data = bb.serialize();
      expect(typeof data).toBe('object');
      expect(data.x.value).toBe(42);
      expect(data.x.source).toBe('user');
    });
  });

  describe('summarize', () => {
    it('returns (empty) for empty blackboard', () => {
      const bb = new Blackboard();
      expect(bb.summarize()).toBe('(empty)');
    });

    it('formats entries as key = value [source]', () => {
      const bb = new Blackboard();
      bb.set('voltage', 127, 'user', 'u');
      bb.set('compliant', false, 'tool_result', 't');
      const summary = bb.summarize();
      expect(summary).toContain('voltage = 127 [user]');
      expect(summary).toContain('compliant = false [tool_result]');
    });

    it('JSON-stringifies objects and arrays', () => {
      const bb = new Blackboard();
      bb.set('items', [1, 2, 3], 'user', 'u');
      bb.set('panel', { brand: 'Square D' }, 'user', 'u');
      const summary = bb.summarize();
      expect(summary).toContain('items = [1,2,3]');
      expect(summary).toContain('panel = {"brand":"Square D"}');
    });
  });

  describe('summarizeWithBudget', () => {
    it('truncates when over budget', () => {
      const bb = new Blackboard();
      for (let i = 0; i < 20; i++) {
        bb.set(`key_${i}`, `value_${i}`, 'cartridge_default', 'cart');
      }
      const summary = bb.summarizeWithBudget(100);
      expect(summary.length).toBeLessThanOrEqual(150); // some slack for the trailing "... (N more)"
      expect(summary).toContain('... (');
    });

    it('prioritizes user entries over cartridge_default', () => {
      const bb = new Blackboard();
      bb.set('default_val', 'low priority', 'cartridge_default', 'cart');
      bb.set('user_val', 'high priority', 'user', 'u');
      const summary = bb.summarizeWithBudget(200);
      const lines = summary.split('\n');
      // user entry should come first
      expect(lines[0]).toContain('user_val');
    });
  });
});
