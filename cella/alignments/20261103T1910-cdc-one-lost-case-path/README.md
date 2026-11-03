---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: giveUpBacklog, worker_stuck, stuckAfter, isPassingError, ApiUnreachableError, TransactionTooLargeError, dropStaleReplicationSlot, isStalePublicationError, isFilteredDraftEvent, rebuildAllowed, rebuildIntervalMs, slotTakeover, failures_at_position, positionTo, position_to, apply_count_deltas
generate: true
---

# The CDC worker holds a poison change unhealthy and drops its slot only at the WAL bound

A change the worker can never process no longer gives up the backlog after five reads: the worker reads it again, reports `reading_again` unhealthy after `rereadUnhealthyMs`, and drops its slot only when the slot lag also reaches `walLagUnhealthyBytes`, which ends in a `lost_slot` rebuild. The `worker_stuck` reason, the `stuck` incident reason, `sync_incidents.position_to`, the cause classifier, the stale-publication slot drop, the draft parse guard and the zero floor in `apply_count_deltas` are gone; the setup check compares each table's publication row filter.

## What & why

The worker had a second lost-case trigger with its own classifier (`isPassingError`), stuck count (`stuckAfter`) and rate limit (`rebuildAllowed`), a self-heal for a slot older than its publication (`dropStaleReplicationSlot`) and a parse guard for drafts the row filter should have kept out (`isFilteredDraftEvent`). Failure handling is three levels now: hold unhealthy, read again from the slot, rebuild. Subscribe errors record a failure with the same waits (`reread.delaysMs`).

## Blast radius

Operators of every app: a deploy that brings a change the worker cannot process warns in its smoke step (degraded for ten minutes); any failure lasting ten minutes drops the slot at 2 GB; clients hear the worker is away a minute into any failure. Code reading `failure.count`, `worker_stuck` or `position_to` changes. The database changes.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it writes `ALTER TABLE "sync_incidents" DROP COLUMN "position_to"` and a new `side_effects` folder whose `apply_count_deltas` adds plain counts without `GREATEST(0, ...)`. No rename question arises, so it takes no hint.
2. Read the migration log for `Publication setup failed`: the new `side_effects` folder re-runs the CDC block, which sets each product table's `WHERE (published_at IS NOT NULL)` again, and a failure there leaves the old publication, on which the worker stops as a setup problem.
3. App tests or monitors that read `worker_stuck`, `failure.count`, `failure.passing` or the `cdc.replication.failures_at_position` gauge read `reading_again`, `failure.since` and `cdc.replication.failing_for`.
4. A runbook that waited for the worker to skip a poison change ships a fix, or stops the worker, runs `SELECT pg_drop_replication_slot('cdc_slot')` and starts it: the worker makes a new slot and rebuilds.

## Verify

Start the stack, then read the worker's `curl http://localhost:<services.cdc.port>/health?depth=full`: `failure` carries `position`, `since` and `error`, and the setup check passes on the app's publication.

```sh
pnpm generate
pnpm check
```
