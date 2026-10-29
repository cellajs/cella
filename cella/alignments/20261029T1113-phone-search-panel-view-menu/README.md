---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: TableCount, BoardSearch, FeedSearch, SelectSort
---

# Phone search opens a panel; columns and export move into one View menu

`ColumnsView` and `Export` are gone: a bar renders `ViewMenu` (`~/modules/common/data-table/view-menu`) with `columns`,
`setColumns`, `export` and `sort`, and app rows become its children (`DropdownToggleItem`, `DropdownActionItem`).
`TableFilterBar` takes slots (`actions`, `count`, `search`, `filters`, `controls`, `searchVars`) and renders its own
`TableBarContainer`; `FilterBarActions`, `FilterBarSearch` and `FilterBarFilters` are gone. raak:
`task/table/tasks-table-bar.tsx`; projectcampus: `milestone/table/submissions-bar.tsx`.

## What & why

On a phone the search no longer shares one row with the actions and filters: a search button opens a panel pinned under
the page tabs (field with Cancel, then filters and count) while the list filters below it. Sort, columns and export sit in
one View menu at every width, a popup from `sm` up and a drawer below, so phones regain export and sort. `TableCount` now
shows on phones, stacking its extra under it.

## Blast radius

Bars built on `TableBarShell` change with the upgrade. App code that rendered `ColumnsView`, `Export`, the
`FilterBar*` parts or a `TableCount` beside its own field needs work. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Replace `<ColumnsView columns setColumns>{rows}</ColumnsView>` and `<Export ... />` with one `<ViewMenu columns={columns} setColumns={setColumns} export={{ filename, fetchRows, selectedRows }}>{rows}</ViewMenu>`; a `DropdownMenuCheckboxItem` row becomes `DropdownToggleItem` from `~/modules/common/dropdowner/dropdown-toggle-item`.
2. raak `task/table/tasks-table-bar.tsx`: the compact view row becomes `<DropdownToggleItem checked={isCompact} onCheckedChange={setIsCompact}>`, export moves into the same `ViewMenu`.
3. A bar composing `TableBarContainer` > `TableFilterBar` > `FilterBar*` parts passes them as slots instead: `<TableFilterBar actions={...} search={<TableSearch ... />} controls={<ViewMenu ... />} isFiltered onResetFilters />`.
4. projectcampus `milestone/table/submissions-bar.tsx`: the tab toggle goes to `actions`, `TableSearch` to `search`, the submitted tab's `ViewMenu` to `controls`.
5. A grid bar's sort passes `sort={{ options, value, onChange }}` to `TableBarShell` instead of a `SelectSort` in `filters`.
6. `TableCount` beside an app's own always-visible field (raak `board-header.tsx`, `tasks-table-bar.tsx`) now shows on phones: keep it, or pass `className="max-sm:hidden"` where the row gets too tight.
7. Optional: an app-owned search gets the phone panel by composing `TableFilterBar` (raak `BoardHeader`: `BoardSearch` as `search`, match mode and labels as `filters`, `DisplayOptions` in `controls`; projectcampus `ItemFeed`: `FeedSearch` as `search`, the post filter as `filters`). `TableFilterBarContext.isFilterActive` still says when the panel is open.

## Verify

```sh
pnpm check
```

By hand at 390 px: the search button opens the panel under the page tabs and focuses the field, Cancel clears and closes it, and the View menu opens as a drawer.
