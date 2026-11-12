---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: idealWidthFactor, fit_panels, ResizableSeparator, boardFits
---

# Board fit moves to a corner tab

The end handle after a board's last panel is gone. `BoardLayout` renders no separator after its last panel and shows
`BoardFitToggle`, a tab in the window's bottom-right corner, while the row is in the fit band. `idealWidthFactor` moves
from `resizable-panels.tsx` to `panel-layout.ts`, and `c:fit_panels` gives way to `c:fit_to_screen`, `c:more_room` and
their `_hint` keys.

## What & why

The end handle sat off screen while the row overflowed, and few found the drag to its fit line. Fit now changes the
layout only in the band where open panels fit at `minWidth` but not at their ideal width (E9 in `resizable-panels.md`).
Outside it the row scrolls at its ideal width. `ResizablePanelGroup` reports the band through `onFitBandChange` and
switches through `PanelGroupApi.setFit`.

## Blast radius

An app that imports `idealWidthFactor` (the compiler flags it), uses `c:fit_panels`, renders its own separator after a
group's last panel, or mirrors the row's width in a loading skeleton. An app that only renders `BoardLayout` gets the tab
as it is. No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. Import `idealWidthFactor` from `~/modules/common/resizable-panels/panel-layout`.
2. Drop any `ResizableSeparator` rendered after a group's last panel, with its `c:fit_panels` label.
3. In a skeleton that mirrors the row's width, drop the gap after the last panel, and count open panels at `minWidth` with fit only while that fits the parent (E2).
4. Optional: give a scrolling panel list `panelEndSpace` from `~/modules/common/board/board-fit-toggle`, so its last item scrolls clear of the tab.

## Verify

```sh
pnpm check
```
