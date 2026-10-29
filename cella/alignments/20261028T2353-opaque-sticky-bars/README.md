---
breaking: false
clientCacheBump: false
grep: backdrop-blur
---

# Sticky bars are opaque

A bar that pins while content scrolls under it (a sheet or drawer header, the page tab nav, a search group heading,
the docs operations bar, the OpenAPI search) fills with a plain `bg-background`, `bg-card` or `bg-popover`: no `/NN`
opacity and no `backdrop-blur-*`. An app's own sticky bars follow the same rule; for raak that is the task card title in
`frontend/src/modules/task/card/task-card.tsx`.

## What & why

Sticky bars stack: a section bar pins under the page tabs, a sheet header over a list. A translucent blurred bar over
another doubles the dim and shows the lower bar's edge through the upper one, and bars that pin without blur (menu sheet
section headings, docs sidebar rows) sat beside ones with it. One rule now: a bar that can stick is opaque. Frosted
fills stay where nothing stacks: the cover heading bar, a tile's banner bar, the floating selection bar.

## Blast radius

Visual only. Apps that kept the synced components get it with the upgrade; only an app-owned `sticky` element, or one
`StickyBox` marks with `data-sticky`, that carries a `bg-*/NN` fill with `backdrop-blur-*` has to change. No database,
lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In app code, find each `sticky` element, or `data-[sticky=true]:` styling, with a `bg-<color>/<opacity>` fill and a `backdrop-blur-*`: make the fill opaque and drop the blur.
2. raak: in `task-card.tsx` the title's `data-[sticky=true]:bg-background/60` and `data-[sticky=true]:backdrop-blur-sm` become `data-[sticky=true]:bg-background`.

## Verify

```sh
pnpm check
```

By hand: open a page with tabs, scroll until they pin, then open a sheet and scroll its list: no bar shows what passes under it.
