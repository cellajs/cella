---
breaking: false
clientCacheBump: false
grep: resolved.changed, updateStamps, changedFields, assertNoWriteBetween
---

# A product update that accepts no field writes nothing

An app's product update operation returns the locked row when `resolveUpdateOps` accepts no field, after
`assertPreconditionsChecked`, with no UPDATE, `updateStamps` or `dispatchMutation`.

## What & why

`updateAttachmentOp` wrote the row even when `resolveUpdateOps` accepted no field. A replayed offline edit that lost
every field stamped the loser as `updatedBy` and moved the `ETag`. The CDC worker then recorded an activity and sent
every reader a change to fetch. An array delta whose result equals the stored array now counts as no change too.

## Blast radius

Apps with product update operations copied from attachment's. Not breaking: an unaligned operation keeps working at
today's cost. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In each operation that calls `<name>Contract.resolveUpdateOps`, return the locked row when `!resolved.changed`, after `assertPreconditionsChecked(txCtx, '<name>')`.
2. Drop the `resolved.changed ?` guards below that return, and pass `changedFields: [resolved.acceptedFieldNames]` unconditionally.
3. An operation that already returns early adds `assertPreconditionsChecked` only.
4. A test or bench that counts an activity for a write that lost every field expects none.

## Verify

```sh
pnpm check
```
