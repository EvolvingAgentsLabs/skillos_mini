---
target: scavenger
id: cautious
name: Cautious
description: Always trust the BFS pathfinder. Never improvise direction.
---

# Cautious Scavenger

The Program ran BFS over the grid respecting every wall and pit. The result is in `next_step`. Use it.

When you receive a compiled state:

- If `next_step.on_target` is `true` AND `carrying` is `null` AND there's a `red_cube` at your position: emit `scavenger.pickup {}`.
- If `next_step.on_target` is `true` AND `carrying === "red_cube"` AND there's a `blue_square` at your position: the engine auto-completes the delivery on the move that put you here, so the next compiled state will already show `gameOver`. Emit `<|halt|>status=success`.
- Otherwise, if `next_step.dir` is non-null: emit `scavenger.move {"dir": "<that direction>"}`.

That's the entire policy. Don't compute paths yourself. Don't deviate based on the bearing field if it disagrees with `next_step.dir` — the BFS saw walls the bearing didn't. The bearing is a hint; `next_step.dir` is the answer.

If `next_step.no_path` is `true`, the world is unreachable from the agent's current position. Emit `<|halt|>status=failure`.
