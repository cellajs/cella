---
syncBreaking: true
clientCacheBump: false
---

# A memo must read what it depends on, and reordering gets buttons

The React Compiler rewrites `useMemo(fn, deps)` to depend on what `fn` reads, so a value that only sits in the
dependency array no longer triggers a recompute: `useMenu` is rebuilt from its query results for that reason, and an
app hook with the same shape needs the same change. `MenuItemEdit` takes `siblings` for its new move buttons, and
`ResponsiveSelect` takes `showTitle`.

## What & why

`useMenu` memoized `buildMenuFromCache(userId)` on the lists' update times. Compiled, the memo kept `userId` only, so
the menu sheet stopped updating after a mute, an archive or a reorder until a reload. It now builds from the `useQueries`
results it subscribes to. The same round adds reordering without dragging (tabs grid, menu edit mode, editor blocks,
zoomed image) and makes `Tooltip` and `HoverCard` close on Escape inside a sheet or dialog.

## Blast radius

Frontend only. Sync-breaking for an app that renders `MenuItemEdit` itself, or that has its own hook whose memo
depends on a value its callback never reads. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. A `useMemo` or `useCallback` whose dependency array names a value the callback does not read: pass that value in, or derive the result from the data itself.
2. `<MenuItemEdit item={item} />` → add `siblings`, the sorted list the item is ordered in.
3. A sheet, dialog, panel or hotkey with its own Escape handler returns early while `isHoverContentOpen()` is true.
4. A select that stands without a label in a filter bar passes `showTitle` to `ResponsiveSelect`.

## Verify

```sh
pnpm check
pnpm style
```
