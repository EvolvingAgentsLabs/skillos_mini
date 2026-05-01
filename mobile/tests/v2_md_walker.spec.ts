import { describe, expect, it } from 'vitest';
import { parseDoc, parseFrontmatter, extractToolCalls, extractCrossRefs } from '../src/lib/cartridge-v2/md_walker';

const SAMPLE_DOC = `---
id: cable_subdimensionado
title: Cable Subdimensionado
purpose: Diagnose undersized wiring
produces: diagnosis_report
next_candidates:
  - presupuesto_recableado
  - indice_diagnostico
---

## Descripcion

El cable instalado es menor al requerido por la NOM-001-SEDE.

\`\`\`tool-call
tool: electrical.checkWireGauge
args:
  breaker_amps: \${ctx.breaker_amps}
  wire_section_mm2: \${ctx.wire_section_mm2}
\`\`\`

Basado en el resultado, el cable **no cumple** con la norma.

\`\`\`tool-call
tool: safety.checkCodeCompliance
args:
  code: NOM-001-SEDE
  finding: wire_undersized
\`\`\`

## Siguiente paso

Vea [Presupuesto Recableado](#presupuesto_recableado) o vuelva al [Indice](#indice_diagnostico).
`;

describe('md_walker', () => {
  describe('parseFrontmatter', () => {
    it('parses YAML frontmatter into an object', () => {
      const fm = parseFrontmatter(SAMPLE_DOC);
      expect(fm.id).toBe('cable_subdimensionado');
      expect(fm.title).toBe('Cable Subdimensionado');
      expect(fm.purpose).toBe('Diagnose undersized wiring');
      expect(fm.produces).toBe('diagnosis_report');
      expect(fm.next_candidates).toEqual(['presupuesto_recableado', 'indice_diagnostico']);
    });

    it('returns fallback for doc without frontmatter', () => {
      const fm = parseFrontmatter('# No frontmatter here\nJust text.');
      expect(fm.id).toBe('');
      expect(fm.title).toBe('');
    });

    it('handles empty frontmatter block', () => {
      const fm = parseFrontmatter('---\n---\nBody');
      expect(fm.id).toBe('');
      expect(fm.title).toBe('');
    });
  });

  describe('extractToolCalls', () => {
    it('extracts tool-call blocks with tool name and args', () => {
      const calls = extractToolCalls(SAMPLE_DOC);
      expect(calls).toHaveLength(2);

      expect(calls[0].tool).toBe('electrical.checkWireGauge');
      expect(calls[0].args.breaker_amps).toBe('${ctx.breaker_amps}');
      expect(calls[0].args.wire_section_mm2).toBe('${ctx.wire_section_mm2}');

      expect(calls[1].tool).toBe('safety.checkCodeCompliance');
      expect(calls[1].args.code).toBe('NOM-001-SEDE');
      expect(calls[1].args.finding).toBe('wire_undersized');
    });

    it('returns empty array when no tool-call blocks', () => {
      const calls = extractToolCalls('# Just markdown\nNo tools here.');
      expect(calls).toEqual([]);
    });

    it('captures line numbers', () => {
      const calls = extractToolCalls(SAMPLE_DOC);
      // First tool-call starts after the prose
      expect(calls[0].lineNumber).toBeGreaterThan(1);
      expect(calls[1].lineNumber).toBeGreaterThan(calls[0].lineNumber);
    });
  });

  describe('extractCrossRefs', () => {
    it('extracts #id references from markdown links', () => {
      const refs = extractCrossRefs(SAMPLE_DOC);
      expect(refs).toContain('presupuesto_recableado');
      expect(refs).toContain('indice_diagnostico');
    });

    it('returns empty array when no cross-refs', () => {
      const refs = extractCrossRefs('# No links\nPlain text.');
      expect(refs).toEqual([]);
    });

    it('does not capture external links', () => {
      const refs = extractCrossRefs('[Google](https://google.com)');
      expect(refs).toEqual([]);
    });
  });

  describe('parseDoc (full)', () => {
    it('returns complete parsed structure', () => {
      const doc = parseDoc(SAMPLE_DOC);

      expect(doc.frontmatter.id).toBe('cable_subdimensionado');
      expect(doc.toolCalls).toHaveLength(2);
      expect(doc.crossRefs).toContain('presupuesto_recableado');
      expect(doc.prose.length).toBeGreaterThan(0);
    });

    it('prose blocks exclude tool-call fences', () => {
      const doc = parseDoc(SAMPLE_DOC);
      for (const block of doc.prose) {
        expect(block).not.toContain('```tool-call');
      }
    });

    it('handles doc with no tool-calls', () => {
      const simple = `---
id: intro
title: Intro
---
Just some text.
`;
      const doc = parseDoc(simple);
      expect(doc.frontmatter.id).toBe('intro');
      expect(doc.toolCalls).toHaveLength(0);
      expect(doc.prose.length).toBeGreaterThan(0);
    });
  });
});
