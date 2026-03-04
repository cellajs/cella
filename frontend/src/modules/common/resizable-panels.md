# Resizable panels — visual examples

Diagram conventions:

- `║` = separator being dragged
- `→` / `←` = drag direction (centered in separator)
- `⊘` = panel skipped (pre-collapsed at drag start)
- `░░` = spacer (autoFill) or trailing gap (overflow)
- Panel text: `Name width (state)`

Constants used in all examples below:

| Prop | Value |
|------|-------|
| `minWidth` | 300 |
| `maxWidth` | 600 (derived: minWidth × 2) |
| `collapsedWidth` | 50 |
| Collapse snap | `(50 + 300) / 2.2 ≈ 159` |
| Expand gap | `300 − 50 = 250` |

---

## G1 — Direction determines roles

Drag right → left panel is the grower, right panel is the victim.

```
  ┌──────── A ─────────┐║┌──────── B ─────────┐
  │      400px         │║│      400px         │
  │     (grower)       │║│     (victim)       │
  └────────────────────┘║└────────────────────┘
                        → drag
```

Drag left → right panel is the grower, left panel is the victim.

```
  ┌──────── A ─────────┐║┌──────── B ─────────┐
  │      400px         │║│      400px         │
  │     (victim)       │║│     (grower)       │
  └────────────────────┘║└────────────────────┘
                        ← drag
```

---

## G2 — Collapse snap

Snap at ≈159px. Below snap → collapse to 50. Above → back to 300.

```
  Before:

  ┌──────── A ─────────┐║┌──────── B ─────────┐
  │      450px         │║│      350px         │
  │                    │║│                    │
  └────────────────────┘║└────────────────────┘
                        → drag

  B shrinks past snap (≈159px) → collapses to 50:

  ┌─────────────── A ───────────────┐║┌──┐
  │           750px                 │║│50│
  │          (grower)               │║│ B│
  └─────────────────────────────────┘║└──┘
                                     → drag
```

Once collapsed, B stays collapsed for the rest of this drag.

---

## G3 — Expand snap

B is collapsed. User drags left — B is the grower. Must accumulate
the full expand gap (250px) before B snaps to minWidth.

```
  Before:

  ┌──────── A ─────────┐║┌──┐
  │      500px         │║│50│
  │     (victim)       │║│ B│
  └────────────────────┘║└──┘
                        ← drag

  User drags 250px left. Handle frozen, hint shows progress 0→1.
  At 250px → B snaps to minWidth:

  ┌───── A ─────┐║┌──────── B ─────────┐
  │   250px     │║│      300px         │
  │  (victim)   │║│   (expanded!)      │
  └─────────────┘║└────────────────────┘
                 ← drag

  Keeps dragging → B grows toward maxWidth (600):

  ┌──┐║┌───────────────── B ─────────────────┐
  │  │║│            600px (max)              │
  │ A│║│        layout frozen here           │
  └──┘║└─────────────────────────────────────┘
     ← drag
```

---

## G8 — Zero-sum resize (Phase 1)

Every pixel freed by the victim goes to the grower.

```
  Before:

  ┌──────── A ─────────┐║┌──────── B ────────┐┌──────── C ────────┐
  │      400px         │║│      400px        ││      400px        │
  │     (grower)       │║│     (victim)      ││                   │
  └────────────────────┘║└───────────────────┘└───────────────────┘
                        → drag 100px

  After — B donates 100px to A. Total unchanged:

  ┌─────────── A ───────────┐║┌───── B ─────┐┌───────── C ────────┐
  │        500px            │║│   300px     ││       400px        │
  │       (grower)          │║│   (min)     ││                    │
  └─────────────────────────┘║└─────────────┘└────────────────────┘
                              → drag
```

---

## G9 — Two-phase cascade

### Phase 1 — shrink cascade

B hits minWidth, remaining delta cascades to C.

```
  Before:

  ┌──── A ─────┐║┌───── B ──────┐┌──────── C ────────┐
  │   350px     │║│   350px       ││      500px         │
  │  (grower)   │║│  (victim 1)   ││    (victim 2)      │
  └─────────────┘║└──────────────┘└────────────────────┘
                  → drag 200px

  Phase 1: B shrinks 50px → 300 (min). 150px remain.
  Cascade: C shrinks 150px → 350:

  ┌─────────── A ───────────┐║┌───── B ──────┐┌───── C ──────┐
  │        550px             │║│   300px       ││   350px       │
  │       (grower)           │║│   (min)       ││               │
  └──────────────────────────┘║└──────────────┘└──────────────┘
                              → drag
```

### Phase 2 — collapse cascade

All victims at minWidth. Further delta triggers collapse zone.

```
  Before (all at min from prior Phase 1):

  ┌──────────── A ───────────┐║┌───── B ───────┐┌───── C ──────┐
  │        600px             │║│   300px       ││   300px      │
  │       (grower)           │║│   (min)       ││   (min)      │
  └──────────────────────────┘║└───────────────┘└──────────────┘
                              → drag more

  B enters collapse zone, hits snap (≈159) → collapses to 50.
  Then C enters collapse zone → collapses to 50:

  ┌──────────────────────── A ────────────────────────┐║┌──┐┌──┐
  │                    600px (max, capped)            │║│50││50│
  │                                                   │║│ B││ C│
  └───────────────────────────────────────────────────┘║└──┘└──┘
                                                        → drag
```

---

## G10 — No swap: expand blocks direct victim collapse

B is collapsed (grower side). A is the direct victim.
While B is expanding, A cannot enter Phase 2.

```
  Before:

  ┌──────── A ─────────┐║┌──┐┌──────── C ─────────┐
  │      500px         │║│50││      450px         │
  │   (direct victim)  │║│ B││                    │
  └────────────────────┘║└──┘└────────────────────┘
                        ← drag

  Handle frozen during expand gate (B accumulating 250px).
  A stays at 500px — NOT allowed to collapse even though
  B's expand is consuming delta. Cascade skips A, looks
  past for Phase 1 donors only.
```

---

## A2 — Collapse funds the grower (autoFill)

In autoFill mode, freed collapse pixels go to the grower.

```
  AutoFill — before:

  ┌──────── A ─────────┐║┌───── B ──────┐┌───── C ──────┐
  │      400px         │║│   300px       ││   300px       │
  │     (grower)       │║│   (min)       ││   (min)       │
  └────────────────────┘║└──────────────┘└──────────────┘
                        → drag (Phase 2 begins)

  B collapses → 250 freed pixels fund A:

  ┌─────────────── A ───────────────┐║┌──┐┌───── C ──────┐
  │           600px (max)           │║│50││   300px       │
  │          capped here            │║│ B││   (min)       │
  └─────────────────────────────────┘║└──┘└──────────────┘
                                     → drag

  If A was already near max, excess → spacer:

  ┌─────────── A ───────────┐║┌──┐┌───── C ──────┐ ░░░░░░░░░░░░░░░
  │     600px (max)          │║│50││   300px       │ ░░ spacer 50px ░
  │     capped               │║│ B││   (min)       │ ░░░░░░░░░░░░░░░
  └──────────────────────────┘║└──┘└──────────────┘
                              → drag
```

---

## O1 — Collapse → trailing gap (overflow)

In overflow mode, freed collapse pixels do NOT fund the grower.
They appear as a trailing gap. Scroll is disabled during drag (O4).

```
  Overflow — before:

  ┌──────── A ─────────┐║┌───── B ──────┐┌───── C ──────┐┌───── D ──────┐
  │      450px         │║│   300px       ││   400px       ││   350px       │
  │     (grower)       │║│   (min)       ││               ││               │
  └────────────────────┘║└──────────────┘└──────────────┘└──────────────┘
                        → drag (Phase 2 begins)

  B collapses → 250 freed pixels go to trailing gap, NOT to A:

  ┌──────── A ─────────┐║┌──┐┌───── C ──────┐┌───── D ──────┐ ░░░░░░░░░░░░░░░
  │      450px         │║│50││   400px       ││   350px       │ ░░ gap 250px ░░
  │  (unchanged!)      │║│ B││               ││               │ ░░░░░░░░░░░░░░░
  └────────────────────┘║└──┘└──────────────┘└──────────────┘

  On drop: gap removed, virtual container shrinks by 250px.
  Scroll restored to auto.
```

---

## O2 — Expand consumes trailing gap first (overflow)

If a trailing gap exists from a prior collapse in the same drag,
expanding a panel uses the gap before growing the virtual container.

```
  Mid-drag — B collapsed earlier, trailing gap exists:

  ┌──────── A ────────┐┌──┐║┌──────── C ────────┐ ░░░░░░░░░░░░░░░
  │      450px         ││50│║│      500px         │ ░░ gap 250px ░░
  │                    ││ B│║│     (victim)       │ ░░░░░░░░░░░░░░░
  └────────────────────┘└──┘║└────────────────────┘
                           ← drag (B is grower, expanding)

  B expand snaps (needs 250px). Gap has 250px → fully consumed:

  ┌──────── A ─────────┐┌───── B ──────┐║┌──────── C ─────────┐
  │      450px         ││   300px       │║│      500px         │
  │                    ││  (expanded!)  │║│                    │
  └────────────────────┘└──────────────┘║└────────────────────┘
                                        ← drag

  Gap gone. Virtual container unchanged. Normal resize resumes.
```

---

## Pre-collapsed panels in cascade

Panels already collapsed at drag start are skipped (⊘) in both
Phase 1 and Phase 2 cascade.

### Phase 1 — skip collapsed, cascade to next

```
  B already collapsed at drag start:

  ┌──────── A ─────────┐┌── B ──┐║┌──────── C ─────────┐
  │      450px         ││  50   │║│      400px         │
  │   (victim 2)      ││ ⊘     │║│     (grower)       │
  └────────────────────┘└───────┘║└────────────────────┘
                                ← drag 200px

  Phase 1: A is first victim in cascade order — but B is
  between separator and A. B is collapsed → ⊘ skip.
  Cascade jumps to A. A donates 150px → 300 (min):

  ┌───── A ──────┐┌─ B ─┐║┌─────────── C ───────────┐
  │   300px       ││ 50  │║│        550px              │
  │   (min)       ││  ⊘  │║│       (grower)            │
  └──────────────┘└─────┘║└──────────────────────────┘
                         ← drag
```

### Phase 2 — skip collapsed, continue cascade

```
  A=400, B=collapsed 50, C=300 (min), D=300 (min). Drag right:

  ┌──── A ─────┐┌── B ──┐┌──── C ──────┐║┌──── D ─────┐
  │   400px     ││  50   ││  300px       │║│   350px     │
  │             ││ ⊘     ││  (min)       │║│  (grower)   │
  └─────────────┘└───────┘└─────────────┘║└─────────────┘
                                         → drag

  Phase 1: C at min → cascade. B collapsed → ⊘ skip. A→300 (min).
  Phase 2: C collapses → B ⊘ skip → A collapses:

  ┌──┐┌─ B ─┐┌──┐║┌──────────── D ────────────┐ ░░░░░░░░░░░░░░░░░
  │50││ 50  ││50│║│         500px              │ ░░ gap / spacer ░░
  │ A││  ⊘  ││ C│║│        (grower)            │ ░░░░░░░░░░░░░░░░░
  └──┘└─────┘└──┘║└────────────────────────────┘
                 → drag
```

---

## Grower maxWidth cap during collapse

When collapse frees pixels but the grower is at or near maxWidth,
excess pixels go to the spacer (autoFill) or trailing gap (overflow).

### AutoFill — grower near max

```
  A at 550px (near max). B at minWidth, Phase 2 begins:

  ┌─────────── A ───────────┐║┌───── B ──────┐┌───── C ──────┐
  │     550px                │║│   300px       ││   300px       │
  │    (grower, near max)    │║│   (min)       ││   (min)       │
  └──────────────────────────┘║└──────────────┘└──────────────┘
                              → drag

  B collapses → frees 250px. A can only take 50px (→600 max).
  Remaining 200px → spacer:

  ┌─────────────── A ───────────────┐║┌──┐┌───── C ──────┐ ░░░░░░░░░░░░░░░░
  │          600px (max)            │║│50││   300px       │ ░░ spacer 200px ░
  │                                 │║│ B││   (min)       │ ░░░░░░░░░░░░░░░░
  └─────────────────────────────────┘║└──┘└──────────────┘
                                     → drag
```

### AutoFill — grower already at max

```
  A already at maxWidth. All victims at min:

  ┌─────────────── A ───────────────┐║┌───── B ──────┐┌───── C ──────┐
  │          600px (max)            │║│   300px       ││   300px       │
  │                                 │║│   (min)       ││   (min)       │
  └─────────────────────────────────┘║└──────────────┘└──────────────┘
                                     → drag

  B collapses → frees 250px. A can accept 0px.
  All 250px → spacer:

  ┌─────────────── A ───────────────┐║┌──┐┌───── C ──────┐ ░░░░░░░░░░░░░░░░░
  │          600px (max)            │║│50││   300px       │ ░░ spacer 250px ░░
  │                                 │║│ B││   (min)       │ ░░░░░░░░░░░░░░░░░
  └─────────────────────────────────┘║└──┘└──────────────┘
                                     → drag
```
