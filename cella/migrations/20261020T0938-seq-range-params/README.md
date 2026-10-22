---
syncBreaking: true
clientCacheBump: true
---

# Range reads take afterSeq and untilSeq

The `seqCursor=51,150` query param is now `afterSeq=50&untilSeq=150`: the rows stamped in (afterSeq, untilSeq]. A
product list schema is `productListQuerySchema({ ... })`, its query reads through `seqRangeOf` and `seqRangeRead`
(`backend/src/utils/seq-range.ts`; `seqCursorFilters` is gone), and a range fetch passed to `registerEntityQueryKeys`
takes one `{ organizationId, tenantId, channelId, query }` argument. `limit` and `offset` are integers in the SDK.

## What & why

`seqCursor` was one comma-joined string: the SDK sent it as `51%2C150`, every caller formatted it and the server parsed
it again. Range reads now take two integers, `afterSeq` (excluded, so a view's cursor goes in unchanged) and `untilSeq`
(included). `productListQuerySchema` refuses one bound, a search or an offset with a range, and `seqRangeRead` returns
the range filter, the seq order and the deleted-row rule as one unit.

## Blast radius

Sync-breaking for apps with product lists of their own: their list schemas, list queries and range fetch registrations
stop compiling, as does app code passing `limit` or `offset` to the SDK as strings. Bumps `clientCacheVersion`. No
database change.

## Run

No script: manual. These greps find every site:

```sh
grep -rn "seqCursor\|DeltaFetchFn\|getEntityDeltaFetch\|fromSeq" --include="*.ts" --include="*.tsx" backend frontend
grep -rn "limit: String(\|offset: String(\|limit: '[0-9]\|offset: '[0-9]" --include="*.ts" --include="*.tsx" backend frontend
```

## Manual steps

1. List query schema: `paginationQuerySchema.extend({ ... })` becomes `productListQuerySchema({ ... })` from `#/schemas`.
2. List operation: `const range = seqRangeOf(input)`, read with `range ? tenantReadIncludingDeleted : tenantRead`, pass `range` to the query.
3. List query: `const rangeRead = seqRangeRead(table, range)` replaces the `!seqCursor` deleted-row filter, `seqCursorFilters` and the seq order; AND `rangeRead.where` with the other filters and use `rangeRead.orderBy ?? <the list's sort>`. Keep the product's own filters out of a range read.
4. Range fetch: `({ organizationId, tenantId, channelId, query }) => getX({ path, query: { ...query, <channel param>: channelId } })`; `query` carries the range and `limit`.
5. Pass `limit` and `offset` to the SDK as numbers; a test calling `fetchRangeAndPatch` passes `{ afterSeq, untilSeq }`.
6. Bump `clientCacheVersion` if the app overrides the default config.

## Verify

```sh
pnpm sdk
pnpm check
pnpm test
```
