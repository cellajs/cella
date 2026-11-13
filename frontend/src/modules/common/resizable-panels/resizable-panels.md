# Resizable panels: rules & visual examples

These rules state what the component does and is meant to do. Rule ids are stable: code comments refer to them, so a removed rule leaves a gap in the numbering. Rule ids name their tests.

Diagram conventions:

- `||` = separator being dragged
- `->` / `<-` = drag direction (centered in separator)
- `X` = panel skipped (pre-collapsed at drag start)
- Panel text: `Name width (state)`

Constants used in all examples:

| Prop             | Value                    |
| ---------------- | ------------------------ |
| `minWidth`       | 300                      |
| `collapsedWidth` | 50                       |
| Collapse snap    | `(50 + 300) / 2.2 ~ 159` |
| Expand gap       | `300 - 50 = 250`         |

## General rules

- **State**: `resolveLayout(panels, drag, dx)` is a pure, idempotent function of the panels, the state captured at drag start and the pointer delta, returning the complete layout (widths + hint data). Dragging back reverses the change; no undo logic.
- **Layout**: pixel widths (`style.width`) in a flex container; no CSS grid or fr tracks. Stored widths equal rendered widths (P2).
- **Widths**: a panel is at `collapsedWidth` or at `minWidth` and above, never between.

## G1: Direction determines roles

The panel on the shrinking side of the separator is the victim, the growing side is the grower. Drag right: left panel grows. Drag left: right panel grows.

## G2: Collapse snap

- Snap point: `(collapsedWidth + minWidth) / 2.2`. Past it the victim snaps to `collapsedWidth`; back before it, to `minWidth`.
- While a victim traverses the collapse zone (`minWidth` -> snap point) the layout freezes and only the collapse hint progresses. Released in the zone, the victim stays at `minWidth`.
- Once collapsed, the panel stays collapsed for the rest of the drag; further delta cascades to the next victim (G9). Dragging back past the snap point reopens it (see General rules, State).

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
- Past the gate, who pays for the opening depends on the mode: G10 in autoFill, O2 in overflow.

```
  A=500 (victim), B=50 (collapsed grower), autoFill, drag left.
  Handle frozen for 250px, hint 0->1. At 250px B snaps to minWidth and A has paid 200 of the 250:

  +------- A -------+||+-------- B ---------+
  |     300px       |||      300px         |
  |  (victim, min)  |||   (expanded!)      |
  +-----------------+||+--------------------+
                     <- drag
```

## G4: Resize hints

In collapse and expand zones a curtain grows from the dragged separator with progress 0->1. Its leading edge is lit at the pointer's height.

- `collapse`: the curtain covers the panel up to its collapsed width, the part that leaves.
- `expand`: the curtain covers the neighbour across the separator by the width the panel takes.

The leading edge ends where the dragged separator stops after the snap. As the curtain grows, the edge widens to the separator's width while the separator thins and fades, so at the snap the separator takes the edge's place.

As progress grows, the panel content fades out:

- `fade="all"` (default): all content fades.
- `fade="marked"`: only content the other state lacks fades, so whatever both states show (frame, avatar, counts) stays solid. Content that only the collapsed state shows can fade in at its collapsed position, so a collapse hint at full progress already shows the collapsed panel.

When a panel opens, its marked content fades in.

## G5: Keyboard

No cascade: a key only touches the two panels beside the separator. A collapsed victim blocks the key: nothing moves.

- **Arrow keys** move the separator by 20px. The victim stops at `minWidth`: an arrow never collapses a panel. The grower takes what the victim gave, uncapped.
- **A collapsed grower** opens to `minWidth` when an arrow or Home/End pulls it open, also when the victim is already at `minWidth`. Then L2's refit rules apply, because the total grew.
- **Home/End** take the separator to its limit in one press: Home collapses the left panel, End the right one, and the other takes the freed width. If the other was collapsed, that swaps them. A non-collapsible panel stops at `minWidth`.
- **Enter** toggles collapse on the left panel of the separator. The last panel has no separator of its own: only its handle reaches it.

## G6: Mode detection

Min sum: collapsed panels contribute `collapsedWidth`, others `minWidth`. Min sum + separator space <= parentWidth -> autoFill, else overflow. A row that fits at `minWidth` fills its parent instead of scrolling sideways, even when that narrows its panels below their ideal width; a user who wants wider panels closes one.

Computed at drag start and fixed for the drag; between drags it is computed again on every refit, so a resize can cross it. In overflow mode the container min-width is the larger of the ideal sum and the actual sum, plus separators: panels grow without collapsing others. The ideal sum counts each open panel at `minWidth * 1.25`: a row that has to scroll anyway gives its panels room.

## G8: Zero-sum resize (no max-width cap)

During a drag every pixel freed by victims goes to the grower, uncapped in both modes. The total panel sum stays constant: no mid-drag container width adjustment, no scroll compensation. A collapsed grower opening is the one exception: see G10 and O2.

## G9: Two-phase cascade

- Phase 1: shrink victims toward `minWidth` in order away from the separator.
- Phase 2: collapse, only after all victims are at min, nearest first: each victim enters the collapse zone and collapses before the next is touched; freed pixels fund the grower (G8).
- Panels collapsed at drag start are skipped in both phases.
- Non-collapsible victims stop at `minWidth` in phase 1 and are skipped in phase 2.

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

```
  A=400, B=collapsed 50, C=300 (min), D=350. Drag left:

  +---- A -----++-- B --++---- C ------+||+---- D -----+
  |   400px     ||  50   ||  300px       |||   350px     |
  |             || X     ||  (min)       |||  (grower)   |
  +-------------++-------++-------------+||+-------------+
                                         <- drag

  Phase 1: C at min -> cascade. B collapsed -> X skip. A -> 300 (min).
  Phase 2: C collapses -> B X skip -> A collapses. D absorbs all freed (G8) -> 950.
```

## G10: No swap (expand blocks direct victim collapse)

AutoFill only. While a collapsed grower is expanding via the expand gate, the direct victim cannot collapse until the pixels freed by Phase 1 shrinking meet the expand cost (`totalFreed >= expandCost`). Once funded, further collapse is normal nearest-first cascading, not a swap.

If victims cannot fund it, the grower opens anyway and the row runs over by the shortfall until the drop. The drop computes the mode again (G6), which then usually gives overflow: the row can scroll, so nothing is lost.

```
  Parent 500, A=443, B=50, drag left 260. A pays 143 of the 250, B opens:

  mid-drag:    A=300, B=300 (over by 107)
  after drop:  A=375, B=375, container min-width 757 (overflow)
```

## AUTOFILL MODE

Panels fit the container; `redistributePanels` rebalances on drop and on resize (R1).

```
  A=400 (grower), B=300, C=300, drag right (Phase 2). B collapses -> 250 freed pixels fund A:

  +------------------- A ---------------------+||+--++----- C ------+
  |               650px                       |||50||   300px       |
  |           (grower, uncapped)              ||| B||   (min)       |
  +-------------------------------------------+||+--++--------------+
                                               -> drag
```

## OVERFLOW MODE

Panels exceed the container (horizontal scroll).

### O2: Expand is free in overflow mode

The expand cost (`minWidth - collapsedWidth`) is subtracted from the remaining delta before victims shrink: the panel grows to `minWidth` by adding content to the container, and only the delta beyond the expand cost cascades to victims. What victims then give goes to the grower too (G8).

```
  Overflow, C collapsed, drag separator left 350px:

  +-------- A --------++-------- B --------+||+--+
  |      450px         ||      500px         |||50|
  |                    ||     (victim)       ||| C|
  +--------------------++--------------------+||+--+
                                              <- drag 350px

  Expand gate (G3) consumes the first 250px, C snaps to 300.
  Remaining 100px cascades: B shrinks -> 400, C -> 400:

  +-------- A --------++------ B ------+||+-------- C --------+
  |      450px         ||    400px       |||      400px         |
  |                    ||               |||   (expanded!)      |
  +--------------------++---------------+||+-------------------+
                                         <- drag
```

## Lifecycle

- **L1, first mount:** a panel's width is its `defaultLayout` entry, else its last expanded width in this group, else `minWidth`. Every collapsible panel reports its state through `onCollapseChange`. The row then refits (R1) and, if that changes a width, saves (P1).
- **L2, panel added:** it takes its width as in L1, and the row refits: autoFill scales the others to make room, overflow grows the container. Crossing the min sum switches the mode (G6).
- **L3, panel removed:** the row refits to take up the room. The consumer keeps the stored width, so a panel that returns takes its old place in the proportions; failing that, the group remembers its last expanded width.
- **L4, reorder:** widths stay with their panels and a separator stays at its index, so it now sits between other panels. Every separator-index lookup re-sorts by DOM order. A reorder saves nothing.
- **L5, group `id`:** a new `id` re-registers every panel against `defaultLayout`. With the same `id`, a changed `defaultLayout` is only read when a panel registers.
- **L6, panel set changes during a drag:** the drag aborts. Widths go back to the drag's start, nothing is saved, and the rest of that pointer gesture is ignored.
- **L7, observers:** a `ResizeObserver` watches the container and its parent, on both axes, and refits unless a drag runs. On a board whose height follows its lists, a list changing height therefore refits too.
- **L8, pointer:** only the primary button starts a drag, only the pointer that started it moves it, and a `pointercancel` aborts it as in L6.

## Refit (redistributePanels)

- **R1, scaling:** collapsed panels keep `collapsedWidth`. Open panels scale in proportion to their widths to fill the container exactly. A panel a share would take below `minWidth` holds it, and the others share what is left. Shares are not rounded, so a row refitted on every pixel of a resize keeps its proportions.
- **R2, no overflow:** a row over its container by any amount refits. Panels do not shrink, so even a pixel over would let the board scroll sideways. A gap under 1px stays: overflow mode rounds the container's min-width up.
- **R3, viewport clamp:** after a drag and on resize, a pre-pass clamps any panel wider than the scroll parent's visible width. It runs before R1, so it fires even when the total already matches (ratio ≈ 1).
- **R4, during a drag:** no refit. A resize during a drag is applied at the drop.
- **R5, no memory:** rendered widths are what is stored (P2), so narrowing and widening again does not bring back the earlier widths. A panel can even grow while the page narrows, when R3 clamps a wide panel and R1 hands the rest to its neighbour.

```
  Parent 1600, A=300, B=1293.36. Narrow to 700, then widen to 1600:

  700:   A=481, B=693, container min-width 1182 (overflow)
  1600:  A=653, B=941
```

## Toggle and expand

- **T1, `togglePanel`:** closing goes to `collapsedWidth`, freeing the room for the others. Opening goes to the panel's last expanded width and then refits, so everyone scales and the panel rarely gets its exact old width back.
- **T2, `expandPanel`:** a no-op on an open panel, nothing saved. `BoardLayout` calls it when the store marks a panel open from outside.
- **T3, no room to open:** the row goes to overflow (G6). A panel never closes to make room for another.
- **T4, all closed:** allowed. The row shows its strips and empty space, with no min-width. Opening one fills the row.
- **T5, non-collapsible:** toggling does nothing.
- **T6, glide:** a toggle, `expandPanel` and Home/End (G5) move every width in one 200ms eased step. A panel that opens or closes keeps its content at its open width: the moving edge uncovers or covers it. A closing panel's content fades as a collapse hint fades it (G4), and its open content stays mounted until the step ends, when its collapse is reported (P3). A drag never glides: starting one lands a running glide on its target. With reduced motion the widths change at once.

## Saving

- **P1, `onLayoutChanged`** fires with the widths of all mounted panels after: a drag ends, a keyboard action (also one that moved nothing), a toggle, a refit that changed a width. A refit from a resize fires once no resize followed for 150ms, because a resize refits on every frame, and one still pending at unmount is dropped. It does not fire on an aborted drag.
- **P2, what is saved:** rendered widths. A stored width at or below `collapsedWidth` means collapsed; the consumer keeps entries of unmounted panels.
- **P3, `onCollapseChange`** fires when a collapsible panel registers and on each change, for a panel a glide closes once the glide ends (T6). Collapsed is `width <= collapsedWidth`.

## Contract with the parent and panels

- **C1, parent:** the group measures its parent and fills it. Overflow mode only works if the parent can scroll, as `ScrollArea` does: a clipping parent cuts off what overflows, with no way to reach it.
- **C2, sizes:** `minWidth` and `collapsedWidth` are per panel, and `collapsible` can be off. The API supports mixing them, and they follow the same rules, but every consumer today uses one size and collapsible panels.
- **C3, direction:** left to right only.
- **C4, separators:** separator `i` sits between panels `i` and `i + 1`, so `index` has no gaps. The last panel has none after it.

## Must-fit (`mustFit`)

For a parent that cannot scroll, such as a public page. The rules above hold unless one of these replaces them. Fixed for the group's lifetime.

- **F1, the row fits:** it always fills its parent exactly, with no container min-width and no overflow mode. G6, O2, R2, R3 and R5 do not apply.
- **F2, closing:** a panel that does not fit collapses to its strip. It is not hidden, because its tasks would look gone.
- **F3, which closes:** the least recently touched, among equals the rightmost. A panel just opened, just added or holding focus closes last.
- **F4, room returns:** panels the fit closed reopen, last closed first, once one fits with 24px to spare. Without the margin a classic scrollbar appearing could close a panel, shorten the page, remove the scrollbar and reopen it. A panel the user closed stays closed.
- **F5, one stays open:** toggling the last open panel does nothing.
- **F6, too narrow for one:** one panel stays open and the rest is clipped. Give the group few enough panels for the narrowest width it renders at.
- **F7, swap:** dragging a closed panel open with no room closes the direct victim, instead of G10. Until the victims can pay for it, the drag holds at the gate, whatever the pointer does. The total never changes.
- **F8, what is saved:** the user's choice, not the rendered widths (replaces P2 and T1). A drag or keyboard action that moved something makes the row as it now stands the choice, leaving out panels the fit closed. A toggle changes only that panel, and reopens it at its own earlier choice. Nothing else writes the choice, so a resize, mount, or added or removed panel never saves, and narrowing and widening again brings back the same widths.
- **F9, observers:** only a change of the parent's width refits (replaces L7). Lists changing height do not.

Rendered widths come from one function of the choice and the available width, `fitPanels`. It holds for any stored value, so a stale or corrupt width can change proportions but not break the layout.
