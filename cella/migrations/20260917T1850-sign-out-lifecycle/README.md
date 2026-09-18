# Sign-out lifecycle: session-bound streams and cross-tab teardown

## What & why

The sign-out route flushes seen batches and drops the push subscription before the session ends, and
`teardownUserState` clears the app badge. `LocalUserDatabase` handles `versionchange` for a delete by closing for
good and running `deletedElsewhereListeners`, so other tabs sign out with the deleting one. Backend: `ctx.var.sessionId`, `AppStreamSubscriber.sessionId`, and `authEvents`
(`session.deleted`) let the entities listeners close a deleted session's SSE stream with the `unauthorized` error.

## Blast radius

Not sync-breaking, no `clientCacheVersion` bump, no database change. Apps building `AppStreamSubscriber` objects
(own streams, test fakes) need the new field. Apps that never touched the stream subscriber are unaffected after
the sync.

## Run

No script: manual.

## Manual steps

1. Add `sessionId` to every `AppStreamSubscriber` literal (handlers and test fakes); the app stream handler reads
   it from `ctx.var.sessionId`.
2. If the app deletes sessions outside `signOut` and `deleteMySessions`, emit
   `authEvents.emit('session.deleted', { userId, sessionIds })` after the delete.

## Verify

```sh
pnpm --filter backend exec vitest run src/modules/entities/stream
pnpm --filter frontend exec vitest run src/query/tests/local-user-db.test.ts
pnpm check
```
