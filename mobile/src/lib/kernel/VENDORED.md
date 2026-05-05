# Vendored from llm_os

This directory is a snapshot of [`llm_os/kernel/`](https://github.com/EvolvingAgentsLabs/llm_os/tree/main/kernel) at commit `08aca1b` (branch `feat/kernel-extraction`).

## Why vendored, not npm

The kernel is pure JS, has no build step, and exists in a sibling repo (`c:/evolvingagents/llm_os`). Publishing as an npm package would add release ceremony for what is currently a single-author, fast-moving module. **Pulling it in as ESM via Vite is enough.**

When the kernel API stabilizes (post-v0.2 of llm_os) we should publish it as `@evolvingagents/llm-os-kernel` and switch this folder to a pinned npm dep. Until then: refresh by re-copying.

## Refreshing the snapshot

```bash
# from skillos_mini repo root
cp -r ../llm_os/kernel/* mobile/src/lib/kernel/
# then update the commit pin in this file
```

## Local divergence policy

**Don't.** All edits go upstream first to `llm_os/kernel/`, then re-vendor. If you find a bug in the kernel while working in skillos_mini, fix it in llm_os, commit, then refresh here. Local edits silently fork the kernel and the convergence story dies.

## Per-CLAUDE.md compliance

- No new top-level npm dependency (§12). The kernel is pure JS, ESM, zero deps.
- No outbound network at runtime. The kernel is text-in / token-out — wllama/network calls are the caller's responsibility.
- Privacy invariants (§9.3) unchanged — kernel doesn't add any I/O.
