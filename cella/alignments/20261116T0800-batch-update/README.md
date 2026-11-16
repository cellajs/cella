---
breaking: false
clientCacheBump: false
grep: resolveUpdateOps, UpdateVariables, updateProductsOp, sendQueuedUpdates
---

# A product updates many rows in one request

An app's product update operation splits into a row writer that both the single update and a new `~batch-update`
route call through `updateProductsOp`, and the product's query module sends its update `mutationFn` through
`sendQueuedUpdates`.

## What & why

Attachment gained `POST …/attachments/~batch-update` (`batchUpdateAttachments`): up to 50 `{ id, ops, stx }` items,
answered `{ results, rejectedIds }`. `writeAttachmentUpdate` holds what `updateAttachmentOp` did after its locked
read, and `updateProductsOp` runs it per row in one transaction. On the client, updates queued one behind another go
as one batch of up to 50.

## Blast radius

Apps with product update operations and query modules copied from attachment's. Not breaking: a product without the
batch route keeps sending one request per update. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Align `20261115T2207-noop-update-writes-nothing` first: its early return becomes the row writer's `null`.
2. Split the product's update operation as `update-attachment.ts` does: the row writer takes the locked row, and the single operation keeps the read, the `null` case and the dispatch.
3. Add the `~batch-update` route, its body from `<name>Contract.updateItemSchema`, and an operation that calls `updateProductsOp` with the row writer.
4. Run `pnpm sdk`, add the batch request to `query-mutations.ts` and call `sendQueuedUpdates` from the update's `mutationFn`, as attachment's `query.ts` does.

## Verify

```sh
pnpm check
```
