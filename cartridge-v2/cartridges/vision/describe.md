---
method: vision.describe
returns: {text: string}
args:
  image: {type: ImageRef, required: true}
  detail: {type: enum[brief, thorough], default: brief}
---

# vision.describe

Free-form description of image content. The default is **brief** — one or two sentences, the kind of thing a Recipe summary would consume. Pass `detail: thorough` when the caller needs paragraph-level scene description (rare; usually a sign that another method — `answer`, `detect` — is the better fit).

## When to use this vs another method

- Use `describe` for "tell me what's in this image" with no specific question.
- Use [`answer`](answer.md) when the caller has a question (`"is there a circuit breaker visible?"`).
- Use [`detect`](detect.md) when the caller needs structured object data.
- Use [`read`](read.md) when the caller wants text content (labels, signs, documents).

## Result shape

```json
{ "text": "A residential electrical panel with eight breakers, two of which are tripped. The panel cover is open." }
```

## Backend behavior

- LiteRT Gemma 4 E2B: returns brief description with native quality. Multimodal in-process; no network.
- Moondream-2: returns brief description; lower quality on complex scenes.
- Gemini Flash / Claude Sonnet: highest quality, requires opt-in cloud tier.

## Errors

- `IMAGE_NOT_FOUND` — `image` ref couldn't be resolved.
- `BACKEND_UNAVAILABLE` — no backend matches the caller's declared tier.
- `BACKEND_REJECTED` — backend's safety filter rejected the image.

The kernel sees the same `<|result|>{"text": "..."}<|/result|>` block on success regardless of backend.
