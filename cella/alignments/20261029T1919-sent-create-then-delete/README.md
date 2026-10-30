---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: createOptimisticEntity, prepareProductDelete, squashIntoPendingCreate
---

# A delete after a sent create reaches the server

Each app product module's create `onMutate` gives its optimistic rows the `tenantId` of the variables, and its delete
`onSuccess` removes the rows the server deleted from the list and detail caches again, as
`frontend/src/modules/attachment/query.ts` does.

## What & why

An offline edit or delete now folds into or cancels only a create that never left the device (`isUnsent` in
`frontend/src/query/offline/mutation-queue.ts`). A create that was attempted may have committed, so the edit or delete
is sent after it. That delete takes its path from the optimistic row, which needs its `tenantId`, and a replayed create
or a list read can put the row back before the delete answers.

## Blast radius

Apps with product modules of their own built from attachment. Until they follow, deleting a row created offline sends
a request without a tenant (404, the row comes back) or leaves it on screen. No lens, no cache bump, no database change.

## Run

No script: manual.

## Manual steps

1. In each app product module's `query.ts`, pass the variables' `tenantId` to `createOptimisticEntity` in the create `onMutate`.
2. In its delete `onSuccess`, remove the rows the server did not reject with `cacheRemove` and `removeDetailQueriesById` before handling `rejectedIds`.

## Verify

```sh
pnpm check
```

Then by hand: offline, create a row and delete it; back online, the row stays gone and the server row is deleted.
