---
syncBreaking: true
clientCacheBump: false
---

# The sync books hold on a deep hierarchy and with embeddings

An app only syncs this, unless it has code of its own on the paths below: counters kept by the earlier rules are rebuilt by the first nightly verify, by itself. Code of your own that calls `isEmbeddingCleanupWrite`, `cleanupEmbeddingReferences` or the stream's `keepAlive`, or reads `details.failure` of the worker's health, changes as listed below. The CDC worker's integration tests need the backend's test setup to have run once.

## What & why

The worker's counts and a recount from the tables differed in four cases, and a verify answers each with a rebuild: the rows a channel delete takes with it, the self count of a channel, the uses of an embedded row by a soft-deleted host, and the uses the worker's own cleanup strips. All four now agree. Clients also fall back to a five-minute stale time while no CDC worker reads.

## Blast radius

Apps with sub-channels or embeddings: the first verify rebuilds their counters by itself. Every app: health can report `reading_again` as unhealthy, and the app stream's `ping` may carry `worker_away`. No migration, no cache bump, no change to the OpenAPI document.

## Run

No script: manual.

## Manual steps

1. `isEmbeddingCleanupWrite(hostType, changedFields)` takes the type of the updated row first; `cleanupEmbeddingReferences` runs in a transaction and takes an optional executor last.
2. `keepAlive(stream, pingData, intervalMs)` takes what each ping carries before the interval; pass `undefined` to keep a ping empty.
3. A host update in a transaction that deletes an embedded row is suppressed only when every column it changed refers to the deleted type (`<hostColumn>` or `<hostColumn>Id`), `updatedAt` and `updatedBy` aside: an update that also changes another column is now an activity and a notification.
4. Health: `reading_again` turns unhealthy after ten minutes at one position, and `details.failure` holds `since`. A probe that treats unhealthy as "page someone" hears a stalled worker now.
5. Tests: the worker's integration suite runs on the database `cdc_integration` with the slot `cdc_slot_integration`, which the backend's global test setup creates and migrates; run the backend suite or the root `pnpm test` once on a fresh test server.
6. Scaleway's managed database does not list `max_slot_wal_keep_size`: see `cella/DEPLOYMENT.md` for what bounds a stopped worker's WAL there.

## Verify

```sh
pnpm check
pnpm test
pnpm sync:verify
```
