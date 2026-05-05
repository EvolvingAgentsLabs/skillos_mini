# mobile/public/demos/

Static-asset bundles of the llm_os browser demos, served at `<app>/demos/index.html` in both dev (Vite) and Capacitor production builds.

## Layout

```
demos/
├── index.html                    # landing page linking to both games
├── _kernel/                      # llm_os kernel snapshot (vendored from llm_os@d6c1f39)
│   ├── token_trie.js
│   ├── cartridge.js
│   ├── sampler.js
│   ├── dispatch.js
│   ├── index.js
│   ├── README.md
│   └── schemas/cartridge.manifest.schema.json
├── _cart/game/                   # cartridge manifests
│   ├── tetris/{manifest.json, schemas/*.json}
│   └── scavenger/{manifest.json, schemas/*.json}
├── tetris/index.html             # Tetris demo (~736 LOC)
└── scavenger/index.html          # Scavenger demo (~570 LOC)
```

The demos import wllama from `cdn.jsdelivr.net` (online-first). When the Capacitor APK ships and offline-first becomes a hard requirement, switch the imports to the bundled wllama at `mobile/public/wllama/` — that's a small follow-up.

## Refreshing snapshots

```bash
# from skillos_mini root
LLM_OS=../llm_os
cp $LLM_OS/kernel/*.js mobile/public/demos/_kernel/
cp $LLM_OS/kernel/schemas/*.json mobile/public/demos/_kernel/schemas/
cp $LLM_OS/cart/game/tetris/manifest.json mobile/public/demos/_cart/game/tetris/
cp $LLM_OS/cart/game/tetris/schemas/*.json mobile/public/demos/_cart/game/tetris/schemas/
cp $LLM_OS/cart/game/scavenger/manifest.json mobile/public/demos/_cart/game/scavenger/
cp $LLM_OS/cart/game/scavenger/schemas/*.json mobile/public/demos/_cart/game/scavenger/schemas/
cp $LLM_OS/demo/tetris-browser/index.html mobile/public/demos/tetris/index.html
cp $LLM_OS/demo/scavenger-browser/index.html mobile/public/demos/scavenger/index.html
# Then re-apply the import-path patches: ../../kernel → ../_kernel, ../../cart → ../_cart
```

## What these demos validate

1. **Kernel works as a vendored module.** Same JS files run unchanged in two contexts (llm_os repo + skillos_mini bundle).
2. **Cartridges are manifest-driven.** Two cartridges with very different shapes (arcade vs. quest) on the same kernel — proves cartridge-as-data, not cartridge-as-code.
3. **Compiled-state pattern transfers.** Scavenger's compiled state mirrors `skillos_robot`'s `SceneGraph.toJSON()` deliberately — same prompt, same opcode set, same decision logic transfer to the physical world.

## What these demos are NOT

- **Not production cartridges** — production cartridges (electricista, plomero, pintor) live under `cartridge-v2/cartridges/` and run through the v2 cartridge runner.
- **Not kernel-mode runGoal** — this is PR 3 of `docs/llm-os-kernel-integration.md`. When that lands, v2 cartridges run on the same kernel via [`v2_adapter.ts`](../../src/lib/kernel/v2_adapter.ts).
- **Not iframe Gallery skills** — the iframe sandbox CSP and origin model don't accommodate wllama. The demos open in their own routes, not as iframe skills.

## Headers

The Vite dev server includes a small plugin that sends:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
on every response. SharedArrayBuffer requires both. The Capacitor production build provides them via its server config.
