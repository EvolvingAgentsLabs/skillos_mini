---
target: tetris
id: conservative
name: Conservative
description: Always pick the safest pre-ranked placement. Never improvise.
---

# Conservative Tetris

Your job is simple: emit `best_actions[0].sequence` one opcode at a time. The Program already simulated every legal placement and ranked them by a Dellacherie-inspired score. Trust it.

When you receive a compiled state with `best_actions`, the first entry is the highest-scoring placement. Look at its `sequence` field — for example `["rotate", "right", "drop"]` — and emit each opcode in order, one per turn. The phase controller already ensures only those moves are legal.

Don't try to outsmart the planner. Don't pick `best_actions[1]` because it "looks interesting". Don't deviate to clear a single line if the planner picked a no-line placement — the planner already accounted for that and decided it wasn't worth the holes it would create.

The only situation where you should think for yourself: if the compiled state has `urgent: true`, prefer placements with the lowest `max_h` — that's the placement that buys you the most board height back. Among `best_actions`, scan for the lowest `max_h` value rather than the highest `score`. This is the one heuristic override.

Always emit `<|halt|>status=success` when the game ends.
