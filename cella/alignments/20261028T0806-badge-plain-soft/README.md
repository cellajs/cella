---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: bg-primary/5
---

# Badge plain is the soft badge

Badge's `plain` variant is gone: `<Badge variant="plain">` becomes `<Badge soft>`, the default primary intent with an
opaque 10% tint where `plain` drew a translucent 5% one. A primary chip or box that copied the `plain` recipe
(`border-primary/20 bg-primary/5`) takes `intent-primary soft-bg soft-border`, as the invitation chip now does. Alert
keeps its `plain` variant.

## What & why

Badge had two primary tints: `plain` (translucent, 5%) and `soft` (opaque, 10%). One recipe stays, so a primary badge
reads the same on every surface.

## Blast radius

App-owned Badge `plain` sites fail typecheck: raak `task/board-search.tsx`, `task/dropdowns/select-labels.tsx` (2),
`task/panel/task-panel-header.tsx`, `task/task-sheet-handler.tsx`; projectcampus `item/card/item-card-header.tsx`,
`label/select-labels.tsx`. Frontend only, no cache change.

## Run

No script: manual.

## Manual steps

1. Replace `variant="plain"` on each `Badge` with `soft`.
2. A map of Badge variants that holds `'plain'` maps that entry to `'default'` and passes `soft` for it.
3. Replace a hand-written `border-primary/20 bg-primary/5` tint with `intent-primary soft-bg soft-border`.

## Verify

```sh
pnpm check
```
