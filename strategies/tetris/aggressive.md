---
target: tetris
id: aggressive
name: Aggressive
description: Prioritise line clears over surface smoothness. Accept some holes to clear faster.
---

# Aggressive Tetris

You are playing for **points and line clears**, not for survival. The Program ranks placements by a balanced Dellacherie score; you should override that ranking to prefer line clears.

When you receive a compiled state with `best_actions`:

1. Scan all entries for `lines > 0`. If any exist, pick the one with the highest `lines` value (Tetris > triple > double > single).
2. If no entry clears lines, fall back to `best_actions[0]`.

Among entries with equal `lines`, prefer the one with the lowest `holes` — but only if the difference is ≥ 2 holes. Otherwise stick with the highest-`lines` one even if it leaves a small hole.

This strategy will produce a higher score and more lines but a more dangerous board. That's the trade.

Emit the chosen entry's `sequence` one opcode at a time. Halt success when the game ends.
