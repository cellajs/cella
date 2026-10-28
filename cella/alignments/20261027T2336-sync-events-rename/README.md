---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: sync-signals, createSignal, ChangeEventSignal, SyncedRowsSignal
---

# The tab's sync hooks live in sync-events

`frontend/src/query/realtime/sync-signals.ts` is `sync-events.ts`. Its helper `createSignal` is `createEmitter`, and
its types `ChangeEventSignal` and `SyncedRowsSignal` are `AnnouncedChange` and `SyncedRows`. `onChangeEvent`,
`publishChangeEvent`, `onSyncedRows` and `publishSyncedRows` keep their names.

## What & why

"Signal" now names a stream frame that is not a row change. The file held in-tab events, which every other bus in
the codebase calls events, so it takes that word and its emitter helper says what it makes.

## Blast radius

App-owned code that imports from `~/query/realtime/sync-signals`, calls `createSignal`, or names one of the two
types. Synced files arrive with the sync. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Import from `~/query/realtime/sync-events` where app code imported `~/query/realtime/sync-signals`.
2. Rename `createSignal` calls to `createEmitter`.
3. Rename `ChangeEventSignal` to `AnnouncedChange` and `SyncedRowsSignal` to `SyncedRows`.

## Verify

```sh
pnpm check
```
