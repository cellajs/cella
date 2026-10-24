---
syncBreaking: true
clientCacheBump: false
---

# Every reorder goes through ReorderHandle

A drag grip renders through `ReorderHandle` (`~/modules/common/reorder-handle/reorder-handle`), in a table through
`reorderColumn`, which now takes `getId`. `pnpm style` fails with `reorder-grip` on a file that imports a grip icon
(`GripVerticalIcon`, `GripHorizontalIcon`) and renders no handle. Replace an icon-only grip cell, separate Move up /
Move down buttons and a hand-written arrow-key grip with the handle.

## What & why

One reorder pattern for every list, table and board: a pointer drags the grip, a focused grip takes the arrow keys and
keeps focus with its item, and with increased contrast a click opens a menu of single moves (WCAG 2.5.7). The data
grid's `[data-drag-handle]` lookup is gone: a grip registers through `RowDragHandleContext`. The board context's
`onKeyDown` became `onMove(step)`.

## Blast radius

Apps with their own reorderable lists, tables or boards, and any caller of `reorderColumn` (typecheck flags the missing
`getId`). Apps that only use the template's menu sheet, tabs card, pages table and board are unaffected.

## Run

No script: manual.

## Manual steps

1. Find the sites: `pnpm style` lists every `reorder-grip` finding; also search for `move_up` / `move_down` buttons beside a list and `onKeyDown` handlers on a grip.
2. A table column whose cell renders only a grip icon (`rowDragHandle: true`): use `reorderColumn({ getId, getName, onMove, rowCount })`, with an `onMove(rowIdx, step)` that swaps the row with its neighbor and persists.
3. A list or card grip: render `<ReorderHandle id name index total onMove className>{visual}</ReorderHandle>`, delete the own `onKeyDown`, refocus effect and live region, and call `followReorderFocus(id)` in the drag source's `onDrop` when the grip is not the drag source.
4. Separate Move up / Move down buttons: delete them; the handle's menu covers a pointer that cannot drag.
5. Code reading `usePanelDragHandle().onKeyDown`: call `onMove(-1 | 1)`.

## Verify

```sh
pnpm style
pnpm check
```
