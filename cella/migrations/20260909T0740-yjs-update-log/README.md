# Yjs relay: append-only update log, per-socket ordering, compaction

## What & why

A burst of keystrokes right after opening a collaborative editor lost its first update: the relay
merged update bytes in memory across `await`s with no serialization, so a later frame overwrote
`pendingState`. The relay now appends every frame to a new `yjs_updates` table before broadcasting,
applies each socket's frames in order through a serial queue, and compacts the log into
`yjs_documents.state` under a per-document lock (`yjs/src/sync/compaction.ts`). `last_edited_by`
moved to the log rows. The relay also pulls what a client holds (server Step1), and
`yjs-resync.ts` reconnects a client stuck on parked structs.

## Blast radius

Database change: a new RLS table and a dropped column, applied by the next release's migrations.
Not sync-breaking for clients: the wire protocol and `/yjs/materialize` are unchanged. Only apps
that customized `yjs/src/sync/*` or `yjs/src/data/storage.ts`, or list RLS tables in their own
tests, have work. `YJS_SAVE_DEBOUNCE_MS` is now `YJS_COMPACT_DEBOUNCE_MS`; `YJS_MATERIALIZE_RETRY_MS`
is gone (the durable log makes the retry timers redundant).

## Run

No script: manual.

## Manual steps

1. `pnpm generate` and commit the new drizzle folder plus the `*_side_effects` folder: `yjs_updates` joins the RLS table set through `classifyRlsTables()` in `10-rls.migration.ts`.
2. A fork test that lists RLS tables by name (cella's `schema-verification.test.ts` does) adds `yjs_updates`.
3. Fork code importing `loadState`, `saveState`, `createDoc`, `deleteState` or `deleteStaleDoc` from `yjs/src/data/storage.ts` moves to `loadBase`, `ensureDoc`, `appendUpdate`, `readLog`, `compactState`, `deleteDoc`; `materializeState` is replaced by `compactDocument`.
4. The `yjs-worker` package gains `y-websocket` as a dev dependency for the end-to-end relay test; `pnpm install` after the sync.
5. Reset a development database or let migrations run: the old `last_edited_by` column is dropped and open session rows are re-seeded on the next connect.

## Verify

```sh
pnpm generate
pnpm --filter yjs-worker test
TEST_MODE=full pnpm exec vitest run --project=yjs --project=backend tests/integration/schema-verification
pnpm check
```
