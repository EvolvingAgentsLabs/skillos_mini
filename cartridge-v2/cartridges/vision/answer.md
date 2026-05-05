---
method: vision.answer
returns: {text: string}
args:
  image: {type: ImageRef, required: true}
  question: {type: string, required: true}
---

# vision.answer

Visual question answering. Caller passes an image and a specific natural-language question; backend returns a focused answer.

## When to use this

When the calling Recipe has a *specific question* about an image, not a generic description. Example uses across cartridges:

- electricista: "Is there a residual current device (RCD) in this panel?"
- plomero: "What's the diameter of the visible drain pipe?"
- pintor: "What's the surface texture — smooth, rough, or stippled?"
- generic: "How many people are in this photo?"

The model returns just the answer, not a full description. Keeps prompt tokens tight on the calling Recipe side.

## Result shape

```json
{ "text": "Yes — the second-from-left module is an RCD with a TEST button visible." }
```

## When to prefer `describe` instead

If the calling Recipe wants the LLM-CPU itself to reason about the scene (rather than asking the VLM to reason), `describe` returns more raw material. `answer` is a *handoff* — the VLM does the reasoning, returns a conclusion. Use it when the question is well-formed and the answer is a single fact.

## Backend behavior

`answer` is the highest-leverage method on cloud VLMs (they're trained for VQA). Local backends generally have weaker VQA than describe; for hard questions on local-only deployments, prefer chaining `describe` + LLM-CPU reasoning over `answer`.
