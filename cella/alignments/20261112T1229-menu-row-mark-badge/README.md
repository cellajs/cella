---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# A menu row mark renders its own badge

`MenuSectionOptions.rowMark` in `frontend/src/modules/navigation/menu-sheet/section.tsx` returns `{ badge, label }`
in place of `{ icon, label }` and takes `isSubitem` as its second argument. The row renders `badge` beside its avatar,
inside the avatar's positioned box, and frames nothing around it.

## What & why

The muted mark left the avatar's bottom-right corner: it is a bell at the row's end, before the unseen count, and
"Muted" joins the row's accessible name. The avatar corner now belongs to the app's mark alone, and a badge that draws
itself can size for a sub-row's smaller avatar.

## Blast radius

An app whose menu section sets `rowMark`: the compiler flags its `{ icon, label }` return. An app without a row mark
is unaffected. No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. In each `rowMark`, return `badge` in place of `icon`: the glyph in its own absolutely positioned corner span, as the
   row drew it before (`bg-card absolute bottom-0 left-0 flex size-3.5 items-center justify-center rounded-tr-lg
   opacity-80` around a `size-2.5` icon), smaller when `isSubitem` is true.

## Verify

```sh
pnpm check
```
