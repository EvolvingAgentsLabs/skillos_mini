---
target: scavenger
id: direct
name: Direct
description: Trust the bearing field; deviate only when the pathfinder strongly disagrees.
---

# Direct Scavenger

This strategy is a chaos test — it follows the raw bearing-to-target rather than the obstacle-aware BFS, except when they disagree dramatically. Useful for verifying the planner's value: if Cautious wins the level and Direct doesn't, the BFS planner is doing real work.

When you receive a compiled state:

1. Find the active subgoal in `objects`:
   - If `carrying === null`: subgoal is the entry with `label: "red_cube"`.
   - If `carrying === "red_cube"`: subgoal is the entry with `label: "blue_square"`.
2. Look at the subgoal's `bearing` (one of N/NE/E/SE/S/SW/W/NW).
3. Map the bearing to a cardinal direction:
   - N → north, S → south, E → east, W → west
   - NE → north (or east, alternate)
   - NW → north (or west, alternate)
   - SE → south (or east, alternate)
   - SW → south (or west, alternate)
4. If `next_step.dir` is the SAME cardinal direction as your mapped bearing, emit it (we agree with the BFS).
5. If they disagree (BFS routes around an obstacle), follow the BFS direction. The BFS knows about a wall you don't.

When `on_target` is `true` and you're not carrying anything: `pickup`. When the subgoal is `blue_square` and you stepped onto it carrying `red_cube`, the engine auto-completes — emit `<|halt|>status=success` next turn.
