---
syncBreaking: true
clientCacheBump: false
---

# A create's replay check reads its rows by id

`checkIdempotency(ctx, table, ids)` takes the ids of the create's input rows in place of the mutation id and returns
the rows found (`[]` for a new create, no longer `null`); `isTransactionProcessed` is gone. Every product create
operation passes `input.map((item) => item.id)` before its quota count and inserts only the items not returned.

## What & why

The check found a replay through the activity row the CDC worker writes. Until the worker had processed the first
attempt, a replay inserted nothing (`onConflictDoNothing`), answered 201 without rows, and the client dropped its
optimistic row. The lookup now reads the caller's own rows by primary key in the request scope, so it holds whatever the
worker does. A replay never brings back a row deleted since.

## Blast radius

Every app with its own product create operation: the typecheck fails on the old `mutationId` argument. No database
change, no cache change.

## Run

No script: manual.

## Manual steps

1. In each `operations/create-*.ts` that calls `checkIdempotency`, pass `input.map((item) => item.id)` as the third argument, before the quota count.
2. Answer a replay (`replayed: true`) when every item came back; otherwise count the quota for, check and insert only the items whose id is not among the returned rows, and answer the returned rows with the created ones, as `create-attachments.ts` does.
3. After the insert, read the items it returned no row for with `checkIdempotency` again: an attempt sent at the same time committed them first.
4. A test that inserted an activity row so the replay check would see a create (`logProcessed` in the template's `attachment-idempotency.test.ts`) drops that row.

## Verify

```sh
pnpm exec vitest run --project=backend backend/tests/security
pnpm check
```
