# CDC worker

This document covers the CDC worker: the service that turns committed Postgres changes into the server-side outputs used by the sync engine.

### TL;DR

A **Change Data Capture** worker watches committed database changes and turns them into audit history, counts,
totals, and the changes the live stream announces. It keeps changes in commit order and groups nearby changes
when the same clients should receive them. Each change gets an order number and all counts are updated.

## Vocabulary

Make sure you already read the [Sync engine](../cella/SYNC_ENGINE.md#selective-sync) part.

| Term | Meaning |
| --- | --- |
| **Change** | One insert, update or delete of a row, read from the WAL. In memory the worker holds it as a `PendingEvent`. |
| **Source transaction** | The transaction that made the changes. The worker gets it whole, when it commits. |
| **Position** | A place in the WAL (an LSN). |
| **Slot** | Postgres's bookmark for the worker. Postgres keeps the WAL from the slot's acknowledged position on. |
| **Flush** | The worker's unit of work: the changes of one or more whole source transactions, recorded together, handed to the API, then acknowledged. |
| **Record** | Write what a change leaves in the database: its activity (the audit row), its sequence value, the counters and the stamp on its row. |
| **Acknowledge** | Tell the slot that everything up to a position is recorded. Postgres never delivers it again. |
| **Read again** | Stop reading without acknowledging and start anew. Postgres delivers the same changes again, and what is recorded already is not recorded twice. |
| **Audience** | Who may receive a change: the readers of the rows of one type under one path. The API gets one message per audience. |
| **Books** | The numbers the worker keeps in `channel_counters`: the counts, the sequence counter and the frontiers. |
| **Stuck** | Failing again and again at one position, for a reason the change itself caused. |
| **Lost case** | A state the WAL cannot repair: no slot, empty counters, a stuck worker, a rebuild that was interrupted. It ends in a rebuild. |
| **Sync generation** | A number that moves on whenever the books were rebuilt. A client that holds another one refetches. Each rebuild leaves an **incident**, a row in `sync_incidents`. |

## How it fits

```text
Postgres WAL (`cdc_pub` / `cdc_slot`)
        │
        ▼
parse and normalize rows
        ▼
buffer a source transaction → suppress cascade noise
        ▼
collect whole source transactions into a flush, in commit order
        ▼
wait for the API: without it nothing is recorded
        ▼
record the flush in one transaction: activities, sequence values, counters, row stamps
        ▼
hand to the API → acknowledge the commit of the last source transaction of the flush
```

The API receives the messages on its internal listener and fans them out to clients ([Sync engine](../cella/SYNC_ENGINE.md)). Clients order by `seq`, not arrival.

The worker is `cdc/src/`, with the steps above in `pipeline/` and its limits in `constants.ts`. The API's receiving side is `backend/src/lib/cdc-websocket.ts`. Details are documented there, at their declarations.

## Normal flow

### Read

The worker reads one publication through one replication slot. It tracks the tables in the backend's entity and resource table maps and ignores every other table. Drafts never reach it ([Sync engine, Drafts](../cella/SYNC_ENGINE.md#drafts)).

### Collect

The worker holds a source transaction until its commit, so it can drop the noise a cascade makes: the child deletes that follow a deleted channel. What remains joins a flush. A flush takes whole source transactions in commit order, and one flush runs at a time.

A worker that falls behind stops reading until its pending changes are flushed, so the backlog waits in Postgres and not in the worker.

### Record

A flush is recorded in one transaction: the activities, the sequence values, the counter changes and the `seq` stamp on each row. Sequence values are reserved per organization, one contiguous range per flush, and go to product creates and updates in commit order across entity types. A soft-delete counts as a delete and a restore as a create. Removing a tombstone after the deleted-items period records nothing ([Data lifecycle](../cella/ARCHITECTURE.md#data-lifecycle)).

Recording happens once per change, however often the change arrives: an activity's id comes from its commit position, so a second delivery inserts nothing and counts nothing.

### Hand over

After the commit the worker hands the changes to the API. A row that is no product (a membership, a tenant, a channel) goes alone and in commit order, because its listeners act on that one row. Product rows go as one message per audience, with a list of its rows; the API turns those into change frames ([Sync engine](../cella/SYNC_ENGINE.md#changes-and-signals)). Then the worker acknowledges the flush.

For an app with product embeddings, the worker also takes a deleted row's id out of the hosts that referenced it ([Embeddings](../cella/SYNC_ENGINE.md#embeddings)). That write is its own and records no activity.

## Internal API socket

One WebSocket from the worker to the API carries every change, with entity row data. It must never be reachable from a browser or an external network: the API serves it only on its internal listener ([Deployment](../cella/DEPLOYMENT.md#overview)), checks a shared secret and accepts one worker at a time.

The API sends nothing back. A message the socket took counts as handed over, even when the API dies before it dispatched it. A client learns of that change at its next catchup.

## Failure and recovery

Nothing here stops a write: the REST API and the database work whatever the worker does.

Failure handling has three levels and no more. The core records a change once. Whatever fails is read again from the slot: the worker acknowledges nothing, forgets what it holds and reads again after a growing delay, so nothing is retried in place or left out to keep going. And when the WAL cannot help, or the books turn out wrong, they are rebuilt from the tables.

The slot is the only durable buffer, and it advances only after a flush committed. Delivery is **at least once**, recording is **once**: a change delivered again changes no activity, counter or sequence value, and its message goes out again with the sequence value its row already holds.

| Failure | What the worker does |
| --- | --- |
| A flush or a change fails | Reads again. A failure that says nothing about the change (the connection, a lock, the API away) is read again for as long as it lasts, and a position that keeps failing is reported unhealthy. Repeated failures the change itself caused make the worker stuck. |
| The API is away | Records nothing. The stream is held, Postgres keeps the changes, and the worker reads on when the socket is back. |
| Another worker holds the slot (a rolling deploy) | Retries until the slot is free, and reports degraded meanwhile. |
| A lost case: the slot is gone, the counters are empty, or the worker is stuck | Rebuilds ([Verify and rebuild](#verify-and-rebuild)). |

## Verify and rebuild

There is one repair, the rebuild; a verify only detects. Both start with a recount of every counter from the tables at one snapshot, and both run while writes go on: a change that commits during the recount is counted once.

- **Verify** compares the books with the recount. Right books stay untouched, wrong books are rebuilt. It runs once a day and on `pnpm sync:verify`.
- **Rebuild** replaces the books by the recount, between two flushes, while the worker keeps reading. It runs when a verify found the books wrong, in the lost cases and on `pnpm sync:rebuild`.

The worker settles the lost cases by itself before it reads the stream. A missing or invalidated slot is made anew. A stuck worker moves its slot past the backlog it could not record, at most once per interval, so a fault that repeats costs one refetch per interval.

Every rebuild leaves an incident and starts a new sync generation, never one a client already holds, even after a restore from a backup. The API then ends every app stream, and clients refetch: [Sync engine](../cella/SYNC_ENGINE.md#what-happens-when).

What a lost case costs: rows changed while the slot was gone, or in a given-up backlog, keep the `seq` they had and get no activity and no change frame. Counts, sequence values and every client's data are right again afterwards.

## Operational constraints

- **Adding a tracked table takes two steps:** the backend's entity or resource table map, then rerunning the CDC migration, which builds the publication. While the two do not match, the worker reads nothing and reports unhealthy with what is wrong.
- **`REPLICA IDENTITY FULL` is mandatory:** a delete needs the old row, so the worker strips large columns itself, and a consumer must tolerate their absence from the row data.
- **Only one worker may read the slot.**
- **A source transaction is held whole, up to a limit.** A larger one makes the worker stuck, and it rebuilds: its rows are counted and get no activity. Write a backfill in smaller transactions.
- **WAL retention is the recovery margin.** A worker that is down keeps WAL until the disk is full unless the database bounds it: [Deployment](../cella/DEPLOYMENT.md#overview).
- **The worker's role needs `REPLICATION` and an effective RLS bypass:** it owns the tables and none forces row-level security, or it holds `BYPASSRLS` ([Database roles](../cella/MULTI_TENANCY.md#database-roles)). While either is missing, the worker reads nothing and reports unhealthy.
- **A hung worker cannot hold API writes for long:** server-side timeouts take back the row locks of its flush.

Counter keys in `channel_counters` and how each one merges: `backend/src/modules/entities/counter-keys.ts`.
