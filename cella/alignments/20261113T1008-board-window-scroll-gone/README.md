---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: autoHeight, windowScroll, stickyCountClass, stickyPreviewCountClass
---

# A board always scrolls inside its own frame

`BoardLayout` loses `autoHeight`, and `BoardPanelBody` and `CollapsedPanelView` lose `windowScroll`. A board no longer
grows with its content under a page that scrolls: every panel body takes the viewport height less
`--board-panel-offset`, and its lists scroll inside it. A collapsed strip is 46px wide, and its counts show at half
strength until the strip is hovered or focused (the `strip-fade` utility).

## What & why

The window-scroll mode kept sticky counts and section bars aligned with the page through a clipping wrapper. No
template board used it, and a clipping parent cuts off a row that overflows (C1 in `resizable-panels.md`). One
scroll mode keeps the strip and its counts in one place.

## Blast radius

An app that passes `autoHeight` to `BoardLayout`, or `windowScroll` to `BoardPanelBody` or `CollapsedPanelView`: the
compiler flags each. A layout built for 50px collapsed strips is 4px narrower per strip. No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. Drop `autoHeight` from `BoardLayout`, and give the board a parent with a height, such as a `ScrollArea` or a sized page section.
2. Drop `windowScroll` from `BoardPanelBody` and `CollapsedPanelView`.
3. Where an app's own CSS or skeleton assumes a 50px collapsed strip, read `collapsedPanelMinWidth` instead.

## Verify

```sh
pnpm check
```
