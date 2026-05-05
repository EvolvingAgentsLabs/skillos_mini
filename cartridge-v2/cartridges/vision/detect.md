---
method: vision.detect
returns: {objects: [{label: string, bbox: {x, y, w, h}, confidence: number}]}
args:
  image: {type: ImageRef, required: true}
  classes: {type: array[string], default: null}
---

# vision.detect

Structured object detection. Returns labeled bounding boxes in **normalized 0-1 coordinates** (`x`, `y` = top-left corner; `w`, `h` = size). Backend-agnostic: backends translate from their native format (Gemini Robotics-ER's `[ymin, xmin, ymax, xmax]`, etc.) to this canonical form.

## When to use this vs `describe`

- `detect` returns *machine-readable* boxes — useful when a downstream Recipe step needs to crop, count, or validate. Example: electricista cartridge counts visible breakers.
- `describe` returns prose — useful when the caller is the LLM itself reasoning about a scene.

## `classes` argument

If provided, restricts detection to those labels. Backends may or may not honor it (cloud VLMs typically do; local ones may return all detectable objects regardless). When omitted, the backend returns whatever it found.

```json
{ "image": "@bb:photo-1", "classes": ["breaker", "wire", "panel"] }
```

## Result shape

```json
{
  "objects": [
    { "label": "breaker", "bbox": { "x": 0.34, "y": 0.21, "w": 0.08, "h": 0.05 }, "confidence": 0.94 },
    { "label": "breaker", "bbox": { "x": 0.42, "y": 0.21, "w": 0.08, "h": 0.05 }, "confidence": 0.91 }
  ]
}
```

## Capability check

Not every backend implements detect. The cartridge router checks `backend.capabilities.detect` before dispatching; on a backend without detect, the call returns `BACKEND_UNAVAILABLE` rather than silently falling back to `describe` (which would lose structure).
