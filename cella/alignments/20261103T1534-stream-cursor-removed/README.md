---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: clientCacheVersion, getLatestActivityId, findLatestActivityId, lastEventId, setCursor, baselineOnly
---

# The stream cursor is gone

The catchup body and answer have no top-level `cursor`, a change frame carries no SSE `id`, the `offset` event is empty, and neither the sync store nor the `StreamManager` store holds a stream cursor. `getLatestActivityId`, `findLatestActivityId`, `setCursor` and `StreamFrame`'s `id` are gone. `writeOffset(stream)` takes no cursor, and `processAppCatchup(response)` takes a first catchup from `syncStore.caughtUpAt === null`.

## What & why

The API read the newest activity id at every stream connect and every catchup, and the client stored it with every change frame, in IndexedDB too, and posted it back. The server only echoed it, and the client read it once, to tell a first catchup, which `caughtUpAt` already says. Nothing read Last-Event-ID.

## Blast radius

Breaking for app code or tests that post or read the catchup `cursor`, read `lastEventId`, or hook `getLatestActivityId`. A tab on the old bundle fails every catchup until it reloads: its SDK requires `cursor`, it reports `realtime.catchup_failed` every cooldown cycle, and while it leads it keeps the leader lock, so the other tabs of that browser get no live changes either, reloaded ones included. The spec diff is breaking, so `clientCacheVersion` moves. No database or lens change.

## Run

No script: manual.

## Manual steps

1. If `shared/config` sets its own `clientCacheVersion`, change its value.
2. An app test that holds a stream connect through `getLatestActivityId` mocks `writeOffset` from `#/modules/entities/stream/helpers`, as `backend/tests/security/stream-holding.test.ts` does.
3. App code or a test that posts a top-level `cursor` in a catchup body, or reads it from the answer, drops it; each view keeps its own `cursor`.

## Verify

```sh
pnpm check
```
