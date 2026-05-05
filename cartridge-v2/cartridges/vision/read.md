---
method: vision.read
returns: {text: string}
args:
  image: {type: ImageRef, required: true}
---

# vision.read

OCR. Return the text content of an image — labels, signs, document content, breaker amperage stickers, ingredient lists, etc.

## When to use this vs `describe`

- `read` extracts text *as text*, in reading order, suitable for downstream parsing.
- `describe` summarizes the image including any text it sees, but doesn't preserve text fidelity.

## Result shape

```json
{ "text": "GE\n20 A\nBREAKER\nMODEL THQL-1120" }
```

Newlines preserve structure where the backend can detect them. Backends that can't preserve layout return whitespace-separated text.

## Backend notes

Cloud VLMs (Gemini, Claude) handle dense text well. Local VLMs (LiteRT Gemma 4 E2B, Moondream-2) handle short labels well but degrade on long blocks. For document-grade OCR, route to cloud.

## PII implication

OCR'd text may contain PII (addresses, names, numbers). Per CLAUDE.md §10.2 design, the v1.2 PII scrubber pipeline runs against `read` results before any optional dataset upload. Until v1.2, `read` results stay on-device — they live in the blackboard and are part of the user's local-only data.
