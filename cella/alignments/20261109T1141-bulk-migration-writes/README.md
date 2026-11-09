---
breaking: false
clientCacheBump: false
---

# A migration's writes bypass the sync stream

The migrate companion now opens every migration with a bulk marker, and the CDC worker records none of that
transaction's writes: at its commit it rebuilds the books and every client refetches once. A backfill of any size passes
where one over 100,000 changes stalled the worker before. An app changes nothing; it schedules the deploy that carries
this upgrade ahead of any migration that rewrites a tracked table.

## What & why

`runMigrations` in `backend/scripts/db/migrate-database.ts` prefixes each pending migration with
`SELECT pg_logical_emit_message(true, 'sync-bulk', 'migrate:<name>')` (`syncBulkMarkerPrefix` in
`shared/src/utils/worker-env.ts`). The worker's `TransactionBuffer` discards a transaction at that marker, or past its
size limit, and `rebuildBooks('bulk_write')` replaces its flush. A migration's rows reached clients as change frames
attributed to each row's last editor before; now they arrive by one refetch, lists on screen first.

## Blast radius

Every app, at its next deploy. No wire-shape change, no lens, no template migration, no app code to edit. The first
deploy that carries this change still runs its migrations under the previous release's worker, which ignores the
marker: a backfill of a tracked table in that same deploy stalls as before.

## Run

No script: manual.

## Manual steps

1. Ship this upgrade in a deploy of its own, or in one whose migrations write no tracked rows; a large backfill goes in the deploy after it.
2. A backfill run by hand outside a deploy opens its transaction with the marker statement above, or stays under 100,000 changes.

## Verify

Deploy, then `SELECT reason, error FROM sync_incidents ORDER BY created_at DESC LIMIT 1` after a migration that wrote
tracked rows shows `bulk_write` with the migration's name, and the CDC worker's health shows no failure. `pnpm check`.
