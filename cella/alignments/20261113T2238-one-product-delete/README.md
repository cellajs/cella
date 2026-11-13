---
breaking: false
clientCacheBump: false
grep: deleteStamps, stxWithIds, tenantContextIncludingDeleted
---

# A product delete is one call of deleteProductsOp

The attachment module's delete is now `deleteProductsOp(ctx, { entityType, table, ids, stx, onDelete? })` from
`backend/src/modules/entities/operations/delete-products.ts`, with the soft delete itself in `tombstoneRows` from
`backend/src/db/utils/tombstone-rows.ts`. An app replaces the copies of both in its own product modules.

## What & why

Every product module carried the same soft-delete query (`deleteStamps`, `stxWithIds`, `requestScopeWhere`, live rows
only) and the same operation around it (`splitDeleteByPermission`, a transaction that reaches tombstones, the
`<type>.deleted` dispatch, the log). `deleteAttachmentsByIds` is gone; `deleteAttachmentsOp` keeps its signature.

## Blast radius

Apps whose product modules copied the attachment delete. Their copies keep working; nothing breaks, no database,
wire-shape or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In each app `operations/delete-<name>s.ts`, replace the body with `deleteProductsOp(ctx, { entityType: '<name>', table: <name>sTable, ids, stx })`, as `delete-attachments.ts` does; move logic that ran in the transaction into `onDelete(txCtx, deleted)`.
2. Delete the `delete<Name>sByIds` query from `<name>-queries.ts`; a soft delete with an app condition (a row nothing references yet) calls `tombstoneRows(txCtx, table, { ids, actorId, stx, where })`.

## Verify

```sh
pnpm check
```

Then delete a row in the running app and check a second tab drops it.
