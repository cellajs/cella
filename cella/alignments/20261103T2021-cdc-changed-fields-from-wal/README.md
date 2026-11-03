---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: productEmbeddings, suppressSoftCascades, suppressEmbeddingPropagation, embeddedProductOf, isEmbeddingColumn, embeddingsAfterDispatch, isEmbeddingCleanupWrite, embedding-hooks, reference-columns, getStxChangedFields
generate: true
---

# The CDC worker reads an update's changed fields from its old and new row, and keeps the host updates of a hard-deleted embedded row

The worker no longer reads `stx.changedFields`: an update's activity lists every column that differs between its old and new row, `updatedAt`, `updatedBy` and derived columns included, and an update that moves only `updatedAt` records nothing. The seq stamp leaves `stx` alone. `suppressSoftCascades`, `embeddedProductOf` and `embedding-hooks.ts` are gone, so a host update in the transaction that hard-deletes its embedded row is a change of its own. `buildStx` lists only the accepted fields, and `apply_count_deltas` takes its max-merge keys from `maxMergeKeySql`.

## What & why

`getStxChangedFields` read the list the API stored on a product row, and the seq stamp stripped it again; under REPLICA IDENTITY FULL every update carries its old row, so the diff answers alone. `suppressSoftCascades` dropped host updates that only stripped ids of embedded rows the same transaction hard-deletes, and found none: products are tombstoned. The stored list and `stripChangedFields` stay for the yjs module's `wroteDescription`.

## Blast radius

An app whose delete flow hard-deletes an embedded product and rewrites its hosts in the same transaction now streams those host updates. Code or tests reading an activity's `changedFields` see more columns. Rows keep their last write's `stx.changedFields`. `pnpm generate` rewrites `apply_count_deltas`.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: a new `side_effects` folder rewrites `apply_count_deltas` with the same merge rule. It takes no hint.
2. An app test that asserts an activity's `changedFields` (an edit's `['description', 'updatedAt']`) expects the columns the write changed, in table column order, `updatedBy` and derived columns such as `keywords` included.
3. An app test that builds a `PendingEvent` sets `commitLsn`, `commitEndLsn`, `index` and `xid`; one that drives `TransactionBuffer` opens each change with `onBegin` and passes `onCommit` the commit's end position.
4. An app delete flow that hard-deletes an embedded product and strips its hosts in the same transaction soft-deletes the row, or accepts the host updates as changes.
5. A comment that says `stripChangedFields` makes the worker read the WAL diff (projectcampus `comment-queries.ts` and `item-queries.ts`) states the reason that remains: the yjs module would read an earlier write's list.

## Verify

Edit a product through the app, then read its activity: `SELECT changed_fields FROM activities WHERE type LIKE '%.updated' ORDER BY created_at DESC LIMIT 5`.

```sh
pnpm generate
pnpm check
```
