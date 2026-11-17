---
breaking: false
clientCacheBump: false
grep: updateProductsOp, deleteProductsOp, tombstoneRows, splitDeleteByPermission, batchable
---

# A batch refuses one row without failing the rest

`updateProductsOp` and `deleteProductsOp` keep their signatures and are now short compositions of exported parts. A
403 that a `RowWriter` throws rejects that row alone, and what `onDelete` returns comes back as `onDeleteResult`. An
app's own batch and delete operations can drop the workarounds they carry and compose the parts where their policy
differs.

## What & why

A row writer that checked a grant only some rows need (`canCreateEntity`, `getValidChannel`) threw a 403 that failed
the whole batch, which the client read as a refusal of every queued update. `writeEachRow` now runs each row in a
savepoint, and a 403 there puts the row in `rejectedIds`. Update parts: `lockUpdatableRows`, `writeEachRow`,
`batchUpdateAnswer`, `dispatchUpdated`, types `RowWriter`, `RowWrite` and `RowOutcome`. Delete part:
`tombstoneProducts`.

## Blast radius

Apps with batch update or product delete operations of their own. Not breaking: code compiles unchanged, and a batch
whose writer throws a 403 answers 200 with that row rejected where it answered 403. Any other writer error still fails
the batch. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. A frontend `batchable` that keeps ops out of a batch because their row writer may throw a 403 for one row can let them in; keep the exclusions that have another reason, such as a block field.
2. A delete operation that narrows ids in its transaction and calls `tombstoneRows` and `dispatchMutation(txCtx, '<name>.deleted', …)` itself calls `tombstoneProducts(txCtx, { entityType, table, ids, stx })` in their place, after `splitDeleteByPermission`.
3. An `onDelete` that hands a value out through a closure variable returns it, and the operation takes `onDeleteResult` out of the answer it returns to the route.
4. A test that expects a batch's 403 when its writer refuses one row expects that row in `rejectedIds`.

## Verify

```sh
pnpm check
```

Then send a batch in which the writer refuses one row and check the other rows are written and dispatched.
