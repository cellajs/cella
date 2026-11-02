---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: splitByPermission
---

# A product delete sent again answers as its first attempt

In each product delete operation, replace `splitByPermission(ctx, 'delete', '<type>', ids)` with `splitDeleteByPermission(ctx, <table>, '<type>', ids, stx)` from `#/utils/idempotency`, and return before the write when `allowedIds` is empty.

## What & why

A client sends a queued delete again when its first answer was lost, as when a tab closes while the request runs. The rows it deleted no longer resolve, so `splitByPermission` refused the resend with a 403, or listed those rows in `rejectedIds`, and the client put deleted rows back and quarantined a delete that had happened. `splitDeleteByPermission` counts the rows an earlier attempt of the same `stx.mutationId` soft-deleted as deleted.

## Blast radius

Breaking for an app with product delete operations of its own. Channel deletes keep `splitByPermission`. No database, cache version or lens change.

## Run

No script: manual.

## Manual steps

1. In each product `delete-<name>s.ts`, pass the table the soft delete writes and the delete's `stx` to `splitDeleteByPermission`.
2. Return `{ data: [], rejectedIds }` before the write transaction when `allowedIds` is empty, so a resend writes and dispatches nothing.
3. Check that the soft delete stamps `deletedBy` (`deleteStamps`) and stores `stx.mutationId` on each row (`stripChangedFields(table.stx, stx)`): the helper finds the earlier attempt by both.

## Verify

Send one delete twice with the same `stx.mutationId`: both answers are 200 with the same `rejectedIds`. Then run `pnpm check`.
