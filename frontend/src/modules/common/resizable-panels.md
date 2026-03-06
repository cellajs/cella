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
| `maxWidth` | 600 (derived: minWidth x 2) |
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

  Keeps dragging -> B grows (capped at 600 in overflow, uncapped in autoFill):

  +--+||+----------------- B ---------------------+
  |  |||            600px (overflow cap)      |
  | A|||                                      |
  +--+||+-------------------------------------+
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
contribute `minWidth * 1.5`. If ideal sum + separator space <=
parentWidth -> autoFill, else -> overflow. Computed at drag
start and fixed for the entire drag. In overflow mode the
container min-width is set to the ideal sum so panels have
room to grow without collapsing others.

---

## G8 — Zero-sum resize

Every pixel freed by victims goes to the grower. In autoFill
mode the grower has no upper cap. In overflow mode the grower
stops at `maxWidth` (`minWidth x 2`) for normal resize, but
collapse-freed pixels extend the cap so the grower absorbs
the space instead of leaving a trailing gap. Additionally,
the `maxWidth` cap is lifted entirely when enforcing it would
push the total panel sum below `idealSum` -- this prevents
panels from snapping back on drag release.

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

### Cap lift (overflow mode)

In overflow mode the grower is normally capped at `maxWidth` + `collapseFreed`.
But if enforcing that cap would push the total panel sum below `idealSum`,
the cap is lifted entirely so the grower absorbs all freed pixels. This is
a safety valve that prevents `redistributePanels` from snapping panels back
to larger sizes on drag release (it would find `ratio > 1` and scale panels up).

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

Panels fit the container. `maxWidth` not enforced.
Collapse freed pixels go to grower (A2).

### A2 — Collapse funds the grower (autoFill)

In autoFill mode, freed collapse pixels go to the grower.
The grower has no upper cap in autoFill (G8), so it absorbs
all freed pixels. `redistributePanels` will rebalance on drop.

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
Collapse freed pixels go to grower (`maxWidth` extended by
`collapseFreed` so grower can absorb the space -- G8).
Expand is free: expand cost is subtracted from remaining
delta before victims are shrunk (O2).

### O1 — Collapse freed pixels fund grower (overflow)

In overflow mode, collapse freed pixels go to the grower just like
in autoFill. The grower's `maxWidth` cap is extended by `collapseFreed`
so it can absorb the space (see G8). The container `min-width` is
tightened to the actual panel sum mid-drag so no trailing gap appears.

```
  Overflow -- before:

  +-------- A ---------+||+----- B ------++----- C ------++----- D ------+
  |      450px         |||   300px       ||   400px       ||   350px       |
  |     (grower)       |||   (min)       ||               ||               |
  +--------------------+||+--------------++--------------++--------------+
                        -> drag (Phase 2 begins)

  B collapses -> 250 freed pixels extend A's cap and fund A:

  +----------------- A -----------------+||+--++----- C ------++----- D ------+
  |             700px                   |||50||   400px       ||   350px       |
  |     (grower, cap extended by 250)   ||| B||               ||               |
  +---------------------------------+||+--++--------------++--------------+
                                     -> drag

  Container min-width tightened to actual sum. No trailing gap.
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

## Grower maxWidth cap during collapse (overflow only)

In overflow mode, the grower's normal cap is `maxWidth` (2x minWidth).
Collapse freed pixels extend this cap by `collapseFreed` (G8). If
even the extended cap is insufficient and enforcing it would push the
total sum below `idealSum`, the cap is lifted entirely (cap lift).

In autoFill mode there is no cap -- the grower absorbs all freed
pixels (see A2). No spacer or gap is created.

### Overflow -- grower cap extended by collapseFreed

```
  A at 550px, overflow mode. B at minWidth, Phase 2 begins:

  +----------- A -----------+||+----- B ------++----- C ------+
  |     550px                |||   300px       ||   300px       |
  |    (grower)              |||   (min)       ||   (min)       |
  +--------------------------+||+--------------++--------------+
                              -> drag

  B collapses -> frees 250px. Normal cap = 600. Extended cap = 600+250 = 850.
  A grows from 550 to 800 (550 + 250 freed):

  +--------------------- A ---------------------+||+--++----- C ------+
  |                  800px                      |||50||   300px       |
  |       (grower, within extended cap 850)     ||| B||   (min)       |
  +---------------------------------------------+||+--++--------------+
                                                 -> drag
```

---

## G11 — Per-panel cascade (last victim off-screen)

When the last victim panel is not visible in the scroll
container viewport at drag start (overflow mode only),
the two-phase cascade (G9) is replaced by a gated
two-pass cascade:

**Phase 1** — shrink all victims to `minWidth`, nearest first
(identical to G9 Phase 1).

**Grower gate** — if the grower is still below its `maxWidth`
cap after Phase 1, skip collapse entirely. The freed shrink
pixels are sufficient; no panel needs to collapse.

**Phase 2** — per-panel collapse, nearest first. Only runs when
the grower has reached its cap. Each victim enters the collapse
zone and collapses before the next is touched. This ensures
nearest-first collapse order without premature collapse when
the grower still has room to grow.

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
  Grower gate: A would be 550 + 200 = 750. maxWidth = 600.
  750 >= 600 -> gate passed -> Phase 2 proceeds.

  Phase 2: B enters collapse zone -> collapses to 50.
  Then C -> collapses. Then D. Then E. Nearest first.

  +-------------- A ---------------+||+--++--++--++--+  :+----------+
  |          (grower)               |||50||50||50||50|  :|          |
  |                                 ||| B|| C|| D|| E|  :|          |
  +---------------------------------+||+--++--++--++--+  :+----------+
                                     -> drag
```

### Grower gate prevents premature collapse

```
  5 panels, E off-screen. Drag right (A at 350, grower):

  +--- A ----+||+--- B ----++--- C ----++--- D ----+  :+--- E ----+
  |  350px    |||  400px    ||  400px    ||  400px    |  :|  400px    |
  | (grower)  ||| (victim1) || (victim2) || (victim3) |  :| (victim4) |
  +-----------+||+----------++----------++----------+  :+----------+
               -> drag 400px

  Phase 1: B->300 (100), C->300 (100), D->300 (100), E->300 (100).
  totalFreed = 400. remaining = 0.
  Grower gate: A would be 350 + 400 = 750. But remaining is 0.
  No collapse needed. A grows to 600 (cap). No layout shift.

  (Without gate: B would shrink to 300 and then immediately collapse
   even though A only needed 250px to reach maxWidth.)
```

---

## G12 — Scroll compensation on expand (overflow)

Only applies when the grower panel (right of separator)
is at or past the right edge of the scroll container
viewport at drag start. When expanding such a collapsed
panel (dragging left), the expand adds content to the
right without moving the separator. After the expand
gate (G3) clears, `scrollLeft` is adjusted by `expandCost`
so the separator stays aligned with the cursor.
Reversing back into the gate scrolls to the right end
so the collapsed panel stays visible.
Computed at drag start, fixed for the entire drag.

```
  Overflow -- B collapsed, user drags last separator left:

  +-------- A ---------+||+--+
  |      400px         |||50|
  |    (victim)        ||| B|
  +--------------------+||+--+
                        <- drag

  Expand gate active (G3): user drags 250px left.
  Handle frozen, hint shows progress.
  Cursor is now 250px left of separator.

  Gate clears -> B snaps to 300px. Content grows right:

  +-------- A ---------+||+-------- B ---------+
  |      400px         |||      300px         |
  |    (victim)        |||    (expanded!)     |
  +--------------------+||+--------------------+
                                               <- cursor is here
            ^ separator is here (250px gap!)

  G12: scrollLeft += 250. Separator aligns with cursor:

  +-------- A ---------+||+-------- B ---------+
  |      400px         |||      300px         |
  |    (victim)        |||    (expanded!)     |
  +--------------------+||+--------------------+
                        <- cursor + separator aligned
```

Reversing back into the gate undoes the scroll adjustment.
This only applies to left-dragging (grower to the right).
Right-dragging with a left-side grower naturally moves the
separator with the cursor -- no compensation needed.
