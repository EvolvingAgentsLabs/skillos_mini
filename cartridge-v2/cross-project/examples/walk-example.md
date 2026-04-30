# Worked walk-example: skillos_self_knowledge cartridge against a real query

This is a concrete trace of the use-mode navigator walking the
`skillos_self_knowledge` cartridge (which wraps `skillos/system/memory/strategies/`)
against a developer query. It demonstrates that the v2 navigator runtime
walks dream-generated memory the same way it walks the trade cartridges,
with no behavior changes.

The walk uses real strategies that exist on disk in this repo (verified
2026-04-29). Quotes are excerpted from actual strategy files.

---

## Inputs

- **Cartridge**: `cartridge-v2/cross-project/examples/skillos-self-knowledge.cartridge.md`
- **Source root** (verified): `/Users/agustinazwiener/evolvingagents/skillos/system/memory/strategies/`
- **User task**: "I'm splitting our system into a creation plugin and a governance plugin. What patterns and constraints should I follow?"

---

## Phase 0 — Load

The navigator:

1. Reads the manifest. Captures `source.root`, `link_conventions.id_pattern: "strat_L[0-9]_[a-z0-9-]+"`, `entry_index: derived`, `entry_strategy: by_trigger_goals`.
2. Verifies `tools_required: []` (none — this is an advisory cartridge with no determinism layer).
3. Walks the source tree's frontmatter. Builds the index. Sample entries:

```
strat_L1_separating-creation-from-governance-via-companion-plugins
  level: 1, confidence: 0.65
  trigger_goals: [companion plugin, control plane, governance separation, sysctl, creation vs governance, plugin architecture]

strat_L2_companion-plugin-boundary-design
  level: 2, confidence: 0.6
  trigger_goals: [plugin boundary, companion plugin, plugin interface, sysctl boundary, plugin split, plugin marketplace, creation governance boundary]

strat_L2_meta-task-split-architecture
  level: 2, confidence: ...
  trigger_goals: [meta-task, task split, architecture]

...22 more strategies
```

4. Reads `_negative_constraints.md`. Captures the NC list (NC1..NCn) with severity and context.

Phase 0 cost: one frontmatter scan of ~30 files + one read of `_negative_constraints.md`. Cheap.

---

## Phase 1 — Route

User task contains "creation plugin", "governance plugin", "patterns". Match against L1 strategies' `trigger_goals`:

- `strat_L1_separating-creation-from-governance-via-companion-plugins` → strong match on "creation vs governance", "companion plugin"
- `strat_L1_designing-self-improving-agent-systems` → weak match (different concern)
- `strat_L1_lifecycle-management-for-markdown-os-artifacts` → tangential

**Entry selected**: `strat_L1_separating-creation-from-governance-via-companion-plugins`.

```
entry_selected: strat_L1_separating-creation-from-governance-via-companion-plugins
entry_reason: Direct match on "creation vs governance" and "companion plugin" trigger goals.
candidate_alternatives: [strat_L1_lifecycle-management-for-markdown-os-artifacts]
```

---

## Phase 2 — Walk loop

### Hop 1: `strat_L1_separating-creation-from-governance-via-companion-plugins`

Read the body. Extract:

**relevant_facts:**

- "The architectural pattern for building a markdown OS where the system that creates agents and the system that evaluates, scores, evolves, and prunes those agents are separate plugins with distinct command namespaces, agent pools, and write scopes."
- 5 numbered steps covering: identify the boundary, design the creation plugin, design the governance plugin, enforce write-scope (NC38), separate command namespaces (NC39).
- Verbatim from the doc: "Creation needs write access to specs; governance must not have write access."
- Verbatim: "It has READ access to agent specs and traces, and WRITE access only to its own output directory."

**cross_link_candidates:**

- `strat_L2_meta-task-split-architecture` (cited as "theoretical foundation")
- `strat_L1_designing-self-improving-agent-systems` (cited as "the epic this implements")
- `strat_L2_control-plane-agent-pipeline` (cited as "internal architecture of the governance plugin")
- `strat_L2_companion-plugin-boundary-design` (cited as "the technical boundary specification")

**nc_touched:**

- NC38 (write-scope boundary)
- NC39 (command namespace separation)
- (Both have severity: high in `_negative_constraints.md`.)

### Decide

- **Q1 (have enough?)**: I have the L1 framing and 5 steps but the user asked for *patterns and constraints*. The L1 doc gives the pattern; I should walk the L2 boundary-design doc for the technical specifics, and confirm the NCs surface clearly. Q1 = NO.
- **Q2 (best next link?)**: `strat_L2_companion-plugin-boundary-design` — direct match on "the technical boundary specification" the user is asking for. Confidence 0.6, descending L1 → L2 = level-correct.
- **Walk it.**

### Hop 2: `strat_L2_companion-plugin-boundary-design`

Read the body. Extract:

**relevant_facts:**

- "Both plugins operate on the same project filesystem."
- Concrete owned-paths table:
  - Creation plugin owns: `system/skills/`, `system/memory/traces/`, `system/memory/strategies/`, `projects/[Project]/components/agents/`, `projects/[Project]/memory/`
  - Governance plugin owns: `projects/[Project]/output/sysctl/`
- Implies the contract: governance never writes outside `output/sysctl/` even though it reads everywhere.

**cross_link_candidates** (none materially new this hop — the doc closes the topic at L2 specificity).

**nc_touched:**

- NC38 already touched. Re-affirms it via the owned-paths spec.

### Decide

- **Q1**: Now I have the L1 pattern + the L2 technical boundary + the NCs. The user asked for "patterns and constraints" — that's covered.
- **Q1 = YES**, terminate. Go to Phase 3.

---

## Phase 3 — Synthesis

Output (the user-visible part of the walk):

```markdown
## Answer

The pattern for splitting a markdown-OS-style system into a creation plugin and a governance plugin is documented in `strat_L1_separating-creation-from-governance-via-companion-plugins`. The core idea: every agent system has two activities that differ in trust model and invocation frequency — (a) creating and executing domain agents, and (b) evaluating, scoring, evolving, and pruning them. These belong in separate plugins with distinct command namespaces, agent pools, and write scopes.

Concretely, in your split:

1. **Creation plugin** owns task execution: the kernel command (`/skillos`), the system-agent for goal decomposition, domain agents for execution, project scaffolding, skill-tree management, and trace logging. It has full write access to agent specs, project files, and memory under `system/skills/`, `system/memory/traces/`, `system/memory/strategies/`, `projects/[Project]/components/agents/`, and `projects/[Project]/memory/`.

2. **Governance plugin** owns evaluation: the governance command (`/sysctl`), security audit, performance scoring, controlled evolution, lifecycle, and memory compaction. Its agents are evaluation-specific (SecurityAuditAgent, PerformanceScorecardAgent, EvolutionControlAgent, LifecycleManagerAgent). It has READ access to agent specs and traces but WRITE access only to its own output directory: `projects/[Project]/output/sysctl/`.

3. **The write-scope boundary is enforced in code, not prose** — the governance plugin's tools physically cannot reach outside `output/sysctl/`. All proposed changes go to output files (audit_report.md, scorecard.md, evolution_proposals.md, prune_candidates.md). A human reviews and applies approved proposals using the creation plugin. This puts the human-in-the-loop gate at the architectural boundary, not just the prompt level.

4. **Command namespaces stay distinct** — `/skillos` for "do work", `/sysctl` for "evaluate work". Conflating them is the silent failure mode where a governance prompt accidentally creates an agent.

## Sources walked

| # | doc_id | level | why this doc | confidence |
|---|--------|-------|--------------|-----------|
| 1 | strat_L1_separating-creation-from-governance-via-companion-plugins | 1 | Direct match on user task; provides the pattern + 5-step decomposition | 0.65 |
| 2 | strat_L2_companion-plugin-boundary-design | 2 | Cited as "the technical boundary specification"; provides owned-paths table | 0.6 |

## Constraints touched

- **NC38** (severity: high): "Write-scope boundary — governance plugin must NEVER directly modify agent files it evaluates. All changes are proposals; human reviews and applies." — Surface this in the answer because the user is about to design the boundary.
- **NC39** (severity: high): "Command namespaces must be distinct — creation and governance must have separate entry points to prevent accidental conflation." — Same.

Both NCs are surfaced inline in the answer above (points 3 and 4 respectively).

## Unmet links (gap report)

None — every cross-link referenced in walked bodies resolved to a doc in the frontmatter index.

## Walk meta

- hops_used: 2
- termination_reason: synthesis_ready
- candidate_alternatives_at_entry: [strat_L1_lifecycle-management-for-markdown-os-artifacts]
```

---

## What this walk demonstrates

1. **Same navigator, different cartridge.** The walk above uses the use-mode spec (`skillos_mini/cartridge-v2/runtime/use-mode.md`) without modification. The trade cartridges and the self-knowledge cartridge differ only in their MANIFEST.md.

2. **No memory generation changes.** Every doc walked exists in `skillos/system/memory/strategies/` today. The dream engine produced this content as part of its normal consolidation. The cartridge wrapper is a 100-line manifest.

3. **Tools-not-required cartridges work too.** This walk had `tools_required: []`. The navigator's tool-execution phase (use-mode spec §5.2) becomes a no-op; the walk is pure prose+cross-links. For regulated trades with tool calls, the same loop runs with tool execution in step 5.2.

4. **NCs surface as advisory.** Without enforcement (no validators), the navigator surfaces touched NCs in the synthesis. The user is informed; whether they comply is on them. This is the right design for advisory cartridges — *enforcement* belongs to regulated cartridges with real tool calls.

5. **The dream engine is implicit cartridge author.** Every dream cycle creates new strategies. Every new strategy auto-extends the cartridge — no rebuild step. The cartridge improves over time without any code change.

---

## What's next (not implemented)

- Wire the navigator into a slash command in skillos / llmunix-dreamos: `/walk skillos_self_knowledge "user task"` → runs this loop and prints the synthesis. Mechanical follow-up.
- Add nav traces back into the dream-engine's input. Frequent walk paths consolidate into higher-level routing strategies; unmet links signal generation gaps. Closes the dream loop on the cartridge runtime.
- Cross-cartridge composition: when a regulated trade cartridge (electricista) needs background advisory knowledge (e.g., "what's the latest UTE norm interpretation"), it can call into a memory cartridge as a sub-walk. Same runtime; cartridges-as-tools.
