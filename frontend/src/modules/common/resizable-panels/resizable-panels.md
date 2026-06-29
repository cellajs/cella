# Resizable panels — rules & visual examples

Diagram conventions:

- `||` = separator being dragged
- `->` / `<-` = drag direction (centered in separator)
- `X` = panel skipped (pre-collapsed at drag start)
- `~~` = spacer (autoFill) or trailing gap (overflow)
- Panel text: `Name width (state)`

Constants used in all examples below:

| Prop | Value |
|------|-------|
| `minWidth` | 300 |
| `collapsedWidth` | 50 |
| Collapse snap | `(50 + 300) / 2.2 ~ 159` |
| Expand gap | `300 - 50 = 250` |

---

## General rules

### STATE MANAGEMENT
Idempotent pure-function design. `resolveLayout()` takes
`(panelConfigs, separatorIndex, initialWidths, dx, mode)` and returns the
complete layout -- widths + hint data. Dragging backward with the same
swipe reverses the entire layout change automatically, no special undo logic.

### LAYOUT
Panels use pixel widths (`style.width`) inside a flex container.
No CSS grid, no fr tracks. Stored widths always equal rendered widths.
No max-width cap on the grower — it absorbs all freed pixels to keep
the total panel sum constant during drag. The viewport clamp in
`redistributePanels` prevents any panel from exceeding the visible
area after drag ends.

---

## G1 — Direction determines roles

The panel on the shrinking side of the separator is the victim.
The panel on the growing side is the grower.

Drag right -> left panel is the grower, right panel is the victim.

```
  +-------- A ---------+||+-------- B ---------+
  |      400px         |||      400px         |
  |     (grower)       |||     (victim)       |
  +--------------------+||+--------------------+
                        -> drag
```

Drag left -> right panel is the grower, left panel is the victim.

```
  +-------- A ---------+||+-------- B ---------+
  |      400px         |||      400px         |
  |     (victim)       |||     (grower)       |
  +--------------------+||+--------------------+
                        <- drag
```

---

## G2 — Collapse snap

Snap point at `(collapsedWidth + minWidth) / 2.2`. When a panel
is dragged beyond the snap point it snaps to `collapsedWidth`.
Moving back before snap point snaps it back to `minWidth`. Once
collapsed, the panel stays collapsed for the rest of the drag:
further drag delta cascades to the next victim (G9).
While a victim traverses the collapse zone (`minWidth` -> snap
point), the layout freezes and only the collapse hint progresses.

```
  Before:

  +-------- A ---------+||+-------- B ---------+
  |      450px         |||      350px         |
  |                    |||                    |
  +--------------------+||+--------------------+
                        -> drag

  B shrinks past snap (~159px) -> collapses to 50:

  +--------------- A -----------------+||+--+
  |           750px                 |||50|
  |          (grower)               ||| B|
  +---------------------------------+||+--+
                                     -> drag
```

Once collapsed, B stays collapsed for the rest of this drag.

---

## G3 — Expand gate

When a collapsed panel is the grower, the user must drag the
full `(minWidth - collapsedWidth)` distance before the panel snaps
to `minWidth`. Until the threshold is reached, the handle stays
frozen and an expand hint shows progress (0->1). Reversing back
below the threshold re-enters the gate.

B is collapsed. User drags left -- B is the grower. Must accumulate
the full expand gap (250px) before B snaps to minWidth.

```
  Before:

  +-------- A ---------+||+--+
  |      500px         |||50|
  |     (victim)       ||| B|
  +--------------------+||+--+
                        <- drag

  User drags 250px left. Handle frozen, hint shows progress 0->1.
  At 250px -> B snaps to minWidth:

  +----- A -----+||+-------- B ---------+
  |   250px     |||      300px         |
  |  (victim)   |||   (expanded!)      |
  +-------------+||+--------------------+
                 <- drag

  Keeps dragging -> B grows (no cap, absorbs all freed pixels):

  +--+||+----------------- B ---------------------+
  |  |||            750px                         |
  | A|||       (grower, uncapped)                 |
  +--+||+-----------------------------------------+
     <- drag
```

---

## G4 — Resize hints

A visual hint (arrow + radial glow) appears during collapse or
expand zones. Mode `collapse` -> inward arrow. Mode `expand` ->
outward arrow. Progress 0->1.

---

## G5 — Keyboard

Arrow keys: single-step, no cascade. Direct victim shrinks,
grower grows. Expand-on-reverse: if grower is collapsed and the
key direction pulls it open, expand to `minWidth`. Enter: toggle
collapse on the left panel of the separator.

---

## G6 — Mode detection

Collapsed panels contribute `collapsedWidth`, non-collapsed panels
contribute `minWidth * 1.25`. If ideal sum + separator space <=
parentWidth -> autoFill, else -> overflow. Computed at drag
start and fixed for the entire drag. In overflow mode the
container min-width is set to the ideal sum so panels have
room to grow without collapsing others.

---

## G8 — Zero-sum resize (no max-width cap)

Every pixel freed by victims goes to the grower. The grower has
no upper cap in either mode — it absorbs all freed pixels to keep
the total panel sum constant during drag. This eliminates trailing
gaps and removes the need for mid-drag container width adjustments
or scroll compensation.

After drag ends, `redistributePanels` rebalances panels
proportionally, and its viewport clamp ensures no single panel
exceeds the scroll parent's visible width.

```
  Before:

  +-------- A ---------+||+-------- B --------++-------- C --------+
  |      400px         |||      400px        ||      400px        |
  |     (grower)       |||     (victim)      ||                   |
  +--------------------+||+-------------------++-------------------+
                        -> drag 100px

  After -- B donates 100px to A. Total unchanged:

  +----------- A -----------+||+----- B -----++--------- C --------+
  |        500px            |||   300px     ||       400px        |
  |       (grower)          |||   (min)     ||                    |
  +-------------------------+||+-------------++--------------------+
                              -> drag
```

---

## G9 — Two-phase cascade

Phase 1 -- shrink toward `minWidth` in victim order away from
separator. Phase 2 -- collapse (only after all victims at min).
Panels collapsed at drag start are skipped in both phases.
Exception: see G11 for per-panel cascade override.

### Phase 1 -- shrink cascade

B hits minWidth, remaining delta cascades to C.

```
  Before:

  +---- A -----+||+----- B ------++-------- C --------+
  |   350px     |||   350px       ||      500px         |
  |  (grower)   |||  (victim 1)   ||    (victim 2)      |
  +-------------+||+--------------++--------------------+
                  -> drag 200px

  Phase 1: B shrinks 50px -> 300 (min). 150px remain.
  Cascade: C shrinks 150px -> 350:

  +----------- A -----------+||+----- B ------++----- C ------+
  |        550px             |||   300px       ||   350px       |
  |       (grower)           |||   (min)       ||               |
  +--------------------------+||+--------------++--------------+
                              -> drag
```

### Phase 2 -- collapse cascade

All victims at minWidth. Further delta triggers collapse zone.
Collapse freed pixels fund the grower (G8).

```
  Before (all at min from prior Phase 1):

  +------------ A -----------+||+----- B -------++----- C ------+
  |        600px             |||   300px       ||   300px      |
  |       (grower)           |||   (min)       ||   (min)      |
  +--------------------------+||+---------------++--------------+
                              -> drag more

  B enters collapse zone, hits snap (~159) -> collapses to 50.
  A absorbs 250 freed -> 850. Then C collapses -> A absorbs 250 more -> 1100:

  +----------------------------------- A -----------------------------------+||+--++--+
  |                               1100px                                   |||50||50|
  |                        (grower, absorbs all freed)                     ||| B|| C|
  +------------------------------------------------------------------------+||+--++--+
                                                                            -> drag
```

---

## G10 — No swap: expand blocks direct victim collapse

When a panel is expanding via the expand snap, the direct
victim cannot collapse **while the expand is still being
funded by shrinking**. Once the total freed pixels from
Phase 1 (shrinking) meet or exceed the expand cost, the
expand is fully funded and G10 no longer blocks — any
further collapse is normal cascading, not a swap.

B is collapsed (grower side). A is the direct victim.
While `totalFreed < expandCost`, A cannot collapse.

```
  Before:

  +-------- A ---------+||+--++-------- C ---------+
  |      500px         |||50||      450px         |
  |   (direct victim)  ||| B||                    |
  +--------------------+||+--++--------------------+
                        <- drag

  Handle frozen during expand gate (B accumulating 250px).
  A stays at 500px -- NOT allowed to collapse while totalFreed
  has not yet covered expandCost. Once the user drags far
  enough that shrinking funds the expand, A can collapse
  normally (nearest-first order).
```

---

## AUTOFILL MODE

Panels fit the container. Grower absorbs all freed pixels (no cap).
Collapse freed pixels go to grower (A2).

### A2 — Collapse funds the grower (autoFill)

In autoFill mode, freed collapse pixels go to the grower.
The grower has no upper cap (G8), so it absorbs all freed
pixels. `redistributePanels` will rebalance on drop.

```
  AutoFill -- before:

  +-------- A ---------+||+----- B ------++----- C ------+
  |      400px         |||   300px       ||   300px       |
  |     (grower)       |||   (min)       ||   (min)       |
  +--------------------+||+--------------++--------------+
                        -> drag (Phase 2 begins)

  B collapses -> 250 freed pixels fund A (no cap):

  +------------------- A ---------------------+||+--++----- C ------+
  |               650px                       |||50||   300px       |
  |           (grower, uncapped)              ||| B||   (min)       |
  +-------------------------------------------+||+--++--------------+
                                               -> drag
```

---

## OVERFLOW MODE

Panels exceed container, horizontal scroll.
Grower absorbs all freed pixels (no cap) — total panel sum stays
constant during drag, so the container width is static mid-drag.
Expand is free: expand cost is subtracted from remaining
delta before victims are shrunk (O2).

### O1 — Collapse freed pixels fund grower (overflow)

In overflow mode, collapse freed pixels go to the grower just like
in autoFill. The grower has no cap (G8), so it absorbs all freed
pixels. Total panel sum stays constant — no trailing gap, no
mid-drag container width changes needed.

```
  Overflow -- before:

  +-------- A ---------+||+----- B ------++----- C ------++----- D ------+
  |      450px         |||   300px       ||   400px       ||   350px       |
  |     (grower)       |||   (min)       ||               ||               |
  +--------------------+||+--------------++--------------++--------------+
                        -> drag (Phase 2 begins)

  B collapses -> 250 freed pixels fund A:

  +----------------- A -----------------+||+--++----- C ------++----- D ------+
  |             700px                   |||50||   400px       ||   350px       |
  |     (grower, absorbs all freed)     ||| B||               ||               |
  +-------------------------------------+||+--++--------------++--------------+
                                         -> drag

  Total panel sum unchanged. Container width static.
```

### O2 — Expand is free in overflow mode

In overflow mode, the expand cost (`minWidth - collapsedWidth`) is
subtracted from the remaining delta before victims are shrunk. This
means expanding a collapsed panel doesn't require victims to fund it --
the panel simply grows from `collapsedWidth` to `minWidth` by adding
content to the container. Only delta beyond the expand cost cascades
to victims.

```
  Overflow -- C collapsed, user drags separator left:

  +-------- A --------++-------- B --------+||+--+
  |      450px         ||      500px         |||50|
  |                    ||     (victim)       ||| C|
  +--------------------++--------------------+||+--+
                                              <- drag 350px

  Expand gate (G3): first 250px are consumed by the gate.
  C snaps to 300px. Remaining delta = 350 - 250 = 100px.
  Only 100px cascades to victims. B shrinks 100px -> 400:

  +-------- A --------++------ B ------+||+-------- C --------+
  |      450px         ||    400px       |||      300px         |
  |                    ||               |||   (expanded!)      |
  +--------------------++---------------+||+-------------------+
                                         <- drag
```

---

## Viewport clamp (redistributePanels)

After drag ends (and on window resize), `redistributePanels` runs
a pre-pass that clamps any panel exceeding the scroll parent's
visible width. This prevents a single panel from being wider than
the viewport, which would make it impossible to view fully even
by scrolling.

The clamp runs before the proportional ratio scaling, so it fires
even when the total panel sum matches available space (ratio ≈ 1).

---

## Pre-collapsed panels in cascade

Panels already collapsed at drag start are skipped (X) in both
Phase 1 and Phase 2 cascade.

### Phase 1 -- skip collapsed, cascade to next

```
  B already collapsed at drag start:

  +-------- A ---------++-- B --+||+-------- C ---------+
  |      450px         ||  50   |||      400px         |
  |   (victim 2)      || X     |||     (grower)       |
  +--------------------++-------+||+--------------------+
                               <- drag 200px

  Phase 1: A is first victim in cascade order -- but B is
  between separator and A. B is collapsed -> X skip.
  Cascade jumps to A. A donates 150px -> 300 (min):

  +----- A ------++- B -+||+----------- C -----------+
  |   300px       || 50  |||        550px              |
  |   (min)       ||  X  |||       (grower)            |
  +--------------++-----+||+--------------------------+
                         <- drag
```

### Phase 2 -- skip collapsed, continue cascade

```
  A=400, B=collapsed 50, C=300 (min), D=350. Drag left:

  +---- A -----++-- B --++---- C ------+||+---- D -----+
  |   400px     ||  50   ||  300px       |||   350px     |
  |             || X     ||  (min)       |||  (grower)   |
  +-------------++-------++-------------+||+-------------+
                                         <- drag

  Phase 1: C at min -> cascade. B collapsed -> X skip. A->300 (min).
  Phase 2: C collapses -> B X skip -> A collapses.
  D absorbs all freed (G8):

  +--++- B -++--+||+-------------- D ----------------+
  |50|| 50  ||50|||            850px                 |
  | A||  X  || C|||   (grower, absorbs all freed)    |
  +--++-----++--+||+---------------------------------+
                 <- drag
```

---

## G11 — Per-panel cascade (last victim off-screen)

When the last victim panel is not visible in the scroll
container viewport at drag start (overflow mode only),
the two-phase cascade (G9) is replaced by a per-panel
two-pass cascade:

**Phase 1** — shrink all victims to `minWidth`, nearest first
(identical to G9 Phase 1).

**Phase 2** — per-panel collapse, nearest first. Each victim
enters the collapse zone and collapses before the next is
touched. This ensures nearest-first collapse order.

Computed at drag start, fixed for the entire drag.

### Condition

Checked once at drag start (fixed for the drag):
- Mode is overflow (not autoFill)
- The last victim panel's bounding rect extends beyond the scroll
  container's visible edge

### Standard G9 (all victims visible)

All victims must shrink to minWidth before Phase 2 collapse starts.

```
  5 panels, all visible. Drag right:

  +--- A ----+||+--- B ----++--- C ----++--- D ----++--- E ----+
  |  400px    |||  350px    ||  350px    ||  350px    ||  350px    |
  | (grower)  ||| (victim1) || (victim2) || (victim3) || (victim4) |
  +-----------+||+----------++----------++----------++----------+
               -> drag

  Phase 1: B->300, C->300, D->300, E->300 (all at min)
  Phase 2: B collapses -> C collapses -> ...
```

### G11 per-panel cascade (last victim off-screen)

E is scrolled out of view. Per-panel cascade activates.

```
  5 panels, E off-screen. Drag right (A at 550, grower):

  +-------- A --------+||+--- B ----++--- C ----++--- D ----+  :+--- E ----+
  |      550px         |||  350px    ||  350px    ||  350px    |  :|  350px    |
  |     (grower)       ||| (victim1) || (victim2) || (victim3) |  :| (victim4) |
  +--------------------+||+----------++----------++----------+  :+----------+
                        -> drag                      viewport edge : off-screen

  Phase 1: B->300, C->300, D->300, E->300 (all shrink to min).
  Phase 2: B enters collapse zone -> collapses to 50.
  Then C -> collapses. Then D. Then E. Nearest first.

  +-------------- A ---------------+||+--++--++--++--+
  |          (grower)               |||50||50||50||50|
  |     (absorbs all freed)        ||| B|| C|| D|| E|
  +---------------------------------+||+--++--++--++--+
                                     -> drag
```
