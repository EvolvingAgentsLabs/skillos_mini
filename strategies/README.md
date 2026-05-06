# Strategy markdown cartridges

Each `.md` file here is a **strategy cartridge** — a markdown document with YAML frontmatter that customizes how the LLM-CPU plays a specific game. The body of the markdown is prepended to the demo's `SYSTEM_PROMPT` before the model loads.

## File format

```markdown
---
target: tetris            # game id (tetris | scavenger)
id: well-filler           # unique slug — referenced as ?strategy=<id>
name: Well Filler         # display name
description: ...          # one-line summary for the launcher card
---

# Strategy: Well Filler

...prose strategy guidance the LLM reads...
```

## How the launcher loads them

[`mobile/src/components/GamesLauncher.svelte`](../mobile/src/components/GamesLauncher.svelte) reads [`index.json`](index.json) at startup, renders a card per strategy under each game. Each card is a plain `<a href>` to `/demos/<game>/index.html?strategy=<id>` — clicking navigates the same tab. Browser back button returns to the launcher.

The bundled demo at `mobile/public/demos/<game>/index.html` reads the URL param, fetches `/strategies/<game>/<id>.md`, parses the body (after the second `---`), and prepends it to `SYSTEM_PROMPT` before the model loads.

## Authoring a new strategy

1. Create `<game>/<id>.md` with the frontmatter shown above.
2. Append an entry to [`index.json`](index.json) under the appropriate game.
3. Refresh the launcher.

The body is plain prose. No code, no schemas, no validators. The grammar enforcement layer guarantees output validity regardless of what the strategy says — strategies can only steer *which* valid opcode the LLM picks, never produce invalid ones.

## Out of scope (per CLAUDE.md §3)

Strategy cartridges do **not**:
- Add new methods to a cartridge (those are kernel-level, in `_cart/game/<name>/manifest.json`).
- Trigger code execution.
- Override the Program-layer planners (those compute deterministically from game state and are authoritative).

If you need behavior a strategy cartridge can't express, push the logic into the Program layer instead.
