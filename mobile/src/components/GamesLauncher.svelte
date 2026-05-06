<script lang="ts">
  import { onMount } from "svelte";

  type StrategyMeta = { id: string; name: string; description: string };
  type Index = Record<string, StrategyMeta[]>;

  const GAMES: { id: string; title: string; subtitle: string }[] = [
    {
      id: "tetris",
      title: "Tetris",
      subtitle:
        "Single-loop arcade. The Program enumerates every legal placement and ranks them; the LLM picks from the top 3.",
    },
    {
      id: "scavenger",
      title: "Scavenger",
      subtitle:
        "Multi-step quest. Find the red cube, deliver to blue square. The Program runs BFS around walls; the LLM ratifies one direction.",
    },
  ];

  let index: Index = $state({});
  let loadError: string | null = $state(null);

  onMount(async () => {
    try {
      const res = await fetch("/strategies/index.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      index = await res.json();
    } catch (e) {
      loadError = (e as Error).message;
    }
  });

  function play(gameId: string, strategyId: string | null) {
    const url = strategyId
      ? `/demos/${gameId}/?strategy=${strategyId}`
      : `/demos/${gameId}/`;
    // Same-tab navigation. Browser back button returns to the launcher.
    window.location.href = url;
  }
</script>

<main>
  <header>
    <h1>skillos_mini</h1>
    <p class="tag">Games-first browser playground for the LLM-OS kernel.</p>
    <p class="links">
      <a href="/demos/">→ raw demos (no strategy injection)</a>
      ·
      <a
        href="https://github.com/EvolvingAgentsLabs/llm_os"
        target="_blank" rel="noopener">llm_os source</a>
    </p>
  </header>

  {#if loadError}
    <div class="error">
      Failed to load strategies index: {loadError}. Did you run <code
        >npm run predev</code>?
    </div>
  {/if}

  {#each GAMES as game}
    <section>
      <h2>
        <span class="game-title">{game.title}</span>
      </h2>
      <p class="subtitle">{game.subtitle}</p>

      <div class="cards">
        <button class="card default" onclick={() => play(game.id, null)}>
          <div class="card-name">No strategy (default prompt)</div>
          <div class="card-desc">
            The demo's built-in SYSTEM_PROMPT only — no strategy markdown
            prepended. Useful as a baseline.
          </div>
        </button>
        {#each index[game.id] ?? [] as strat}
          <button
            class="card"
            onclick={() => play(game.id, strat.id)}>
            <div class="card-name">{strat.name}</div>
            <div class="card-desc">{strat.description}</div>
            <div class="card-meta">strategy: <code>{strat.id}</code></div>
          </button>
        {/each}
      </div>
    </section>
  {/each}

  <footer>
    <p>
      Each strategy is a <a
        href="https://github.com/EvolvingAgentsLabs/skillos_mini/tree/main/strategies"
        target="_blank">markdown cartridge</a>
      with frontmatter (target, id, name, description) and prose body. The body
      is fetched at game load and prepended to the demo's
      <code>SYSTEM_PROMPT</code> before the model loads. The grammar still
      enforces output validity regardless of what the strategy says — strategies
      can only steer <em>which</em> valid opcode the LLM picks, never produce
      invalid ones.
    </p>
  </footer>
</main>

<style>
  main {
    font-family: "SF Mono", "Fira Code", monospace;
    background: #0a0a0a;
    color: #e0e0e0;
    min-height: 100vh;
    padding: 32px 24px;
    max-width: 920px;
    margin: 0 auto;
  }
  header { margin-bottom: 32px; }
  h1 { font-size: 1.6em; color: #00ff88; margin-bottom: 4px; }
  .tag { color: #888; font-size: 0.95em; line-height: 1.5; }
  .links { font-size: 0.8em; color: #555; margin-top: 8px; }
  .links a { color: #00aaff; text-decoration: none; }
  .links a:hover { text-decoration: underline; }
  .error {
    background: #2a0a0a;
    border-left: 2px solid #ff4444;
    padding: 12px 14px;
    color: #ff8888;
    font-size: 0.85em;
    margin-bottom: 24px;
    border-radius: 0 4px 4px 0;
  }
  .error code { background: #1a1a1a; padding: 1px 5px; border-radius: 2px; }
  section { margin-bottom: 36px; }
  h2 { font-size: 1.15em; color: #00ff88; margin-bottom: 4px; }
  .game-title { letter-spacing: 0.5px; }
  .subtitle { color: #888; font-size: 0.85em; line-height: 1.5; margin-bottom: 14px; }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }
  .card {
    background: #111;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 14px;
    text-align: left;
    color: inherit;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s, transform 0.05s;
  }
  .card:hover { border-color: #00ff88; }
  .card:active { transform: scale(0.99); }
  .card.default { background: #0c1a0c; border-color: #1a3a1a; }
  .card.default:hover { border-color: #00ff88; }
  .card-name { color: #00ff88; font-size: 0.95em; margin-bottom: 6px; }
  .card-desc { color: #aaa; font-size: 0.82em; line-height: 1.45; }
  .card-meta { font-size: 0.72em; color: #555; margin-top: 8px; }
  .card-meta code { background: #1a1a1a; padding: 1px 5px; border-radius: 2px; color: #888; }
  footer {
    margin-top: 48px;
    padding-top: 20px;
    border-top: 1px solid #222;
    color: #666;
    font-size: 0.8em;
    line-height: 1.6;
  }
  footer a { color: #00aaff; text-decoration: none; }
  footer a:hover { text-decoration: underline; }
  footer code { background: #1a1a1a; padding: 1px 5px; border-radius: 2px; color: #888; }
</style>
