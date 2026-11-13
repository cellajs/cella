---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: boardFits, setBoardFit, panelEndSpace, measureFit, fit_to_screen, more_room
---

# A board that fits at minWidth always fills its parent

The fit tab of `20261112T1217-board-fit-toggle` is gone: `board-fit-toggle.tsx` with `BoardFitToggle` and
`panelEndSpace`, the board store's `boardFits` and `setBoardFit`, `ResizablePanelGroup`'s `fit`, `onFitChange` and
`onFitBandChange`, `PanelGroupApi.setFit`, and the `c:fit_to_screen` and `c:more_room` keys with their `_hint`
variants. `measureFit` in `panel-layout.ts` gives way to `fitsAtMinWidth`, which returns a boolean.

## What & why

In the band where open panels fit at `minWidth` but not at their ideal width, the tab asked the user to choose between
fitting and scrolling. The choice helped little: a user who wants wider panels closes one. G6 in
`resizable-panels.md` now counts open panels at `minWidth`. A row in that band fills its parent, and only a row that
does not fit even then scrolls, at its ideal width. The E rules are gone.

## Blast radius

An app that imports `panelEndSpace`, calls `setBoardFit` (a demo seeding fit on), reads `boardFits` in a loading
skeleton, or passes `fit` to `ResizablePanelGroup`: the compiler flags each. A persisted `boardFits` entry is ignored.
No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. Drop `panelEndSpace` and the wrapper or class that applied it to a panel list.
2. Drop `setBoardFit` calls.
3. In a skeleton that mirrors the row's width, count open panels at `minWidth` whenever that fits the parent, without a `boardFits` switch (G6).
4. Drop `fit`, `onFitChange` and `onFitBandChange` from a `ResizablePanelGroup`, and calls to `PanelGroupApi.setFit`.
5. Point comments that cite the E rules of `resizable-panels.md` at G6.

## Verify

```sh
pnpm check
```
