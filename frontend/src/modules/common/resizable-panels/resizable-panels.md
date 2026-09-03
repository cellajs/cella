# Resizable panels: rules & visual examples

Diagram conventions:

- `||` = separator being dragged
- `->` / `<-` = drag direction (centered in separator)
- `X` = panel skipped (pre-collapsed at drag start)
- `~~` = spacer (autoFill) or trailing gap (overflow)
- Panel text: `Name width (state)`

Constants used in all examples:

| Prop             | Value                    |
| ---------------- | ------------------------ |
| `minWidth`       | 300                      |
| `collapsedWidth` | 50                       |
| Collapse snap    | `(50 + 300) / 2.2 ~ 159` |
| Expand gap       | `300 - 50 = 250`         |

## General rules

- **State**: `resolveLayout(panelConfigs, separatorIndex, initialWidths, dx, mode)` is a pure, idempotent function returning the complete layout (widths + hint data). Dragging back reverses the change; no undo logic.
- **Layout**: pixel widths (`style.width`) in a flex container; no CSS grid or fr tracks. Stored widths equal rendered widths. No max-width cap on the grower (G8).

## G1: Direction determines roles

The panel on the shrinking side of the separator is the victim, the growing side is the grower. Drag right: left panel grows. Drag left: right panel grows.

## G2: Collapse snap

- Snap point: `(collapsedWidth + minWidth) / 2.2`. Past it the victim snaps to `collapsedWidth`; back before it, to `minWidth`.
- While a victim traverses the collapse zone (`minWidth` -> snap point) the layout freezes and only the collapse hint progresses.
- Once collapsed, the panel stays collapsed for the rest of the drag; further delta cascades to the next victim (G9).

```
  A=450, B=350, drag right. B shrinks past snap (~159px) -> collapses to 50:

  +--------------- A -----------------+||+--+
  |           750px                 |||50|
  |          (grower)               ||| B|
  +---------------------------------+||+--+
                                     -> drag
```

## G3: Expand gate

- A collapsed grower snaps to `minWidth` only after the full `minWidth - collapsedWidth` drag distance. Until then the handle is frozen and the expand hint shows progress 0->1.
- Reversing below the threshold re-enters the gate.
- After the snap the grower keeps growing without cap (G8).

```
  A=500 (victim), B=50 (collapsed grower), drag left.
  Handle frozen for 250px, hint 0->1. At 250px B snaps to minWidth:

  +----- A -----+||+-------- B ---------+
  |   250px     |||      300px         |
  |  (victim)   |||   (expanded!)      |
  +-------------+||+--------------------+
                 <- drag
```

## G4: Resize hints

A hint (arrow + radial glow) shows in collapse and expand zones: `collapse` -> inward arrow, `expand` -> outward arrow, progress 0->1.

## G5: Keyboard

Arrow keys: single step, no cascade; direct victim shrinks, grower grows. If the grower is collapsed and the key direction pulls it open, it expands to `minWidth`. Enter toggles collapse on the left panel of the separator.

## G6: Mode detection

Ideal sum: collapsed panels contribute `collapsedWidth`, others `minWidth * 1.25`. Ideal sum + separator space <= parentWidth -> autoFill, else overflow. Computed at drag start, fixed for the drag. In overflow mode the container min-width is the ideal sum, so panels grow without collapsing others.

## G8: Zero-sum resize (no max-width cap)

Every pixel freed by victims goes to the grower, uncapped in both modes, so the total panel sum stays constant during drag: no trailing gap, no mid-drag container width adjustment, no scroll compensation.

## G9: Two-phase cascade

- Phase 1: shrink victims toward `minWidth` in order away from the separator.
- Phase 2: collapse, only after all victims are at min; freed pixels fund the grower (G8).
- Panels collapsed at drag start are skipped in both phases. G11 overrides the phase order when the last victim is off-screen.

```
  Before:

  +---- A -----+||+----- B ------++-------- C --------+
  |   350px     |||   350px       ||      500px         |
  |  (grower)   |||  (victim 1)   ||    (victim 2)      |
  +-------------+||+--------------++--------------------+
                  -> drag 200px

  Phase 1: B shrinks 50 -> 300 (min); the remaining 150 cascades to C -> 350. A -> 550.
  Phase 2 (all at min, drag more): B hits snap -> 50, A absorbs 250.
  Then C collapses -> A absorbs 250 more -> 1100.
```

## G10: No swap (expand blocks direct victim collapse)

While a collapsed grower is expanding via the expand gate, the direct victim cannot collapse until the pixels freed by Phase 1 shrinking meet the expand cost (`totalFreed >= expandCost`). Once funded, further collapse is normal nearest-first cascading, not a swap.

## Pre-collapsed panels in cascade

Panels already collapsed at drag start are skipped (X) in both phases; the cascade jumps to the next victim.

```
  A=400, B=collapsed 50, C=300 (min), D=350. Drag left:

  +---- A -----++-- B --++---- C ------+||+---- D -----+
  |   400px     ||  50   ||  300px       |||   350px     |
  |             || X     ||  (min)       |||  (grower)   |
  +-------------++-------++-------------+||+-------------+
                                         <- drag

  Phase 1: C at min -> cascade. B collapsed -> X skip. A -> 300 (min).
  Phase 2: C collapses -> B X skip -> A collapses. D absorbs all freed (G8) -> 850.
```

## AUTOFILL MODE

Panels fit the container. Collapse-freed pixels fund the uncapped grower (G8); `redistributePanels` rebalances on drop.

```
  A=400 (grower), B=300, C=300, drag right (Phase 2). B collapses -> 250 freed pixels fund A:

  +------------------- A ---------------------+||+--++----- C ------+
  |               650px                       |||50||   300px       |
  |           (grower, uncapped)              ||| B||   (min)       |
  +-------------------------------------------+||+--++--------------+
                                               -> drag
```

## OVERFLOW MODE

Panels exceed the container (horizontal scroll). Collapse-freed pixels fund the grower as in autoFill; the total panel sum stays constant, so no trailing gap and a static container width mid-drag.

### O2: Expand is free in overflow mode

The expand cost (`minWidth - collapsedWidth`) is subtracted from the remaining delta before victims shrink: the panel grows to `minWidth` by adding content to the container, and only the delta beyond the expand cost cascades to victims.

```
  Overflow, C collapsed, drag separator left 350px:

  +-------- A --------++-------- B --------+||+--+
  |      450px         ||      500px         |||50|
  |                    ||     (victim)       ||| C|
  +--------------------++--------------------+||+--+
                                              <- drag 350px

  Expand gate (G3) consumes the first 250px, C snaps to 300.
  Remaining 100px cascades: B shrinks -> 400:

  +-------- A --------++------ B ------+||+-------- C --------+
  |      450px         ||    400px       |||      300px         |
  |                    ||               |||   (expanded!)      |
  +--------------------++---------------+||+-------------------+
                                         <- drag
```

## Viewport clamp (redistributePanels)

After drag ends and on window resize, `redistributePanels` runs a pre-pass that clamps any panel exceeding the scroll parent's visible width. It runs before proportional ratio scaling, so it fires even when the total already matches available space (ratio ≈ 1).

## G11: Per-panel cascade (last victim off-screen)

Condition, checked once at drag start and fixed for the drag: mode is overflow, and the last victim's bounding rect extends beyond the scroll container's visible edge. Then:

- Phase 1: shrink all victims to `minWidth`, nearest first (as G9).
- Phase 2: per-panel collapse, nearest first: each victim enters the collapse zone and collapses before the next is touched.

With all victims visible, standard G9 applies.

```
  5 panels, E off-screen. Drag right (A grower):

  +-------- A --------+||+--- B ----++--- C ----++--- D ----+  :+--- E ----+
  |      550px         |||  350px    ||  350px    ||  350px    |  :|  350px    |
  |     (grower)       ||| (victim1) || (victim2) || (victim3) |  :| (victim4) |
  +--------------------+||+----------++----------++----------+  :+----------+
                        -> drag                      viewport edge : off-screen

  Phase 1: B->300, C->300, D->300, E->300.
  Phase 2: B collapses to 50, then C, then D, then E. Nearest first.
```
