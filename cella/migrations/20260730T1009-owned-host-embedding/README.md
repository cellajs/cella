# Product host FKs move to owned embeddings

## What & why

Child-side host FKs for product-to-product ownership (a nullable `<host>Id` column such as
`attachments.taskId`) are deprecated in favor of a host-side id array registered in
`appConfig.productEmbeddings` with `lifecycle: 'owned'` (a child-side FK is invisible to sync
views, CDC cleanup, propagation hints, counters, client cache patching). The template ships the
machinery: the `lifecycle: 'shared' | 'owned'` discriminant (`shared/src/config-builder/types.ts`),
the CDC owned-embedding GC (`cdc/src/utils/owned-embedding-gc.ts`, dispatched in
`cdc/src/pipeline/process-events.ts`), `withAttachmentRef` (`shared/utils/blocknote-schema-configs`,
see `20260723T1705-media-attachment-ref`), `shared/utils/derive-description-core`, and id-array
patching in `frontend/src/query/realtime/propagation.ts`. An `owned` entry activates the GC.

## Blast radius

Template-side: no DB, wire, or `clientCacheVersion` change. Apps without a product-to-product host
FK are unaffected. Apps with one (`taskId`-style) flip on their own schedule, with their own DB
migration and cache bump or lens.

## Run

No script, manual.

## Manual steps

1. Add the host array to the HOST product's table (app-owned): `uuid().array().notNull()`, default
   `'{}'::uuid[]`, plus a GIN index (the GC refcount check reads it).
2. Register the embedding:
   `{ embeddedProduct: '<child>', hostProduct: '<host>', hostColumn: '<column>', lifecycle: 'owned' }`.
3. Derive the array from the app's linkage source; for description-hosted media, collect
   `attachmentId` block props via `countDescriptionBlocks` on create/update and narrow to live
   in-org child rows inside the write transaction.
4. In the same drizzle migration: backfill the host arrays from the legacy FK (`array_agg` over the
   child table grouped by the FK, excluding soft-deleted rows), then drop the FK column and index.
5. Delete the FK-based lifecycle code (delete-cascade query, `onMutation` handlers soft-deleting
   children in-request); the CDC GC soft-deletes orphans asynchronously on array shrink or host
   soft-delete (tombstones arrive at CDC latency).
6. Remove the FK from the child's create body schema, create operation, mocks, and any client upload
   flow that stamped it.
7. Host gains the array field and child loses the FK: bump `clientCacheVersion` (or ship a lens) in
   the same PR, titled `feat!:`.

## Verify

```sh
pnpm generate
pnpm sdk
pnpm check
pnpm --filter cdc-worker exec vitest run src/tests/owned-embedding-gc.test.ts
```

Then at runtime: removing an embedded reference (or deleting the host) tombstones the orphaned child
via CDC within seconds; never-referenced child rows stay untouched.
