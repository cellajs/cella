---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: setQueryData, setQueriesData, cancelQueries
---

# Product queries keep their refetch mark through writes and cancels

In each product module, replace `queryClient.setQueryData(...)` with `writeKeepingMark(queryClient, queryKey, (data) => next)` and `queryClient.cancelQueries({ queryKey })` with `cancelKeepingMark(queryClient, queryKey)`, both from `~/query/basic/cache-mutations`, and give each product entry of the app-owned `frontend/src/entity-sync-queries.ts` a `staleTime: syncStaleTime`.

## What & why

A list the sync engine cannot patch whole carries a refetch mark, `isInvalidated`, and the next open and the background fill refetch it. `setQueryData` clears the mark even when it writes the same data, and `cancelQueries` restores the unmarked state of the last write, so one write or cancel in an app's own code drops the refetch a query owes. The background fill now reads synced product lists on their own stale time.

## Blast radius

Breaking for an app with product modules of its own. `pnpm style` reports these calls in `frontend/src/query/` and in every file of a module whose `query.ts` registers a range fetch; elsewhere only the grep finds them. No database, cache version or lens change.

## Run

No script: manual.

## Manual steps

1. In each product module, replace `queryClient.setQueryData(key, value)` with `writeKeepingMark(queryClient, key, () => value)`, and an updater form with the same updater.
2. In each product mutation's `onMutate`, replace `await queryClient.cancelQueries({ queryKey })` with `await cancelKeepingMark(queryClient, queryKey)`.
3. Leave channel and session queries, such as an organization detail or `meKeys.auth`, as they are.
4. In `frontend/src/entity-sync-queries.ts`, check that each product entry's options set `staleTime: syncStaleTime` (`~/query/basic/sync-stale-state`): without it the background fill reads that list on the default stale time and fetches it again on every stream-live event.

## Verify

Read each grep hit outside the files `pnpm style` covers, and each product entry of `entity-sync-queries.ts`. Then run `pnpm check`.
