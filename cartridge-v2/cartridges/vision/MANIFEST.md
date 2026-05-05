---
type: cartridge
version: 2
id: vision
title: Vision — image-to-text utility cartridge
language: en
description: >
  Generic vision tool. Methods take an image and a query, return text.
  The kernel never sees image tokens — vision results inject as plain
  <|result|>...<|/result|> blocks, keeping the kernel small, fast, and
  text-only.

  This is a backend-pluggable cartridge. Backends can be cloud (Gemini
  Flash, Claude vision, Gemini Robotics-ER) or local (LiteRT Gemma 4
  E2B on Android, Moondream-2 GGUF in browser via wllama). Per CLAUDE.md
  §3.2 / §4.4 / §9.3, cloud backends are OPT-IN per cartridge that calls
  vision — never automatic, never default.

entry_intents:
  - describe an image
  - what is in this photo
  - read text from image
  - detect objects in image

entry_index: index.md

tools_required:
  - vision.describe
  - vision.detect
  - vision.read
  - vision.answer

# Backends are not declared per-cartridge here — the runtime resolves them
# via tier preference in the consuming cartridge's manifest. See
# docs/llm-os-kernel-integration.md and §6.4 of this MANIFEST.
preferred_tier: local

ui:
  brand_color: "#7C3AED"
  emoji: "👁"

hooks: {}

status: design  # implementation deferred — see status section below
---

# Vision cartridge

## What this cartridge is

A thin contract over "image → text." Four methods, one backend interface, multiple backends behind it. The kernel never deals with image tokens — vision is a syscall whose result is text injected into the prompt, exactly like any other cartridge call.

## What this cartridge is NOT

- **Not a realtime perception loop.** That belongs in `skillos_robot`'s onboard SemanticLoop. The cartridge is for one-shot calls (a Recipe asks, gets text back, moves on).
- **Not a frame buffer or video pipeline.** Single image per call.
- **Not multimodal in-kernel.** The kernel stays text-only; this cartridge is the integration boundary.
- **Not a default cloud caller.** Per CLAUDE.md §3.2: cloud is opt-in per cartridge. Cartridges that need vision must explicitly declare which backend tier they accept.

## Methods

### `vision.describe({image, detail})`
Free-form description of image content. Returns `{text}`.

### `vision.detect({image, classes?})`
Detect labeled objects with bounding boxes. Returns `{objects: [{label, bbox: {x, y, w, h}, confidence}]}` where bbox is normalized 0-1.

### `vision.read({image})`
OCR — return text content of image. Returns `{text}`.

### `vision.answer({image, question})`
Visual question answering. Returns `{text}`.

## Backend interface

```ts
interface VisionBackend {
  readonly id: string;
  readonly tier: 'local' | 'cloud' | 'on-device-multimodal';
  readonly capabilities: {
    describe: boolean;
    detect: boolean;
    read: boolean;
    answer: boolean;
    multi_image: boolean;
  };
  describe(opts: {image: ImageRef; detail: 'brief'|'thorough'}): Promise<{text: string}>;
  detect?(opts: {image: ImageRef; classes?: string[]}): Promise<{objects: Detection[]}>;
  read?(opts: {image: ImageRef}): Promise<{text: string}>;
  answer?(opts: {image: ImageRef; question: string}): Promise<{text: string}>;
}
```

`ImageRef` is a tagged union: blackboard reference, data URI, HTTPS URL.

## Roster of intended backends (NOT YET WIRED)

Ordered by deployment priority. Items 1–2 require approval per CLAUDE.md §12 (new external API surface).

| Backend | Tier | Where it runs | Notes |
|---|---|---|---|
| `litert-gemma-4-e2b` | `on-device-multimodal` | Android Capacitor only | Already supported in [litert_backend.ts](../../../mobile/src/lib/llm/local/litert_backend.ts). The non-cloud path users default to. |
| `moondream-2-wllama` | `local` | Browser via wllama | ~800 MB GGUF. Quality lags cloud by a tier; runs in any modern browser. |
| `gemini-flash-cloud` | `cloud` | HTTPS to Google AI | **OPT-IN ONLY.** Cartridges that route here must declare `vision_tier: cloud` in their MANIFEST. |
| `claude-sonnet-cloud` | `cloud` | HTTPS to Anthropic | **OPT-IN ONLY.** Best quality on hard scenes / OCR. |
| `gemini-robotics-er` | `cloud` | HTTPS, robot-tuned | Used by `skillos_robot` for SceneGraph perception. Not exposed here directly — the robot cartridge wraps it. |

## Routing rule (when implemented)

```
caller declares vision_tier: 'on-device-multimodal'
  -> if Capacitor + LiteRT plugin available: litert-gemma-4-e2b
  -> else: moondream-2-wllama (slower, browser-only)

caller declares vision_tier: 'local'
  -> moondream-2-wllama (always, never falls through to cloud)

caller declares vision_tier: 'cloud'
  -> gemini-flash-cloud (default cloud), or claude-sonnet-cloud if 'best'
```

The *runtime never escalates upward without explicit declaration.* A cartridge that wants cloud must say so.

## Status

**design** — this MANIFEST is the spec. No backend code is wired yet. Implementation requires:

1. Authorization to add cloud SDK deps per CLAUDE.md §12 (or build with `fetch()` directly to avoid new deps).
2. The kernel-under-runGoal wiring in [docs/llm-os-kernel-integration.md](../../../docs/llm-os-kernel-integration.md), so cartridge calls go through grammar enforcement.
3. ImageStore extension to the blackboard (binary blob refs instead of inline base64) — flagged as Open Question 1 below.

## Open questions

1. **Image transport in the blackboard.** Big base64 strings clog the prompt. Need a small ImageStore (key → blob) and pass `{image: '@bb:img-123'}` instead. This is a blackboard schema extension — needs a separate PR.
2. **Bounding box format normalization.** Gemini Robotics-ER returns `[ymin, xmin, ymax, xmax]` 0-1000. Cloud VLMs return prose. Standardize on normalized 0-1 `{x, y, w, h}`; backends adapt at the edges.
3. **Cost accounting.** Cloud vision is the most expensive call type. Cost-meter UI work (per the SkillOS UI roadmap memory) should treat vision as a separate budget line.

## Provenance

Designed alongside the llm_os kernel extraction (May 2026). See `docs/llm-os-kernel-integration.md` and `projects/Project_llm_os_as_kernel/output/02_vision_cartridge_design.md` (in the parent monorepo) for the full architectural rationale.
