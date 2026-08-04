# Product host FKs move to owned embeddings

## What & why

The child-side host FK pattern for product-to-product ownership (a nullable `<host>Id` column on
one product row pointing at another product, e.g. `attachments.taskId`) is deprecated in favor of
a host-side id array registered in `appConfig.productEmbeddings` with `lifecycle: 'owned'`. A
child-side FK is invisible to every generic layer (sync view declarations, CDC embedding cleanup,
SSE propagation hints, counters, client cache patching) and forces the fork to edit
template-owned module files, which is exactly where sync friction concentrates.

The template already ships everything the flip needs: the `lifecycle: 'shared' | 'owned'`
discriminant on `productEmbeddings` (`shared/src/config-builder/types.ts`), the CDC worker's
owned-embedding GC (`cdc/src/utils/owned-embedding-gc.ts`, host-side dispatch in
`cdc/src/pipeline/process-events.ts`), the `attachmentId` media-block reference prop
(`withAttachmentRef` in `shared/utils/blocknote-schema-configs`, see
`20260723T1705-media-attachment-ref`), the shared description walk with attachment-id collection
(`shared/utils/derive-description-core`), and id-array handling in the client propagation patcher
(`frontend/src/query/realtime/propagation.ts`). Registering an `owned` entry activates the GC;
with no entry it stays inert.

## Blast radius

The template itself changes nothing here: no DB change, no wire change, no `clientCacheVersion`
bump upstream. An app that never added a product-to-product host FK is unaffected. An app that
did (the `taskId`-style column this guide targets) performs a sync-breaking flip on its own side,
with its own DB migration and its own cache bump or lens, at a moment of its choosing.

## Run

No script, manual.

## Manual steps

1. Add the host array to the HOST product's table (app-owned): a `uuid().array().notNull()`
   column with `'{}'::uuid[]` default plus a GIN index (the GC refcount check reads it).
2. Register the embedding in the app config:
   `{ embeddedProduct: '<child>', hostProduct: '<host>', hostColumn: '<column>', lifecycle: 'owned' }`.
3. Derive the array from the app's linkage source. For description-hosted media, collect
   `attachmentId` block props via `countDescriptionBlocks` on create/update and narrow the
   candidate ids to live in-org child rows inside the write transaction.
4. In the same drizzle migration: backfill the host arrays from the legacy FK
   (`array_agg` over the child table grouped by the FK, excluding soft-deleted rows), then drop
   the FK column and its index.
5. Delete the FK-based lifecycle code: the delete-cascade query and any `onMutation` handler that
   soft-deleted child rows in-request. The CDC GC now owns deletion: hosts surrendering ids (array
   shrink or host soft-delete) trigger a refcount check, and orphans are soft-deleted
   asynchronously. Expect tombstone latency to move from in-request to CDC latency.
6. Remove the FK from the child's create body schema, create operation, mocks, and any client
   upload flow that stamped it; the reference now rides the host-side derivation source.
7. Ship the wire change per the schema-evolution playbook: the host entity gains the array field
   and the child loses the FK, so bump `clientCacheVersion` (or ship a lens) in the same PR and
   title it `feat!:`.

## Verify

```sh
pnpm generate
pnpm sdk
pnpm check
pnpm --filter cdc-worker exec vitest run src/tests/owned-embedding-gc.test.ts
```

Then verify at runtime: removing an embedded reference (or deleting the host) tombstones the
orphaned child row via CDC within a few seconds, and child rows never referenced by any host
array are left untouched.
