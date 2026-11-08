# CDC worker

This document covers the CDC worker: the service that turns committed Postgres changes into the server-side outputs used by the sync engine. It assumes you know Postgres logical replication: the WAL, a publication and a replication slot ([postgresql.org](https://www.postgresql.org/docs/current/logical-replication.html)).

### TL;DR

A **Change Data Capture** worker turns committed database changes into audit history, counts
and the changes the live stream announces. It keeps changes in commit order and groups nearby changes
when the same clients should receive them. Each change gets an order number and all counts are updated.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Change** | One insert, update or delete of a row, read from the WAL. |
| **Source transaction** | The transaction that made the changes, delivered whole at its commit. |
| **Position** | A place in the WAL, an LSN. |
| **Flush** | The worker's unit of work: the changes of one or more whole source transactions, recorded together, handed to the API, then acknowledged. |
| **Record** | Write what a change leaves in the database: its activity as the audit row, its sequence value, the counters and the stamp on its row. |
| **Acknowledge** | Tell the slot that everything up to a position is recorded. |
| **Read again** | Stop reading without acknowledging and start anew. What is recorded already is not recorded twice. |
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

- `cdc/src/`: the worker
- `cdc/src/pipeline/`: the steps above
- `cdc/src/constants.ts`: its limits
- `backend/src/lib/cdc-websocket.ts`: the API's receiving side

Details are documented there, at their declarations.

## Normal flow

### Read

The worker reads one publication through one replication slot. It tracks the tables in the backend's entity and resource table maps and ignores every other table. Drafts never reach it.

### Collect

The worker holds a source transaction until its commit, so it can drop the noise a cascade makes: the child deletes that follow a deleted channel. What remains joins a flush. A flush takes whole source transactions in commit order. One flush runs at a time.

A worker that falls behind stops reading until its pending changes are flushed, so the backlog waits in Postgres and not in the worker.

### Record

A flush is recorded in one transaction. Sequence values are reserved per organization, one contiguous range per flush. They go to product creates and updates in commit order across entity types. A soft-delete counts as a delete and a restore as a create. Removing a tombstone after the deleted-items period records nothing.

Recording happens once per change, however often the change arrives.

### Hand over

After the commit the worker hands the changes to the API. A row that is no product, such as a membership, goes alone and in commit order.

Product rows go as one message per audience. Each row carries the activity it was recorded as, and so its own writer. The API turns those into change frames. Then the worker acknowledges the flush.

For an app with product embeddings, the worker also takes a deleted row's id out of the hosts that referenced it. That write is its own and records no activity.

## Internal API socket

One WebSocket from the worker to the API carries every change, with entity row data. It must never be reachable from a browser or an external network. The API guards it three ways:

- it serves the socket only on its internal listener
- it checks a shared secret
- it accepts one worker at a time

The API sends nothing back. A message the socket took counts as handed over, even when the API dies before it dispatched it. A client learns of that change at its next catchup.

## Failure and recovery

Nothing here stops a write. The REST API and the database work whatever the worker does.

Failure handling has three levels:

- **Core:** records a change once.
- **Mid:** whatever fails is read again from the slot after a growing delay, never retried in place.
- **Lost case:** when the WAL cannot help, or the books turn out wrong, they are rebuilt from the tables.

The slot is the only durable buffer. It advances only after a flush committed. Delivery is **at least once**, recording is **once**. A change delivered again changes no activity, counter or sequence value. Its message goes out again with the sequence value its row already holds.

A failure reports degraded at first. A deploy that brings a change the worker can never process therefore warns in its smoke step and stays deployed.

A worker stuck on a failure for a while reports unhealthy. Its log names the position and the error. Live sync pauses meanwhile, and the REST API goes on.

A fix ends the failure, and so does a dropped slot. An operator drops the slot, or the worker does once the WAL behind it reaches its bound. A restart starts the failure over, so a worker that crash-loops never drops its slot. Only the WAL lag in its health answer shows it.

Each row names its answers per level ([Sync engine](../cella/SYNC_ENGINE.md#failure-modes)).

| What fails | Core | Mid | Lost case |
| --- | --- | --- | --- |
| A flush fails, whatever the cause: a connection, a lock or statement timeout, a constraint, a send lost when the API left | | The service stops (`onFailed`) and the subscription loop reads again after a growing delay (`subscribeWithReconnect`) | Still failing at the WAL bound: the slot is dropped (`ensureReplicationSlot`) and the books rebuilt. A restart starts the failure over (`recordFailure`), so a worker that crash-loops never drops it |
| A change can never be processed: refused, unparseable, or a source transaction over the limit | | The same read again, held there, and unhealthy after a while (`stalled`) | The same drop at the WAL bound |
| A subscription attempt fails: another worker holds the slot during a deploy, the connection is refused, the slot cannot be made, or it was made by hand before its publication | | The loop records the failure and tries again after the same delay (`recordFailure`) | The same drop at the WAL bound |
| The slot lookup or the drop at the WAL bound fails | | The attempt subscribes without the check (`ensureReplicationSlot` answers `unknown`). Open finding, a second answer: a failed subscribe reads again | |
| The setup does not match: the publication, its row filters, replica identity, `wal_level` or the role | The check before every subscription refuses to read (`checkReplicationSetup`) | Read again until a person reruns the CDC migration. The WAL bound is not checked meanwhile | |
| A draft would reach the worker | The publication's row filter, which the setup check compares (`checkReplicationSetup`) | | |
| The slot is missing or Postgres invalidated it | | | A new slot (`ensureReplicationSlot`), then a rebuild while the database holds activities (`settleLostCases`). A slot lost after a quiet spell longer than activity retention is made without one, and the daily verify finds the books wrong |
| The API is away | Nothing is recorded and the stream is held until the socket is back (`whenConnected`) | A send lost as the API left fails its flush, which is read again | |
| A change is delivered again | An activity's id comes from its commit position, so recording inserts and counts nothing twice (`recordFlush`) | | |
| A recount races the stream | The fence counts a change that commits during the recount once (`fence`) | | |
| The books are wrong, as after a `TRUNCATE` of a tracked table, which the worker reads and ignores | | | The daily verify finds it (`verifyBooks`) and a rebuild replaces them (`rebuildBooks`) |
| The counters are emptied | | | Found before the stream is read, then rebuilt (`settleLostCases`) |
| Rows were written before a slot existed, as by a seed while the worker starts | | | The seed asks for a rebuild (`requestBooks`) |
| The worker stops inside a rebuild | | | The fence it stored makes the next start rebuild (`rebuildWasInterrupted`) |
| Clients hold cursors from before a rebuild | | | A new generation: the API ends every app stream and clients refetch once (`noteGeneration`) |
| A stream state protocol 1 never sends: a change outside a transaction, a BEGIN or COMMIT without its position, an update without its old row | | Refused (`TransactionBuffer`, `parseUpdate`), then read again | |
| A BEGIN carries no commit time | Its activities take the time the worker read them (`onBegin`) | | |
| A product row names no organization | A delete is counted under its home channel (`resolveChannelKey`) | A create or update fails its flush (`organizationOf`) | |
| A channel delete cascades to its rows | The cascaded deletes are dropped and counted on the channel's delete (`isCascadedDelete`); clients hear `channel.deleted` | | |
| The worker's own write comes back through the WAL, or an update changes no field | Changed fields come from the WAL without `stx`, `seq` and `path`, and an update of only `updatedAt` records nothing (`parseUpdate`). The embedding strip is recognized (`isReferenceCleanupWrite`) | | |
| An embedded row is deleted while hosts reference it | Its id is stripped from the hosts (`cleanupEmbeddingReferences`) | | None for a row deleted by its channel's cascade: it is dropped before the cleanup (`isCascadedDelete`), and a host outside that channel keeps its id |
| An owned embedded row loses its last host | It is soft-deleted (`gcOwnedEmbeddedRows`) | | |
| A column a migration just added reaches a worker of the previous release | Its key is converted without the schema (`convertRowKeys`) | | |
| The WAL moves on while the worker has nothing to record | The idle worker acknowledges the keepalive position (`acknowledgeIdlePosition`) | | |
| A flush outlasts the server's `wal_sender_timeout` | The status timer repeats the last acknowledgement (`createReplicationService`) | | |
| The API cannot read a worker message, as during a deploy | | The API drops and counts it (`cdcMessageSchema`); clients get the change at their next catchup | |
| The sync state cannot be read when the worker starts | | Taken as generation 1 (`restoreBooksState`). Open finding, a second answer: read again before the lost cases (`ensureBooksStateRestored`) | |
| No worker reads for a minute | The API's pings tell clients `worker_away` (`isWorkerAway`) | | |

## Verify and rebuild

There is one repair, the rebuild. A verify only detects. Both start with a recount of every counter from the tables at one snapshot. Both run while writes go on.

- **Verify** compares the books with the recount and rebuilds wrong ones, daily and on `pnpm sync:verify`.
- **Rebuild** replaces the books between two flushes, on a failed verify, a lost case or `pnpm sync:rebuild`.

The worker settles the lost cases by itself before it reads the stream. It makes a new slot for one that is missing, invalidated or dropped at the WAL bound. The incident of that rebuild records the failure it could not get past.

Every rebuild starts a new sync generation. No client holds it already, even after a restore from a backup. The API then ends every app stream, and clients refetch ([Sync engine](../cella/SYNC_ENGINE.md#what-happens-when)).

In a lost case, rows changed between the old slot's last acknowledged position and the new slot get no activity and no change frame. They keep the `seq` they had. Counts, sequence values and every client's data are right again afterwards.

## Operational constraints

- **New tracked table:** add it to the backend's entity or resource table map, then rerun the CDC migration.
- **Drafts on a product table:** add its `publishedAt` column, then rerun the CDC migration.
- **Mismatch:** until the migration reruns, the worker reads nothing and reports unhealthy with the cause.
- **`REPLICA IDENTITY FULL` is mandatory:** changed fields and a deleted row come from the old row.
- **Large columns:** the worker strips them from the row data, so a consumer must tolerate their absence.
- **Only one worker may read the slot.**
- **Transaction size:** one past the limit can never be processed, so write a backfill in smaller ones.
- **WAL retention is the recovery margin:** a worker that is down, waits for the API or is stuck on setup keeps WAL.
- **Unbounded WAL** grows until the disk is full ([Deployment](../cella/DEPLOYMENT.md#overview)).
- **Worker role:** needs `REPLICATION` and an RLS bypass ([Database roles](../cella/MULTI_TENANCY.md#database-roles)).
- **Missing grant:** while the role lacks either, the worker reads nothing and reports unhealthy.
- **A hung worker cannot hold API writes for long:** server-side timeouts take back its flush's row locks.

Counter keys in `channel_counters` and how each one merges: `backend/src/modules/entities/counter-keys.ts`.
