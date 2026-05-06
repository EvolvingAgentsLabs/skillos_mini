# Testing skillos_mini

Two surfaces to test:

1. **The launcher** — the Svelte app at `/`. Lists games and strategies; clicking a card navigates to the demo in the same tab. Browser back button returns to the launcher.
2. **The bundled demos** — at `/demos/<game>/index.html[?strategy=<id>]`. The actual model + kernel.

## Test 1 — launcher renders strategies

```bash
cd mobile
npm install
npm run dev
```

Open <http://localhost:5173>. Expected: the page shows two game sections (Tetris, Scavenger), each with a "No strategy" baseline card and three named strategy cards. Hover changes border to green.

If the page shows `Failed to load strategies index`, the `predev` step didn't run — `npm run dev` should run it automatically. Run `node scripts/copy-strategies.mjs` manually if needed.

## Test 2 — Tetris with a strategy

In the launcher, click any Tetris card (e.g. **Well Filler**). The page navigates to `/demos/tetris/index.html?strategy=well-filler`.

1. Click **Load Model**. ~230 MB download on first run (cached after).
2. Open DevTools console. Look for `[strategy] loaded "well-filler" — N chars` after model load. Confirms the strategy markdown was fetched and parsed.
3. Click **Auto Play**. The model plays.

Compare against the no-strategy baseline (open `/demos/tetris/` directly without `?strategy`). Different placement preferences should be visible.

## Test 3 — Scavenger with a strategy

In the launcher, hit browser back if needed to return from Test 2, then click any Scavenger card. The page navigates to `/demos/scavenger/index.html?strategy=cautious` (or whichever).

1. **Load Model** → cached.
2. Console shows `[strategy] loaded "cautious" — N chars`.
3. **Auto Play**. The model navigates the grid using the BFS-computed `next_step.dir` per the strategy.

## Test 4 — strategy parser tolerates missing strategy

Open `/demos/tetris/index.html?strategy=does-not-exist` directly in the address bar. Console should show `[strategy] /strategies/tetris/does-not-exist.md → 404`. Demo continues with the default `SYSTEM_PROMPT`. No crash.

## Test 5 — production build

```bash
cd mobile
npm run build
npm run preview
```

Same launcher + demos available at the preview URL. The static-asset paths resolve in the production bundle.

## What is NOT tested here

- **`llm_os` upstream demos** — those run independently. See [`../llm_os/README.md`](https://github.com/EvolvingAgentsLabs/llm_os/blob/main/README.md).
- **`skillos_robot`** — separate repo, separate test path.
