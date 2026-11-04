---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: noTailwindRawColors
---

# Classes name a theme color, not a palette color

`nursery/noTailwindRawColors` refuses a palette color such as `text-red-500` or `bg-zinc-300` in `className`, `cn()`, `tw()`, `clsx()` and `cva()`. App-owned code takes a theme token (`text-destructive`, `text-success`, `border-input`, `bg-brand/10`). raak: `task/task-styles.ts`, `task/panel/panel-status-section.tsx` and `task/card/task-start-check.tsx`. projectcampus: `item/card/item-card-footer.tsx` and `comment/thread/comment-row-actions.tsx`.

## What & why

A palette color ties a class to one hue in one mode; a theme token carries the role, so a theme change and dark mode reach it. Upstream swapped its own uses, and the drawn device in `marketing/device-mockup-frame.tsx` is exempt in `biome.jsonc` because its colors are the hardware's.

## Blast radius

Apps with palette classes in app-owned code. Plain string maps (a `Record` of classes) are not checked. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. For each finding, swap the class for the theme token of its role; a set of colors with no role (a status palette an app defines) becomes theme variables in the app's CSS or takes a `biome-ignore` with that reason.

## Verify

```sh
pnpm check
```
