---
breaking: true
clientCacheBump: true
caughtBy: tests
grep: seqRangeOf, paginationSchema, onSyncedRows
---

# Range reads return deleted rows as tombstones

Each app product list route declares its 200 response with `productListResponseSchema(entityType, schema)` in place
of `paginationSchema(schema)`, its list operation passes the rows through `projectTombstones(entityType, rows)` after
`withActorRefs`, and each frontend list fetch that is no range fetch narrows its page with `.then(liveItems)`.

## What & why

A range read (`afterSeq`, `untilSeq`) returned every soft-deleted row with all its columns for the deleted-items
period, while the single-row read answered 404. Deleted rows must not return their content to a reader who never saw
them live. `projectTombstones` (`backend/src/utils/seq-range.ts`) keeps `id`, `seq`, `createdAt`, `publishedAt` where
the table has one, `deletedAt` and the hierarchy id columns; `productListResponseSchema` declares the item as the full
row or that tombstone.

## Blast radius

Every app with a product list of its own: until it follows, that list still returns deleted content and
`deleted-rows-range-read.test.ts` fails for its entity type. No lens and no database change; `clientCacheVersion` is
bumped because the list response gained a variant.

## Run

No script: manual.

## Manual steps

1. In each app product module's `<module>-routes.ts`, replace `paginationSchema(<entity>Schema)` in the list response with `productListResponseSchema('<entityType>', <entity>Schema)` from `#/schemas`.
2. In its list operation, return `projectTombstones('<entityType>', await withActorRefs(ctx, rawItems))` (`#/utils/seq-range`) as `get-attachments.ts` does.
3. Run `pnpm sdk`, then add `.then(liveItems)` (`~/query/basic/infinite-query-options`) to each list fetch in the module's `query.ts` other than the range fetch it registers; typecheck names each one.
4. Read the app's `onSyncedRows` subscribers and `matchesUnseenFilters`: a field they read from a deleted row is now undefined unless the tombstone keeps it.

## Verify

```sh
pnpm sdk
pnpm check
pnpm test
```
