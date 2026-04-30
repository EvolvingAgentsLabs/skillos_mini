---
type: cartridge
version: 2
id: skillos_systemcontrol_governance
title: skillos_systemcontrol — Per-project governance history cartridge
language: en
description: >
  Wraps a project's accumulated /sysctl governance reports as a v2 cartridge.
  Each session of audit / score / evolve / prune produces markdown reports;
  over months these accumulate into a queryable governance history. The
  navigator can answer "why was agent X deprecated?" by walking from the
  latest health report back to the originating audit findings.

source:
  root: ${project_root}/output/sysctl
  read_only: true
  link_conventions:
    id_pattern: "[a-z_]+_(\\d{8})_([a-f0-9]+)"   # e.g. audit_report_20260428_a3f2
    resolve: by_filename
    bidirectional: true        # reports cross-cite each other heavily

entry_intents:
  - why was agent X deprecated
  - what did the last security audit find
  - which agents are underperforming
  - what's the governance history of this project
  - what evolution proposals were rejected and why
  - sysctl health report

# The "latest" entry index is computed at load time: pick the most recent
# health_report.md or score_summary.md by filename timestamp.
entry_index: latest_health_report
entry_strategy: temporal_latest

frontmatter_schema:
  required: [id]
  optional:
    - title
    - generated_by_mode      # AUDIT | SCORE | EVOLVE | PRUNE | COMPACT | REPORT
    - timestamp
    - cites                  # list of report ids this one references
    - cited_by               # list of report ids that reference this one (computed)

tools_required: []
tools_optional: []

constraints_doc: null

# Governance reports have implicit confidence (newer reports supersede older
# on the same topic). Use temporal recency, not frontmatter confidence, as
# the tie-breaker.
prefer_higher_confidence: false
prefer_recency: true

navigation:
  max_hops: 10              # governance walks can chain across many reports
  termination_signal: synthesis_ready

generated: true
generated_by: skillos_systemcontrol_plugin (multi-mode pipeline)
generated_at: per /sysctl invocation

source_changelog: null      # the directory listing IS the changelog
---

# skillos_systemcontrol — Per-project governance history

`skillos_systemcontrol_plugin/skillos-systemcontrol-plugin/commands/sysctl.md`
runs in modes (AUDIT, SCORE, EVOLVE, PRUNE, COMPACT, REPORT, FULL) and emits
markdown reports under `projects/${project}/output/sysctl/`. Over time the
directory accumulates:

```
projects/X/output/sysctl/
├── audit_report_20260128_a3f2.md
├── audit_report_20260225_b1c7.md
├── scorecard_20260228_d2e9.md
├── evolution_proposals_20260301_e4f1.md       # cites scorecard
├── prune_candidates_20260315_f5a3.md          # cites scorecard + evolution
├── audit_report_20260328_g6b4.md
├── scorecard_20260401_h7c5.md
├── health_report_20260415_i8d6.md             # cites everything
└── ...
```

Reports cross-cite by filename (e.g., `evolution_proposals_20260301_e4f1.md`
contains "based on findings from audit_report_20260225_b1c7.md and
scorecard_20260228_d2e9.md, we propose..."). The id pattern in the
manifest's `link_conventions` matches `<mode>_<YYYYMMDD>_<short_hash>` —
the navigator resolves cross-links by exact filename match.

## Why bidirectional crosslinks matter here

Unlike skillos strategies (one-way prose references) or SmartMemory
(filename refs forward only), governance reports are heavily back-cited:

- A scorecard cites the trace IDs of failed agent runs.
- An evolution proposal cites the scorecard finding it's responding to.
- A prune candidate cites the evolution proposal that gave up on the agent.
- A health report cites the cumulative outcome.

When the navigator walks "why was agent X deprecated?", it starts from the
latest `prune_candidates_*.md` mentioning agent X, walks back through cited
evolution proposals, back to the scorecard that flagged it, back to the
audit findings that started the chain. That's bidirectional walking through
a temporal trail.

The manifest sets `bidirectional: true` to allow this; the navigator
permits ascending links when the user task explicitly asks for history
(versus "current state", which prefers descending).

## Temporal recency as tie-breaker

If the navigator is choosing between two reports on the same topic
(e.g., two scorecards that both score agent X), the more recent one wins.
This differs from skillos's `confidence` field — there, an old high-confidence
strategy still beats a recent low-confidence one. In governance, "latest
view" is canonical.

The manifest sets `prefer_recency: true` to enforce this.

## Use cases

- "Why is agent CodeReviewAgent at score 0.4 in this project?" → navigator
  finds latest scorecard, walks to the failure-taxonomy classification,
  walks to source traces that surfaced the failures, synthesizes "Type 3
  failure: hallucinating file paths in 4 of last 8 reviews" with citations
  to the trace ids and the scorecard.

- "What evolutions have we tried for agent X?" → navigator collects all
  `evolution_proposals_*.md` mentioning agent X, walks bidirectionally to
  see which ones became applied changes (cited in subsequent scorecards
  with score deltas) versus rejected (cited in subsequent rejection notes),
  synthesizes a timeline.

- "Are there any agents at risk of pruning?" → navigator reads latest
  `prune_candidates_*.md` and `scorecard_*.md`, surfaces any agent in
  both, ranks by composite score.

## Why this is harder than skillos's strategies

Governance memory has more file types and more interlinks than dream-engine
strategies. The navigator needs to handle:

- Multiple modes (AUDIT, SCORE, EVOLVE, PRUNE, COMPACT, REPORT) with
  different semantics — captured in `frontmatter.generated_by_mode`.
- Temporal supersession — captured in `prefer_recency`.
- Bidirectional walks — captured in `link_conventions.bidirectional`.

The v2 cartridge format accommodates all of these via manifest
configuration. No special-case code in the navigator.

## Forward-looking: governance dream consolidation

Today governance reports accumulate as raw artifacts. A future
DreamEngineAgent inside skillos_systemcontrol could consolidate the most-
referenced findings into higher-level "governance strategies" — patterns
of agent failure, recurring evolution-rejection rationale, lifecycle
heuristics. Those would form a `level_*/` substructure inside the same
directory. The cartridge manifest would gain `frontmatter_schema.optional:
hierarchy_level`, and the navigator would walk it like skillos's strategies.

The cartridge format does not change. The dream consolidation step plugs in
as an additional source.
