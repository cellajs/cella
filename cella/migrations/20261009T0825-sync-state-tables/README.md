---
syncBreaking: true
clientCacheBump: false
---

# The CDC worker keeps a sync state and an incident log

Run `pnpm generate` and apply the migration: it creates `sync_state` and `sync_incidents`, which the CDC worker reads and writes from its first start, and the side-effect migrations make `channel_counters` a logged table again. Set `max_slot_wal_keep_size` on your database. Health consumers: the worker's report lost `catchup` and `circuitBreakers` and gained `replication.lagMs`, `replication.failure` and `replication.setupProblems`; the API's `cdc` component lost `catchingUp`, gained `lagMs`, `stuck`, `failure` and `setupProblems`, and is `unhealthy` with the reason `worker_stuck` or `setup_problems`. The SSE stream has the error code `resync`, the catchup response the field `generation`.

## What & why

The CDC worker checks its counters against the tables daily and rebuilds them when the slot is lost, `channel_counters` is empty, or one change failed five reads (giving up that backlog). The generation of its books lives in `sync_state`, every correction in `sync_incidents` (`backend/src/modules/entities/sync-state-db.ts`). A failed flush is read again from the slot; the circuit breaker and the catching-up status are gone. The worker reads nothing while the publication differs from its registry, holds a source transaction whole up to 100,000 changes, and `channel_counters` is logged, so a crash keeps the sequence counter.

## Blast radius

Every app that runs the CDC worker: sync-breaking until the two tables exist. No cache bump, no lens. New activity ids are 26 characters; older ids stay valid. A probe of the worker's or the API's `/health?depth=full` needs the new field names. An app write path outside `dispatchMutation` keeps relying on CDC for its detail cache entry.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`, review the migration that creates `sync_state` and `sync_incidents`, and apply it with the side-effect migrations before the new worker starts.
2. Set `max_slot_wal_keep_size` on the database (the template's `backend/compose.yaml` uses `2GB`): the worker warns before every subscription while it is unlimited.
3. Replace `catchup` and `circuitBreakers` in anything that reads the worker's health with `replication.lagMs` and `replication.failure`, and `catchingUp` in anything that reads the API's `cdc` component with `lagMs` and `stuck`. A stuck worker or a failed setup check makes that component `unhealthy`, which fails the deploy's smoke step.
4. If your code builds or parses activity ids, expect `<commit position>-<8 digit index>` for new rows.
5. After adding a tracked table, run the migrations before the worker: it reads nothing until the publication matches its registry.

## Verify

```sh
pnpm check
pnpm test
pnpm sync:verify
```
