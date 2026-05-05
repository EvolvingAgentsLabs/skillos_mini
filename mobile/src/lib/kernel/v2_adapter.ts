/**
 * v2_adapter.ts
 *
 * Translates a skillos_mini v2 cartridge (markdown MANIFEST + per-method .md
 * files + optional JSON schemas) into the llm_os kernel manifest format
 * (JSON: name, methods.{m}.opcodes[]).
 *
 * The adapter is a pure function: caller passes pre-loaded data, gets
 * back a kernel-format manifest plus a report of which methods were
 * synthesizable. It does not touch the filesystem — loading is the
 * integrator's responsibility (Vite asset import, fetch, fs in tests).
 *
 * The kernel needs ENUMERABLE opcode strings. v2 cartridges declare
 * methods with arg schemas; this module synthesizes the cross-product of
 * any `enum`-constrained args to generate concrete opcode strings. If a
 * required arg is non-enumerable (free-form string, number, etc.), the
 * method is reported as "non-enumerable" and skipped — kernel-mode for
 * that cartridge would need either schema tightening or a future
 * templated-opcode sampling extension.
 */

export type V2MethodSchema = {
  type?: 'object';
  required?: string[];
  properties?: Record<string, V2PropertySchema>;
  additionalProperties?: boolean;
};

export type V2PropertySchema = {
  type?: string;
  enum?: unknown[];
  default?: unknown;
};

export type V2MethodInput = {
  /** YAML frontmatter parsed from the method's .md file (informational). */
  frontmatter?: Record<string, unknown>;
  /** Optional summary copied into kernel manifest's method.summary. */
  summary?: string;
  /** Optional JSON Schema for args. Required for kernel-mode opcode synthesis. */
  schema?: V2MethodSchema;
};

export type V2CartridgeInput = {
  /** Cartridge id from MANIFEST frontmatter (e.g. "vision"). */
  id: string;
  /** Cartridge title or short description. */
  title?: string;
  description?: string;
  version?: string;
  methods: Record<string, V2MethodInput>;
};

export type KernelMethodManifest = {
  summary?: string;
  args_schema?: string;
  opcodes: string[];
};

export type KernelManifest = {
  name: string;
  version: string;
  description?: string;
  methods: Record<string, KernelMethodManifest>;
  halt: string[];
};

export type AdapterReport = {
  manifest: KernelManifest;
  /** Methods with synthesizable enumerable opcodes — included in manifest. */
  enumerable: string[];
  /** Methods skipped (non-enum args). Caller may need to add JSON Schema
   *  enums or accept that kernel-mode can't host them yet. */
  skipped: { method: string; reason: string }[];
  /** Total opcode count across all methods (for trie size budgeting). */
  totalOpcodes: number;
};

/** Default halt strings — match the kernel's defaults exactly. */
export const DEFAULT_HALT = [
  '<|halt|>status=success\n',
  '<|halt|>status=failure\n',
  '<|halt|>status=partial\n',
];

/**
 * Cartesian product of arrays. Used to enumerate the {arg1, arg2, ...}
 * combinations from per-arg enum value sets.
 */
function cartesian<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  const [first, ...rest] = arrays;
  const restProduct = cartesian(rest);
  const out: T[][] = [];
  for (const item of first) {
    for (const r of restProduct) {
      out.push([item, ...r]);
    }
  }
  return out;
}

/**
 * Given a method's JSON Schema, attempt to synthesize all enumerable
 * opcode strings. Returns null if the schema has any required arg that
 * is not enum-constrained (caller cannot enumerate).
 */
export function synthesizeOpcodes(
  cartridgeName: string,
  methodName: string,
  schema: V2MethodSchema | undefined,
): string[] | null {
  // No schema or no properties → emit a single empty-args opcode.
  // ({}). This handles ping/observe/reset-style methods.
  if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
    return [`<|call|>${cartridgeName}.${methodName} {}<|/call|>\n`];
  }

  const required = schema.required ?? [];
  const propEntries = Object.entries(schema.properties);

  // Build per-property enum lists. Required props MUST be enum-constrained.
  const propValueSets: { name: string; values: unknown[]; required: boolean }[] = [];
  for (const [propName, propSchema] of propEntries) {
    const isRequired = required.includes(propName);
    if (propSchema.enum && propSchema.enum.length > 0) {
      propValueSets.push({ name: propName, values: propSchema.enum, required: isRequired });
    } else if (isRequired) {
      // A required, non-enum arg → cannot enumerate.
      return null;
    } else {
      // Optional non-enum: skip (omit from synthesized opcodes).
    }
  }

  if (propValueSets.length === 0) {
    return [`<|call|>${cartridgeName}.${methodName} {}<|/call|>\n`];
  }

  // Cross-product enum values across all required props. Optional enums
  // also enumerate (we generate the with-and-without combinations).
  // For simplicity in v1, we treat all collected props as part of the
  // cross-product; callers wanting "with-or-without optional" can add
  // a 'null' sentinel to the enum list.
  const valueArrays = propValueSets.map(p => p.values);
  const combinations = cartesian(valueArrays);

  const opcodes: string[] = [];
  for (const combo of combinations) {
    const argsObj: Record<string, unknown> = {};
    for (let i = 0; i < propValueSets.length; i++) {
      argsObj[propValueSets[i].name] = combo[i];
    }
    opcodes.push(`<|call|>${cartridgeName}.${methodName} ${JSON.stringify(argsObj)}<|/call|>\n`);
  }
  return opcodes;
}

/**
 * Translate a v2 cartridge into a kernel-format manifest. Reports which
 * methods were synthesizable and which were skipped.
 */
export function v2ToKernelManifest(input: V2CartridgeInput): AdapterReport {
  const methods: Record<string, KernelMethodManifest> = {};
  const enumerable: string[] = [];
  const skipped: { method: string; reason: string }[] = [];
  let totalOpcodes = 0;

  for (const [methodName, methodInput] of Object.entries(input.methods)) {
    const opcodes = synthesizeOpcodes(input.id, methodName, methodInput.schema);
    if (opcodes === null) {
      skipped.push({
        method: methodName,
        reason: 'has required non-enumerable args (free-form string/number/etc.); add JSON Schema enum or wait for templated-opcode support',
      });
      continue;
    }
    methods[methodName] = {
      summary: methodInput.summary,
      args_schema: `schemas/${methodName}.args.schema.json`,
      opcodes,
    };
    enumerable.push(methodName);
    totalOpcodes += opcodes.length;
  }

  const manifest: KernelManifest = {
    name: input.id,
    version: input.version ?? '0.0.0',
    description: input.description ?? input.title,
    methods,
    halt: [...DEFAULT_HALT],
  };

  return { manifest, enumerable, skipped, totalOpcodes };
}
