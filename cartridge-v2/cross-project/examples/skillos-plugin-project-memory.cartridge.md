---
type: cartridge
version: 2
id: skillos_plugin_project_memory
title: skillos_plugin — Per-project SmartMemory cartridge
language: en
description: >
  Wraps a skillos_plugin project's SmartMemory long_term/ tree as a v2
  cartridge. One cartridge per project — instantiated by the runtime
  whenever a project has a `memory/long_term/` directory with consolidated
  learnings.

# Templated path: ${project_root} is interpolated by the runtime when
# instantiating this cartridge for a specific project.
source:
  root: ${project_root}/memory/long_term
  read_only: true
  link_conventions:
    id_pattern: "[a-z][a-z0-9_-]+"
    resolve: by_filename
    bidirectional: false

entry_intents:
  - what did this project learn
  - which agent template should I use for X
  - what's the workflow pattern for Y
  - what domain knowledge does this project have
  - has this project failed at Z before

entry_index: project_learnings.md
entry_strategy: explicit

# SmartMemory's long_term tree is already organized:
#   project_learnings.md       # the natural entry index
#   agent_templates/           # reusable agent specs
#   workflow_patterns/         # cross-task patterns
#   domain_knowledge/          # the knowledge layer most aligned with cartridge use
#
# These map naturally to v2 sub-tree directories.

frontmatter_schema:
  required: [id]
  optional:
    - title
    - tags
    - source_session
    - confidence
    - timestamp

tools_required: []
tools_optional: []

constraints_doc: null    # SmartMemory doesn't yet emit a NC equivalent;
                         # the dream-engine in skillos does. When skillos_plugin
                         # adds NC consolidation, set this.

prefer_higher_confidence: true

navigation:
  max_hops: 6              # SmartMemory trees tend to be shallower than skillos
  termination_signal: synthesis_ready

generated: true
generated_by: skillos_plugin MemoryConsolidationAgent (per project)
generated_at: per consolidation cycle

source_changelog: null
---

# skillos_plugin — Per-project SmartMemory cartridge

`skillos_plugin/skillos-plugin/system_files/SmartMemory.md` defines the layout:

```
projects/[Project]/memory/
├── short_term/            # raw interaction logs (timestamped)
└── long_term/             # consolidated learnings (this is the cartridge source)
    ├── project_learnings.md
    ├── agent_templates/
    │   └── [agent_name].md
    ├── workflow_patterns/
    │   └── [pattern_name].md
    └── domain_knowledge/
        └── [topic].md
```

Each `.md` file has minimal frontmatter today (id at most), but the bodies
are coherent prose with cross-references. The use-mode navigator walks this
tree the same way it walks skillos's strategies/, with one difference:
SmartMemory cross-links are by filename (or basename) rather than by
strat_L<N>_<slug> id. The manifest sets `link_conventions.resolve: by_filename`.

## Per-project instantiation

The runtime, when asked "load the memory cartridge for project X", does:

1. Resolve `${project_root}` to `projects/X/`.
2. Verify `${project_root}/memory/long_term/project_learnings.md` exists.
3. Load this manifest with the substitution applied.
4. Hand to the navigator.

This is how the same v2 runtime serves N projects without needing N
hand-authored cartridges. The cartridge is the consolidation pipeline's
output; the manifest is the wrapper that exposes it.

## Use case

A developer working in project X asks: "Has this project ever encountered
the lifecycle issue I'm seeing now?" The runtime instantiates this cartridge
for project X. The navigator routes by `trigger_goals` (matching against
the developer's prose) to the most relevant entry in `domain_knowledge/`
or `workflow_patterns/`. It walks down, reads supporting docs, surfaces
the answer with citations to file names.

No new cartridge author. No memory-generation change. The MemoryConsolidationAgent
in `skillos_plugin/skillos-plugin/agents/MemoryConsolidationAgent.md` keeps
doing what it does; this manifest is what makes its output queryable through
the same interface as the trade cartridges on the phone.

## Forward-looking: NC equivalent for skillos_plugin

Today skillos_plugin's SmartMemory does not emit a `_negative_constraints.md`.
The skillos repo (parent design) does. When skillos_plugin adopts the same
constraint-extraction step, set `constraints_doc: _negative_constraints.md`
in this manifest and the navigator will surface NCs touched during walks.

This is the natural next dream-engine evolution: failure traces consolidate
into negative constraints alongside positive strategies. Cartridge format
is unchanged.
