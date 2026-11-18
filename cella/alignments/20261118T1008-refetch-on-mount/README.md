---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: refetchOnMount, isFetching, staleTime
---

# Queries refetch on mount when stale

The query client no longer sets `refetchOnMount: false`: a reader that mounts refetches a query past its stale time or
marked for a refetch. An app gives the queries its signals or the sync engine keep current a `staleTime` that says so,
drops a `refetchOnMount: true` set only to undo the old default, and stops hiding data it shows behind `isFetching`.

## What & why

Under the old default a persisted query without a signal, such as the user's invitations, never refreshed on mount,
however old, and a refetch mark from the persister or catchup waited for a reconnect. `query-client.ts` drops the
default. Upstream set `staleTime: Number.POSITIVE_INFINITY` on `myMembershipsQueryOptions`, `staleTime: syncStaleTime`
on `attachmentQueryOptions`, and `refetchOnMount: false` on `organizationQueryOptions` and `unseenCountsQueryOptions`.

## Blast radius

Apps with query options of their own: one without its own `staleTime` refetches when a reader mounts after 30 seconds.
Neither the compiler nor a test finds it. No database, lens or `clientCacheVersion` change. An app that sets the
default in its own query client keeps the old behavior.

## Run

No script: manual.

## Manual steps

1. A product entity's detail options, copied from `attachmentQueryOptions`, take `staleTime: syncStaleTime`.
2. A dialog or page that blocks on a detail query's `isFetching`, copied from `attachment-dialog.tsx`, blocks on `isLoading`.
3. A query that signals or catchup keep current takes `staleTime: Number.POSITIVE_INFINITY`; a costly one that many components mount and that is revalidated elsewhere takes `refetchOnMount: false`.
4. Drop `refetchOnMount: true` where it only undid the old default; keep `'always'`, a function, and the one in `syncedListOptions`.

## Verify

Reload the app (hot reload keeps the old client), open each of the app's pages and dialogs, leave for longer than the
stale time and open it again: the network panel shows one refetch per stale query and no spinner over data already
shown. Then `pnpm check`.
