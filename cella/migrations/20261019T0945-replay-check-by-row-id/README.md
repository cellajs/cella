---
syncBreaking: true
clientCacheBump: false
---

# A create's replay check reads its rows by id

`checkIdempotency(ctx, table, ids)` takes the ids of the create's input rows in place of the mutation id, and
`isTransactionProcessed` is gone. Every product create operation passes `input.map((item) => item.id)`, before its quota
count.

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

1. In each `operations/create-*.ts` that calls `checkIdempotency`, pass `input.map((item) => item.id)` as the third argument, and keep the call before the quota count.
2. A test that inserted an activity row so the replay check would see a create (`logProcessed` in the template's `attachment-idempotency.test.ts`) drops that row.

## Verify

```sh
pnpm exec vitest run --project=backend backend/tests/security
pnpm check
```
