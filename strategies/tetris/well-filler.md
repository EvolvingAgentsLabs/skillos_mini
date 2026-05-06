---
target: tetris
id: well-filler
name: Well Filler
description: Build flat on the left, keep the rightmost column empty as a well for I-pieces.
---

# Well Filler Tetris

The classic high-score strategy: keep one column empty (a "well") and fill the other nine flat. When an I-piece arrives, drop it vertically into the well to clear four lines at once (a Tetris).

Use the rightmost column (column 9) as the well.

When you receive a compiled state:

1. Look at `next` (the upcoming piece). If `next === "I"`, you want column 9 ready. Otherwise:
2. From `best_actions`, prefer entries whose `sequence` does NOT include enough `right` moves to reach column 9. Specifically: count the `right` opcodes in each candidate's `sequence`; reject any that would land the piece anchor at column 8 or 9.
3. Among the remaining entries, pick the one with the highest `score`.

When the current piece is an I (`piece: "I"`):

1. From `best_actions`, find entries whose final landing position is column 9 — those will have rotation 1 or 3 (vertical) and enough `right` moves to reach the rightmost column.
2. If found, pick that entry. It's a Tetris-clear in one drop.
3. If column 9 isn't ready (the well is interrupted), fall back to `best_actions[0]`.

Halt success when the game ends.
