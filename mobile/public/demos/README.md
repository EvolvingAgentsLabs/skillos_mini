# mobile/public/demos/

Static-asset bundles of the llm_os browser demos, served at `/demos/index.html` in both Vite dev and production builds.

## Layout

```
demos/
├── index.html              # raw-demos landing (no strategy injection)
├── _kernel/                # llm_os kernel snapshot
│   ├── token_trie.js
│   ├── cartridge.js
│   ├── sampler.js
│   ├── dispatch.js
│   ├── index.js
│   ├── README.md
│   └── schemas/cartridge.manifest.schema.json
├── _cart/game/             # cartridge manifests
│   ├── tetris/{manifest.json, schemas/*.json}
│   └── scavenger/{manifest.json, schemas/*.json}
├── tetris/index.html       # Tetris demo (~770 LOC, with strategy hook)
└── scavenger/index.html    # Scavenger demo (~600 LOC, with strategy hook)
```

## Strategy injection

Both demos read `?strategy=<id>` from the URL. If present, they fetch `/strategies/<game>/<id>.md`, strip the YAML frontmatter, and prepend the body to `SYSTEM_PROMPT` before model load. With no `?strategy=`, the demo runs on its built-in default prompt only.

The strategies live at the repo root in [`strategies/`](../../../strategies/) and are vendored into `mobile/public/strategies/` by `scripts/copy-strategies.mjs` at predev/prebuild.

## Refreshing snapshots

```bash
# from skillos_mini root
LLM_OS=../llm_os
cp $LLM_OS/kernel/*.js                            mobile/public/demos/_kernel/
cp $LLM_OS/kernel/schemas/*.json                  mobile/public/demos/_kernel/schemas/
cp $LLM_OS/cart/game/tetris/manifest.json         mobile/public/demos/_cart/game/tetris/
cp $LLM_OS/cart/game/tetris/schemas/*.json        mobile/public/demos/_cart/game/tetris/schemas/
cp $LLM_OS/cart/game/scavenger/manifest.json      mobile/public/demos/_cart/game/scavenger/
cp $LLM_OS/cart/game/scavenger/schemas/*.json     mobile/public/demos/_cart/game/scavenger/schemas/
cp $LLM_OS/demo/tetris-browser/index.html         mobile/public/demos/tetris/index.html
cp $LLM_OS/demo/scavenger-browser/index.html      mobile/public/demos/scavenger/index.html
# Then re-apply: ../../kernel → ../_kernel, ../../cart → ../_cart, and re-add the loadStrategy() hook.
```
