---
type: cartridge
version: 2
id: skillos_self_knowledge
title: skillos — Self-knowledge cartridge
language: en
description: >
  The dream-engine consolidated memory of skillos packaged as a v2 cartridge,
  pointing at `skillos/system/memory/strategies/`. Demonstrates that a project's
  hierarchical markdown memory is directly usable as a cartridge — no generation
  changes needed.

# This cartridge is not a directory of new markdown — it's a manifest that
# wraps an existing memory tree as a cartridge. The use-mode navigator reads
# from `source.root` instead of from this file's siblings.

source:
  root: /Users/agustinazwiener/evolvingagents/skillos/system/memory/strategies
  read_only: true
  link_conventions:
    id_pattern: "strat_L[0-9]_[a-z0-9-]+"
    resolve: by_id
    bidirectional: false

entry_intents:
  - how does skillos handle X
  - why was this strategy adopted
  - what's the standard pattern for Y in skillos
  - which negative constraints apply to Z
  - what did the dream engine learn about W
  - skillos governance design
  - companion plugin pattern

entry_index: derived             # navigator builds from level_1_epics/* frontmatter
entry_strategy: by_trigger_goals

frontmatter_schema:
  required: [id, hierarchy_level, title]
  optional:
    - trigger_goals
    - confidence
    - preconditions
    - source_traces
    - deprecated
    - dream_id
    - success_count
    - failure_count

# This memory tree has no tool calls (it's pure prose with cross-links).
# The navigator walks it as advisory; no determinism layer required.
tools_required: []
tools_optional: []

# The dream engine's negative-constraints file is the equivalent of the
# trade cartridges' safety/ subtree. Surface NCs touched during walks.
constraints_doc: _negative_constraints.md
constraints_format: nc_block       # NC<n>: ... pattern parsing

# Confidence comes from each strategy's frontmatter `confidence` field.
prefer_higher_confidence: true

navigation:
  max_hops: 8
  termination_signal: synthesis_ready

# This cartridge "was generated" in the sense that the dream engine produced
# its source tree. The cartridge author is the dream engine, not a human.
generated: true
generated_by: skillos DreamEngineAgent (multiple cycles)
generated_at: continuous

# Origin: the file paths under source.root in the host filesystem at the
# time of last consolidation. The dream journal records each cycle's outputs.
source_changelog: _dream_journal.md
---

# skillos — Self-knowledge cartridge

This is a cartridge that wraps the system's own consolidated memory and
makes it walkable by the same v2 use-mode navigator that walks the trade
cartridges (electricista, plomero, pintor).

## Source tree (verified, 2026-04-29)

```
skillos/system/memory/strategies/
├── _dream_journal.md              # changelog
├── _negative_constraints.md       # NC1..NCn, severity-ranked rules
├── level_1_epics/                 # 6 strategies (broadest)
│   ├── designing-security-audit-agents-for-markdown-os.md
│   ├── designing-self-improving-agent-systems.md
│   ├── landing-stale-pr-on-diverged-main.md
│   ├── lifecycle-management-for-markdown-os-artifacts.md
│   ├── separating-creation-from-governance-via-companion-plugins.md
│   └── validating-pure-markdown-planning-specs.md
├── level_2_architecture/          # 10 strategies
├── level_3_tactical/              # 10+ strategies
└── level_4_reactive/              # tactical recipes
```

## Frontmatter properties already present

Sample (from `level_1_epics/separating-creation-from-governance-via-companion-plugins.md`):

```yaml
---
id: strat_L1_separating-creation-from-governance-via-companion-plugins
version: 1
hierarchy_level: 1
title: Separating Creation from Governance via Companion Plugins
trigger_goals:
  - companion plugin
  - control plane
  - governance separation
  - sysctl
  - creation vs governance
  - plugin architecture
preconditions:
  - system has a primary creation/execution plugin
  - system generates observable execution traces
confidence: 0.65
success_count: 1
failure_count: 0
source_traces: [sysctl.md, sysctl/README.md, ...]
deprecated: false
dream_id: dream_20260428_a7f3
---
```

This is the v2 cartridge format **with a different naming convention** for
the level field (`hierarchy_level: 1` vs the trade cartridges' implicit
directory nesting). Both shapes are isomorphic; the navigator handles them
via `frontmatter_schema` declared above.

## Cross-link convention (verified)

Inline prose in level_1 strategies references other strategies by id:

> "This pattern is the plugin-level manifestation of the Meta/Task Split
> Architecture (strat_L2_meta-task-split-architecture). Where the meta/task
> split separates 'the agent that improves' from 'the agent that executes,'
> the companion plugin pattern separates 'the system that creates' from
> 'the system that governs' at the deployment and namespace level."
>
> "Related strategies: strat_L2_meta-task-split-architecture (theoretical
> foundation), strat_L1_designing-self-improving-agent-systems (the epic
> this implements), strat_L2_control-plane-agent-pipeline (the internal
> architecture of the governance plugin), strat_L2_companion-plugin-boundary-design
> (the technical boundary specification)."

The id pattern `strat_L<N>_<slug>` is exactly what the navigator's
`link_conventions.id_pattern` regex resolves. Cross-link bidirectionality is
**not** maintained today (one-way prose references), so the manifest sets
`bidirectional: false`.

## Negative constraints (NCs)

`_negative_constraints.md` contains:

```
### NC1: Never rewrite entire specifications during self-improvement
- **Context**: self-improving systems, agent spec modifications
- **Severity**: high
- **Learned From**: auto-improve-meta-agent.md "NEVER propose" rules
- **Dream ID**: dream_20260426_a7f3
- **Rationale**: ...
```

The navigator reads this file once at session start (per the use-mode spec
phase 0) and surfaces any NC touched during the walk.

## Use cases

This cartridge is what makes a developer ask:

- "What's the standard pattern for splitting creation from governance?" →
  navigator routes by `trigger_goals` to `strat_L1_separating-creation-from-
  governance-via-companion-plugins`, walks down to L2/L3 supporting strategies,
  surfaces NC38/NC39 (write-scope boundary, namespace separation), synthesizes.

- "Why did we adopt the auto-improve architecture?" → routes to
  `strat_L1_designing-self-improving-agent-systems`, walks the L2 supporting
  strategies including `strat_L2_meta-task-split-architecture` and
  `strat_L2_evidence-grounded-improvement-pipeline`, surfaces NC1-NC4
  (the safeguards), synthesizes.

## Why this matters for the unified runtime

The same v2 use-mode navigator that walks `skillos_mini/cartridge-v2/cartridges/electricista/`
walks this cartridge. Same code, different cartridge. The cartridge shape is
the bridge: trade cartridges are authored; memory cartridges are generated;
both are markdown trees with frontmatter and cross-links.

A future skillos developer types `walk skillos_self_knowledge "how do we
handle write-scope boundaries between plugins?"` and gets a synthesized
answer drawn from L1 → L2 → L3 strategies, with NC38 surfaced if relevant,
no fabrication. That's a self-knowledgeable system without any code changes
to how memory is generated.
