---
breaking: true
clientCacheBump: true
caughtBy: nothing
grep: sort:, order:, orderByParam, SortFieldOf, getQueryKeySortOrder, stripForeignParams
---

# A list's sort lives in the URL as orderBy

A list route's search holds the API's own `orderBy` (`?orderBy=name+desc`) where it held `sort` and `order`.
`listSearchSchema` and `listSearchDefaults` give `{ q, orderBy }`, a query module sends `orderBy` unchanged, and
`useSortColumns(orderBy, setSearch)` splits it once for the grid. `orderByParam`, `SortOrder` and `SortFieldOf` are
gone.

## What & why

The URL split `orderBy` into `sort` and `order`, each query function joined them back with `orderByParam`, the backend
split them again and the grid mapped them to `ASC`/`DESC`. Now one value travels. `ListFilters` drops `sort`/`order`,
`GridSortOption.value` and `gridSortOptions` hold `orderBy` values (`'name asc'`), and the export fetchers
(`fetchOrganizationsForExport`, `fetchMembersForExport`) take `orderBy`.

## Blast radius

Every app with its own list pages, grids or sort selects. An old `?sort=` bookmark opens on the default sort. A query
key the app writes by hand with `sort`/`order` makes `getQueryKeySortOrder` prepend new rows: the compiler does not
see it.

## Run

No script: manual.

## Manual steps

1. Replace `sort`/`order` with `orderBy` in each list's search schema, query function, table (`useSortColumns(orderBy, setSearch)`) and sort select.
2. Drop each `orderByParam(sort, order)`: pass `orderBy`.
3. Search the app for hand-written query keys or `stripForeignParams` calls that name `sort` or `order`.

## Verify

```sh
pnpm check
```
