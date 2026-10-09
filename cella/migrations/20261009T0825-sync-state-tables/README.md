---
syncBreaking: true
clientCacheBump: false
---

# The CDC worker keeps a sync state and an incident log

Run `pnpm generate` and apply the migration: it creates `sync_state` and `sync_incidents`, which the CDC worker reads and writes from its first start. Set `max_slot_wal_keep_size` on your database. Health consumers: the worker's report lost `catchup` and `circuitBreakers` and gained `replication.lagMs`, `replication.failure` and `replication.setupProblems`.

## What & why

The CDC worker now checks its counters against the tables once a day and rebuilds them when the replication slot or the unlogged `channel_counters` table is lost. It keeps the generation of its books in `sync_state` and records every correction and rebuild in `sync_incidents` (`backend/src/modules/entities/sync-state-db.ts`). A failed flush is read again from the slot; the circuit breaker and the catching-up status are gone. An activity id is its transaction's commit position plus an index.

## Blast radius

Every app that runs the CDC worker: sync-breaking until the two tables exist. No cache bump, no lens. Activity ids written from now on are 26 characters; older ids stay valid. A dashboard or probe that reads the worker's `/health?depth=full` needs the new field names.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`, review the migration that creates `sync_state` and `sync_incidents`, and apply it before the new worker starts.
2. Set `max_slot_wal_keep_size` on the database (the template's `backend/compose.yaml` uses `2GB`): the worker warns at startup while it is unlimited.
3. Replace `catchup` and `circuitBreakers` in anything that reads the worker's health with `replication.lagMs` and `replication.failure`.
4. If your code builds or parses activity ids, expect `<commit position>-<8 digit index>` for new rows.

## Verify

```sh
pnpm check
pnpm test
pnpm sync:verify
```
