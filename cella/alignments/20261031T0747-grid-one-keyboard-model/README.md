---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: cellSelectionMode, rowSelectionMode, selectedCellRange, onSelectedCellRangeChange, extendSelection, rdg-readonly, renderCell
---

# Data grid has one keyboard model

Drop `cellSelectionMode`, `rowSelectionMode` and the range props from `DataGrid` and `DataTable`, replace a table's `readOnly` with `hideEndMarker`, and pass the `tabIndex` of `renderCell` to every focusable control in a cell.

## What & why

The grid had three cell modes, three row modes and a `readOnly` flag, and only two combinations were in use. Every grid now has one Tab stop: arrows move between cells, Tab leaves, and the ring marks keyboard focus only. Row selection is the checkbox column. `CellRange`, `CellSelectionMode` and `RowSelectionMode` are gone.

## Blast radius

Breaking for an app with its own tables. A removed prop inside a spread object compiles without an error, and a control that ignores `tabIndex` only shows in the keyboard. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Delete `cellSelectionMode` from every `DataGrid` and `DataTable`.
2. Replace `readOnly` on a `DataTable` with `hideEndMarker` where the "all loaded" marker should stay hidden, and delete it elsewhere.
3. Delete `readOnly` from a `DataGrid`.
4. Replace a row-body selection through `rowSelectionMode` with `CheckboxColumn` and `selectedRows`.
5. In each app-owned `renderCell`, take `tabIndex` from the props and pass it to each button, link, switch or other control in the cell.

## Verify

Tab through each app-owned table: focus enters once, and one more Tab past the cell's controls leaves the table. Arrows move between cells. Then run `pnpm check`.
