---
syncBreaking: false
clientCacheBump: false
---

# A product update locks the row it merges with

Pass `{ forUpdate: true }` to `getValidProduct` in each of your own product update operations, inside the write
transaction: `getValidProduct(txCtx, id, '<type>', 'update', { forUpdate: true })`. Nothing stops compiling without
it, but two overlapping updates of one row then keep losing field timestamps and list changes.

## What & why

An update reads the row, merges its change with it (`resolveUpdateOps`: field timestamps, list deltas) and writes
the result. The read took no lock, so two overlapping updates each merged with the row the other was about to
replace: the later write stored `stx.fieldTimestamps` without the earlier one's, and a replayed offline edit of
that field then won against a newer value. `getValidProduct` takes an options argument with `forUpdate`, which
reads with `FOR NO KEY UPDATE`; `updateAttachmentOp` uses it.

## Blast radius

Every app with update operations of its own that follow the attachment pattern. The template's attachment update
is fixed by the sync. No database, schema or cache impact.

## Run

No script: manual.

## Manual steps

1. In each product update operation, add `{ forUpdate: true }` as the fifth argument of the `getValidProduct` call that reads the row inside `tenantContext`.
2. Leave reads outside a write transaction as they are: `forUpdate` on the base connection throws, a lock lasts only as long as its transaction.

## Verify

```sh
pnpm check
pnpm test
```
