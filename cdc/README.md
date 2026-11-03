# CDC worker

This document covers the CDC worker: the service that turns committed Postgres changes into the server-side outputs used by the sync engine.

### TL;DR

A **Change Data Capture** worker watches committed database changes and turns them into audit history, counts,
totals, and the changes the live stream announces. It keeps changes in commit order and groups nearby changes
when the same clients should receive them. Each change gets an order number and all counts are updated.

## Vocabulary

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
| **Lost case** | A state the WAL cannot repair: no slot, empty counters, a rebuild that was interrupted. It ends in a rebuild. |
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

The worker reads one publication through one replication slot. It tracks the tables in the backend's entity and resource table maps and ignores every other table. Drafts never reach it.

### Collect

The worker holds a source transaction until its commit, so it can drop the noise a cascade makes: the child deletes that follow a deleted channel. What remains joins a flush. A flush takes whole source transactions in commit order, and one flush runs at a time.

A worker that falls behind stops reading until its pending changes are flushed, so the backlog waits in Postgres and not in the worker.

### Record

A flush is recorded in one transaction: the activities, the sequence values, the counter changes and the `seq` stamp on each row. Sequence values are reserved per organization, one contiguous range per flush, and go to product creates and updates in commit order across entity types. A soft-delete counts as a delete and a restore as a create. Removing a tombstone after the deleted-items period records nothing.

Recording happens once per change, however often the change arrives: an activity's id comes from its commit position, so a second delivery inserts nothing and counts nothing.

### Hand over

After the commit the worker hands the changes to the API. A row that is no product (a membership, a tenant, a channel) goes alone and in commit order, because its listeners act on that one row. Product rows go as one message per audience, with a list of its rows, each carrying the activity it was recorded as and so its own writer; the API turns those into change frames. Then the worker acknowledges the flush.

For an app with product embeddings, the worker also takes a deleted row's id out of the hosts that referenced it. That write is its own and records no activity.

## Internal API socket

One WebSocket from the worker to the API carries every change, with entity row data. It must never be reachable from a browser or an external network: the API serves it only on its internal listener, checks a shared secret and accepts one worker at a time.

The API sends nothing back. A message the socket took counts as handed over, even when the API dies before it dispatched it. A client learns of that change at its next catchup.

## Failure and recovery

Nothing here stops a write: the REST API and the database work whatever the worker does.

Failure handling has three levels. The core records a change once. Whatever fails is read again from the slot: the worker acknowledges nothing, forgets what it holds and reads again after a growing delay, so nothing is retried in place. And when the WAL cannot help, or the books turn out wrong, they are rebuilt from the tables. Two steps go on past a failure of their own: an attempt whose slot lookup or drop fails subscribes without that check, and a source transaction whose BEGIN carries no commit time records the time the worker read it.

The slot is the only durable buffer, and it advances only after a flush committed. Delivery is **at least once**, recording is **once**: a change delivered again changes no activity, counter or sequence value, and its message goes out again with the sequence value its row already holds.

A failure reports degraded at first, so a deploy that brings a change the worker can never process warns in its smoke step and stays deployed, and after a minute clients are told the worker is away. A worker that does not get past a failure for a while reports unhealthy, its log naming the position and the error, while live sync pauses and the REST API goes on. A fix ends it, and so does a dropped slot: by an operator, or by the worker once the WAL behind it reaches its bound, whatever failed, a flush that keeps timing out on a locked database or a send lost while the API was away included.

Each row names its answers per level ([Sync engine](../cella/SYNC_ENGINE.md#failure-modes)): here the mid level is reading again, the lost case a rebuild. Two failures hold a second answer at the mid level: a failed slot lookup or drop, and a failed read of the sync state at start.

| What fails | Core | Mid | Lost case |
| --- | --- | --- | --- |
| A flush fails, whatever the cause: a connection, a lock or statement timeout, a constraint, a send lost when the API left | | The service stops (`onFailed`) and the subscription loop reads again after a growing delay (`subscribeWithReconnect`) | Still failing at the WAL bound: the slot is dropped (`ensureReplicationSlot`) and the books rebuilt |
| A change can never be processed: refused, unparseable, or a source transaction over the limit | | The same read again, held there and unhealthy | The same drop at the WAL bound |
| A subscription attempt fails: another worker holds the slot during a deploy, the connection is refused, the slot cannot be made, or it was made by hand before its publication | | The loop records the failure and tries again after the same delay (`recordFailure`) | The same drop at the WAL bound |
| The slot lookup or the drop at the WAL bound fails | | The attempt subscribes without the check (`ensureReplicationSlot` answers `unknown`), and reads again when the subscribe fails | |
| The setup does not match: the publication, its row filters, replica identity, `wal_level` or the role | The check before every subscription refuses to read (`checkReplicationSetup`) | Read again until a person reruns the CDC migration; the WAL bound is not checked meanwhile | |
| A draft would reach the worker | The publication's row filter, which the setup check compares | | |
| The slot is missing or Postgres invalidated it | | | A new slot (`ensureReplicationSlot`), then a rebuild (`settleLostCases`) |
| The API is away | Nothing is recorded and the stream is held until the socket is back (`whenConnected`) | A send lost as the API left fails its flush, which is read again | |
| A change is delivered again | An activity's id comes from its commit position, so recording inserts and counts nothing twice (`recordFlush`) | | |
| A recount races the stream | The fence counts a change that commits during the recount once (`fence`) | | |
| The books are wrong | | | The daily verify finds it (`verifyBooks`) and a rebuild replaces them (`rebuildBooks`) |
| The counters are emptied | | | Found before the stream is read, then rebuilt (`settleLostCases`) |
| Rows were written before a slot existed, as by a seed while the worker starts | | | The seed asks for a rebuild (`requestBooks`) |
| The worker stops inside a rebuild | | | The fence it stored makes the next start rebuild (`rebuildWasInterrupted`) |
| Clients hold cursors from before a rebuild | | | A new generation: the API ends every app stream and clients refetch once (`noteGeneration`) |
| A stream state protocol 1 never sends: a change outside a transaction, a BEGIN or COMMIT without its position, an update without its old row | | Refused (`TransactionBuffer`, `parseUpdate`), then read again | |
| A BEGIN carries no commit time | Its activities take the time the worker read them (`onBegin`) | | |
| A product row names no organization | A delete is counted under its home channel (`resolveChannelKey`) | A create or update fails its flush (`organizationOf`) | |
| A channel delete cascades to its rows | The cascaded deletes are dropped and counted on the channel's delete (`isCascadedDelete`); clients hear `channel.deleted` | | |
| The worker's own write comes back through the WAL, or an update changes no field | Changed fields come from the WAL without `stx`, `seq` and `path`, and an update of only `updatedAt` records nothing (`parseUpdate`); the embedding strip is recognized (`isReferenceCleanupWrite`) | | |
| An embedded row is deleted while hosts reference it | Its id is stripped from the hosts (`cleanupEmbeddingReferences`) | | |
| An owned embedded row loses its last host | It is soft-deleted (`gcOwnedEmbeddedRows`) | | |
| A column a migration just added reaches a worker of the previous release | Its key is converted without the schema (`convertRowKeys`) | | |
| The WAL moves on while the worker has nothing to record | The idle worker acknowledges the keepalive position (`acknowledgeIdlePosition`) | | |
| A flush outlasts the server's `wal_sender_timeout` | The status timer repeats the last acknowledgement | | |
| The API cannot read a worker message, as during a deploy | | The API drops and counts it; clients get the change at their next catchup | |
| The sync state cannot be read when the worker starts | | Taken as generation 1 (`restoreBooksState`), and read again before the lost cases (`ensureBooksStateRestored`) | |
| No worker reads for a minute | The API's pings tell clients `worker_away` (`isWorkerAway`) | | |

## Verify and rebuild

There is one repair, the rebuild; a verify only detects. Both start with a recount of every counter from the tables at one snapshot, and both run while writes go on: a change that commits during the recount is counted once.

- **Verify** compares the books with the recount. Right books stay untouched, wrong books are rebuilt. It runs once a day and on `pnpm sync:verify`.
- **Rebuild** replaces the books by the recount, between two flushes, while the worker keeps reading. It runs when a verify found the books wrong, in the lost cases and on `pnpm sync:rebuild`.

The worker settles the lost cases by itself before it reads the stream. A missing or invalidated slot is made anew, and so is one the worker dropped at the WAL bound; the incident of that rebuild records the failure it could not get past.

Every rebuild leaves an incident and starts a new sync generation, never one a client already holds, even after a restore from a backup. The API then ends every app stream, and clients refetch: [Sync engine](../cella/SYNC_ENGINE.md#what-happens-when).

What a lost case costs: rows changed between the old slot's last acknowledged position and the new slot keep the `seq` they had and get no activity and no change frame. Counts, sequence values and every client's data are right again afterwards.

## Operational constraints

- **Adding a tracked table, or drafts to a product table, takes two steps:** the backend's entity or resource table map (or the table's `publishedAt` column), then rerunning the CDC migration, which builds the publication with its row filters. While the two do not match, the worker reads nothing and reports unhealthy with what is wrong.
- **`REPLICA IDENTITY FULL` is mandatory:** an update's changed fields and a delete's row come from the old row, so the worker strips large columns itself, and a consumer must tolerate their absence from the row data.
- **Only one worker may read the slot.**
- **A source transaction is held whole, up to a limit.** A larger one is a change the worker can never process. Write a backfill in smaller transactions.
- **WAL retention is the recovery margin.** A worker that is down, waits for the API or stops on a setup problem keeps WAL until the disk is full unless the database bounds it: [Deployment](../cella/DEPLOYMENT.md#overview).
- **The worker's role needs `REPLICATION` and an effective RLS bypass:** it owns the tables and none forces row-level security, or it holds `BYPASSRLS` ([Database roles](../cella/MULTI_TENANCY.md#database-roles)). While either is missing, the worker reads nothing and reports unhealthy.
- **A hung worker cannot hold API writes for long:** server-side timeouts take back the row locks of its flush.

Counter keys in `channel_counters` and how each one merges: `backend/src/modules/entities/counter-keys.ts`.
