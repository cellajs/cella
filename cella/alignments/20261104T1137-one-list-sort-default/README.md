---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: SearchDefaults, saveDataInSearch, channelListSearchDefaults
---

# A list's default sort lives in its request schema, and a list shows the sort it fetches

`getOrderColumns` takes no `fallback`, and a list query's `sort` and `order` options are required. Frontend defaults
come from `listSearchDefaults(zGetXQuery)` and route schemas from `listSearchSchema(zGetXQuery, defaults?)` in
`~/modules/common/search-params-schemas`. `defaultOrderFor` is gone. `EntityGridBar` takes `sortOptions` built from
`gridSortOptions`, and its grid passes `defaults: gridSortDefaults(sortOptions)` to `useSearchParams`. raak: the
projects grid, project and workspace `query.ts`, and the workspace, label, project and task queries. projectcampus:
the course, course section and project grids, `channel-tile/with-sort-order.ts`, and the course, course section,
comment, label, project, item and material queries.

## What & why

The organizations grid in the profile sheet marked Alphabetical while it listed menu order: with local state the bar
fell back to its first option and the query to `displayOrder`. One list's default lived in up to six places, and the
members fallback had drifted from its schema. The request schema's `.default()` is now read, never typed again, and
`useSearchParams({ defaults })` gives a list the sort its query sends.

## Blast radius

Apps with their own list queries or grids. The dropped `fallback`, the required `sort`, `order` and `sortOptions`,
and the removed `defaultOrderFor` fail to compile. Hand-typed `*SearchDefaults` and sheet tables without `defaults`
still compile. `/system/organizations` opens newest first. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Backend: delete `fallback: [...]` from each `getOrderColumns` call and make the query's `sort` and `order` options required; a request schema with `sort: x.default(y).optional()` drops `.optional()`.
2. `xSearchDefaults = { q: '', sort, order } as const` becomes `listSearchDefaults(zGetXQuery)`, with extra keys such as `view` spread beside it; the route schema becomes `listSearchSchema(zGetXQuery).extend({ ... })`.
3. A view that opens on another sort than its API passes its own defaults as the second argument, as `organizationsTableSearchDefaults` does; raak's `projectsSearchDefaults` (name) is one.
4. `order = defaultOrderFor(sort)` in a `query.ts` becomes `order = xSearchDefaults.order`; projectcampus `channel-tile/with-sort-order.ts` goes, since the grid bar writes each option's own order.
5. Each `EntityGridBar` passes `sortOptions`, the list's default first, and its `useSearchParams` passes `defaults: gridSortDefaults(sortOptions)`; offer `gridSortOptions.displayOrder` only on a list of the caller's own.
6. A table that takes `isSheet` passes `defaults: xSearchDefaults` to `useSearchParams`.
7. projectcampus `list-search-defaults-app.test.ts`: drop the case that compares the constants with the schema; the absent and unknown cases stay.

## Verify

```sh
pnpm check
```

By hand: a profile's organizations open on Alphabetical with it marked, and each app grid marks the sort it lists in a
sheet and on its page.
