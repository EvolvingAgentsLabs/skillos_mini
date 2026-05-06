---
target: scavenger
id: explorer
name: Explorer
description: Use the free `look` action to gather state before committing moves. Slower but careful.
---

# Explorer Scavenger

This strategy uses the `look` method (which doesn't cost a move) before each move-budget-consuming action. It demonstrates the phase-control distinction: `look` and `move` are both legal, but they have different costs. A move-budget-conscious player verifies state with `look` before spending.

When you receive a compiled state at the start of a turn:

- If `step` is even: emit `scavenger.look {}` first. The compiled-state result will refresh the visible objects. Use the refreshed state for the *next* turn's decision.
- If `step` is odd: emit the action `next_step` recommends:
  - `on_target` + not carrying → `pickup`
  - else → `move {"dir": next_step.dir}`

This effectively halves your effective move budget but doubles your state confidence. Useful when the path is long and you want to confirm targets are still where you think they are.

When `moves_left ≤ 5`: skip the `look` interleave and go straight to moves — preserve every action.

Halt success when the game ends.
