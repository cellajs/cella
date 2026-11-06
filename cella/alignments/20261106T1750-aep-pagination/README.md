---
breaking: true
clientCacheBump: true
caughtBy: nothing
grep: limit=, offset=, sort=, order=, .items, .total, offsetPaging, paginationQuerySchema, PageParams, hiddenIds, invalid_limit, invalid_offset, listMyMemberships, listMyInvitations, listConnectedApps, listConnections, listApiKeys
---

# Lists page by token (aep.dev): pageToken, maxPageSize, skip, orderBy and results

Every list takes `pageToken`, `maxPageSize`, `skip` and, where it orders, `orderBy` in place of `limit`, `offset`,
`sort` and `order`, and answers `{ results, nextPageToken, totalSize }` in place of `{ items, total }`. An app moves
its own list routes onto `listQuerySchema` and `readListPage`, its list query options onto `tokenPaging`, and every
read of a list's `items` or `total` to `results` and `totalSize`. Lists that answered whole (`listMyMemberships`,
`listMyInvitations`, `listConnectedApps`, `listConnections`, `listApiKeys`) now answer their first page, 40 rows by
default: a call that reads one whole goes through `fetchAllPages`, which no compiler or test asks for.

## What & why

aep.dev (AEP-158, AEP-132) pages a list by an opaque token. `readListPage` (`backend/src/utils/list-page.ts`) seals
the next position with AES-256-GCM, bound to the list's path and params, so an altered token or changed params
answer 400 `invalid_page_token`. `orderByQuerySchema` replaces a `sort` enum and `order`; an operation takes the
query and a `PageWindow`. `QueryData` is `{ results, totalSize, nextPageToken }`, and page params are tokens.

## Blast radius

Every app with its own list routes, list query options, export fetchers or code that reads list caches. A persisted
list cache changes shape: `clientCacheVersion` moves to `v35-aep-pages`. No database change, no lens, queued
mutations keep their shape.

## Run

No script: manual.

## Manual steps

1. In each app list query schema, extend `listQuerySchema` (or `pageQuerySchema` for a list without search) and replace `sort` and `order` with `orderBy: orderByQuerySchema([...fields], '<field> <asc|desc>')`.
2. In each app list handler, wrap the operation: `readListPage(ctx, query, (page) => getXOp(ctx, query, page))`; the operation takes `{ offset, limit }` from the `PageWindow` and `sort`, `order` from `query.orderBy`. A list held in memory answers `windowOf(rows, page)`.
3. Declare the list response with `paginationSchema(schema)` or `productListResponseSchema(type, schema)`, and build mocks with `mockPaginated`.
4. Run `pnpm sdk`, then fix what typecheck flags in the frontend: `.items` to `.results`, `.total` to `.totalSize`, `offsetPaging(limit, fetch)` to `tokenPaging((pageToken, signal) => fetch(pageQuery(limit, pageToken), signal))`, list filters typed with `ListFilters<…>`, and `sort`, `order` sent as `orderBy: orderByParam(sort, order)`.
5. Read a list that must be whole through `fetchAllPages(fetchPage, maxPageSize)`, and pass export fetchers a `PageRequest`.
6. Find the app's calls of `listMyMemberships`, `listMyInvitations`, `listConnectedApps`, `listConnections` and `listApiKeys` (SDK, MCP tools, scripts): each still compiles and gets one page, so read it through `fetchAllPages` or loop on `nextPageToken`.
7. Rewrite hand-written list URLs and test requests: `limit` to `maxPageSize`, `offset` to `skip`, `sort` and `order` to `orderBy`.
8. If `shared/config` sets its own `clientCacheVersion`, change its value.

## Verify

```sh
pnpm sdk
pnpm check
pnpm test
```

For each list the app reads whole, seed more rows than one page holds (41) and check that every row arrives.
