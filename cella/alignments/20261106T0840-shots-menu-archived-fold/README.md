---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: data-archived-visible
---

# The screenshots' openMenu folds Archived through a div

`openMenu` in the app-owned `cella/skills/screenshots/shots-config.mjs` finds the unfolded Archived rows with
`#nav-sheet li[data-archived-visible="true"][data-has-archived="true"] > div button`. The menu's archived group is a
`div` now, so that selector matches nothing and every menu-open shot shows the archived entities unfolded. Drop the
`li`: `#nav-sheet [data-archived-visible="true"][data-has-archived="true"] > div button`.

## What & why

`MenuSheetArchivedGroup` (`frontend/src/modules/navigation/menu-sheet/archived-group.tsx`) renders the Archived row and
its rows in a `div` that carries `data-archived-visible` and `data-has-archived`. The shot config is pinned to the app,
so its copy keeps the selector written for the earlier `li`. The driver reports no error: the loop finds nothing to
fold and the shot ships with the archived rows open.

## Blast radius

An app whose `shots-config.mjs` still holds the template's `openMenu` (projectcampus does). No wire, database or cache
change. An app that shoots no menu-open screenshot is unaffected.

## Run

No script: manual.

## Manual steps

1. In `cella/skills/screenshots/shots-config.mjs`, remove `li` from the `unfolded` locator in `openMenu`.

## Verify

Re-shoot one menu-open shot (`node cella/skills/screenshots/shot-driver.mjs <id>`) and check that the menu shows the
Archived row folded, with its count.

```sh
pnpm check
```
