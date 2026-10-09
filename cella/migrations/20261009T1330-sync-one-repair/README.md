---
syncBreaking: true
clientCacheBump: false
---

# The CDC worker has one repair, one health grade and one message shape

Run `pnpm generate` and apply the migration: it drops `sync_incidents.kind` and `sync_state.requested_at`, and the side-effect migrations make `product_counters` a logged table. Deploy the API of this release before or with its CDC worker. Code that calls `activityBus.onAny`, `registerCacheInvalidation`, `DispatcherConfig.transformNotification`, `subscriber.cursor`, `MODE=cdc`, or reads `event.rowData` of a product event, or the worker's health fields, changes as listed below.

## What & why

A verify only detects: wrong books are rebuilt, with one incident (`wrong_books`), and a worker that restarts inside a rebuild rebuilds again (`interrupted`). The worker grades its own health and the API passes it on. A product message from the worker to the API always carries a list of rows. The app stream sends a `ping` event, and a client that hears nothing for 75 seconds reconnects. Each of these removes a second way of doing one thing.

## Blast radius

Every app that runs the CDC worker. No cache bump, no lens, no change to the OpenAPI document. Health probes that read reasons or fields of the `cdc` component or of the worker's `/health?depth=full` need the new names. An app without code of its own on the activity bus only generates and deploys.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`, review the two dropped columns, and apply it with the side-effect migrations (`product_counters` becomes logged).
2. Deploy the API before or with the worker: an API of the release before drops product messages of the new worker, and clients learn of those changes at their next catchup.
3. A product event on the activity bus has `rows` (each `{ rowData, seq, movedFrom }`, permission-relevant fields only) and no `rowData`, `seq`, `batchUntilSeq`, `count`, `batchRows` or `propagation`: a listener that needs more of the row reads it from the database, as the notification module does.
4. Replace `activityBus.onAny` / `offAny` by `on` per type; `registerCacheInvalidation` is gone and needs no replacement; `CursoredSubscriber` is `BaseStreamSubscriber`; `sendNotificationToSubscriber` takes the serialized notification.
5. Health: the `cdc` component's `status` and `reason` are the worker's own (`replication_stopped`, `api_away`, `reading_again`, `worker_stuck`, `setup_problems`, `slot_inactive`, `slot_lost`, `wal_lag_high`, `wal_lag_critical`, `event_loop_lag`); `rls_bypass_missing` and `role_missing_replication` are now `setup_problems`, and such a role keeps the worker from reading. In the worker's own body `replication.lastLsn` is `lastAckedLsn`, `pausedAt` is `apiAwaySince`, `role` is gone and `reasons` is new. `eventLoopLagMs` of the API, the relay and the worker is the mean delay over the last 30 seconds without the sampler's own 20 ms: it reads about 20 ms lower at rest, and a burst leaves it within a minute.
6. `recalculateCounters` no longer recounts `product_counters`: call `recalculateViewCounts` for that. A seed on a database with a replication slot asks the worker to rebuild (`requestBooks`) and does not recount.
7. The backend image has no `MODE=cdc`; the worker runs from its own image, or inside the API under `singleVM`.
8. Code of your own in `cdc/src/utils/embedding-cleanup.ts`, `owned-embedding-gc.ts` or `strip-changed-fields.ts` moved to `cdc/src/embeddings/`.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
pnpm test
pnpm sync:verify
```
