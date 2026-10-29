---
breaking: false
clientCacheBump: false
grep: detailedMenu, setDetailedMenu, detailed_menu
---

# The detailed menu is always on

The menu sheet always lists a row's sub-rows below it. The "Detailed menu" preference switch, `detailedMenu` and
`setDetailedMenu` in the navigation store, the `detailedMenu` prop of `MenuSheetDraggableItem` and the second
parameter of `isSubmenuShown` are gone, with the `c:detailed_menu` locale keys. App code that read the field or passed
the flag drops it.

## What & why

With organization rails and a menu per organization, folding sub-rows away hid the list a user opened the menu for.
`isSubmenuShown(item)` is now true for every active row with sub-rows, the navigation store persists no `detailedMenu`,
and the preferences panel shows one switch less.

## Blast radius

Apps with the synced menu sheet get it on upgrade. Only an app-owned component, store consumer or test that read
`state.detailedMenu`, called `setDetailedMenu`, passed the flag to `isSubmenuShown` or translated `c:detailed_menu`
fails the typecheck or the locale check. No database or lens change.

## Run

No script: manual.

## Manual steps

1. Drop every read of `detailedMenu` and call of `setDetailedMenu` in app code; call `isSubmenuShown(item)` with the item alone.
2. Remove `detailed_menu` and `detailed_menu.text` from app locale files that still carry them.

## Verify

```sh
pnpm check
```
