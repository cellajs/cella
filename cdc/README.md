# CDC

This document covers the pipeline, failures and rebuilds of CDC, the service that reads committed Postgres changes through [logical replication](https://www.postgresql.org/docs/current/logical-replication.html) and turns them into what the sync engine serves.

### TL;DR

**Change Data Capture** (CDC) turns committed database changes into audit history, counts
and the changes the live stream announces. It keeps changes in commit order, gives each product change its order
number and sends nearby changes together when the same clients may read them. When CDC stops, the REST API and the
database work on.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Change** | One insert, update or delete of a row, read from the write-ahead log (WAL). |
| **Source transaction** | The transaction that made the changes, delivered whole at its commit. |
| **Position** | A place in the WAL, its log sequence number (LSN). |
| **Slot** | The replication slot CDC reads through. Postgres keeps the WAL that CDC has not acknowledged yet. |
| **Flush** | CDC's unit of work: the changes of one or more whole source transactions, recorded together, handed to the API, then acknowledged. |
| **Record** | Write what a change leaves in the database: its activity as the audit row, its sequence value, the counters and the stamp on its row. |
| **Acknowledge** | Tell the slot that everything up to a position is recorded. |
| **Read again** | Stop reading without acknowledging and start again from the last acknowledged position. What is recorded already is not recorded twice. |
| **Audience** | The rows of one product type in one channel: the same clients may read them. CDC sends the API one message per audience and action. |
| **Books** | The numbers CDC keeps in `channel_counters`: the counts, the sequence counter and the frontiers. |
| **WAL bound** | How much WAL the slot may keep behind CDC. Past it CDC reports unhealthy, and drops the slot when it is also stuck on a failure. |
| **Lost case** | A state the WAL cannot repair: no slot, empty counters, a rebuild that was interrupted. It ends in a rebuild. |
| **Sync generation** | A number that tells clients the books were rebuilt. It moves on with every rebuild, and a client that holds another one refetches. Each rebuild leaves an **incident**, a row in `sync_incidents`. |

## How it fits

A committed change of a tracked table takes this path from the WAL to the API:

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

The API receives the messages on its internal listener and fans them out to clients ([Sync engine](../cella/docs/SYNC_ENGINE.md)).

- `cdc/src/`: the service
- `cdc/src/pipeline/`: the steps above
- `cdc/src/constants.ts`: its limits
- `backend/src/lib/cdc-websocket.ts`: the API's receiving side

## Normal flow

### Read

CDC tracks the tables in the backend's entity and resource table maps and ignores every other table. It reads their changes through one publication and one replication slot.

### Collect

Collecting lets CDC record many small commits in one database transaction. CDC holds a source transaction until its commit. That lets it drop the noise a cascade makes: the child deletes that follow a deleted channel. What remains joins a flush.

### Record

Recording gives each change its audit row and each product change its place in its organization's sequence. A flush is recorded in one transaction, once per change, however often the change arrives.

### Hand over

After the commit CDC hands the changes to the API. Product rows go as one message per audience. Say one request creates 30 attachments in an organization: CDC sends the API one message for all 30. The API turns the messages into change frames. When your app declares product embeddings, CDC also takes a deleted row's id out of the hosts that referenced it. Then CDC acknowledges the flush.

## Internal API socket

One WebSocket from CDC to the API carries every change, with entity row data. Never make it reachable from a browser or an external network. The API guards it three ways:

- it serves the socket only on its internal listener
- it checks a shared secret
- it accepts one CDC process at a time

When the API dies before it dispatched a message, a client learns of that change at its next catchup.

## Failure and recovery

Failure handling gets the books and every client's data right again when a step fails. Nothing here stops a write: the REST API and the database work whatever CDC does.

It answers each failure at three levels, as the sync engine does on the whole way from a commit to a client's cache ([Failure modes](../cella/docs/sync-engine/FAILURE_MODES.md)):

- **Core:** records a change once. Delivery is **at least once**, recording is **once**.
- **Mid:** whatever fails is read again from the slot after a growing delay, never retried in place.
- **Lost case:** the books are rebuilt from the tables when the WAL cannot help or they turn out wrong.

A failure reports degraded at first. Degraded means it can pass by itself, as when the API comes back or a deploy hands the slot over. A degraded CDC only warns in a deploy's smoke step: a deploy that brings a change CDC can never process stays deployed.

When CDC is stuck on a failure for a while, it reports unhealthy. Its log names the position and the error. Live updates pause meanwhile, and the REST API goes on.

You end a failure with a fix or by dropping the slot. CDC drops the slot itself at the WAL bound. Only the WAL lag in its health answer shows a CDC process that crash-loops.

Each row names its answers per level.

| What fails | Core | Mid | Lost case |
| --- | --- | --- | --- |
| A flush fails, whatever the cause: a connection, a lock or statement timeout, a constraint, a send lost when the API left | | The service stops (`onFailed`) and the subscription loop reads again after a growing delay (`subscribeWithReconnect`) | Still failing at the WAL bound: the slot is dropped (`ensureReplicationSlot`) and the books rebuilt. A CDC process that crash-loops never drops it: each restart starts the failure over (`recordFailure`) |
| A change can never be processed: refused or unparseable | | The same read again, held there, and unhealthy after a while (`stalled`) | The same drop at the WAL bound |
| A source transaction over the limit, or one declared bulk by the marker a migration opens with | | | Discarded as it arrives, nothing of it recorded; at its commit the books are rebuilt and every client refetches (`TransactionBuffer`, `rebuildBooks`) |
| A subscription attempt fails: another CDC process holds the slot during a deploy, the connection is refused, the slot cannot be made, or it was made by hand before its publication | | The loop records the failure and tries again after the same delay (`recordFailure`) | The same drop at the WAL bound |
| The slot lookup or the drop at the WAL bound fails | | The attempt subscribes without the check (`ensureReplicationSlot` answers `unknown`). Open finding, a second answer: a failed subscribe reads again | |
| The setup does not match: the publication, its row filters, replica identity, `wal_level` or the role | The check before every subscription refuses to read (`checkReplicationSetup`) | Read again until a person reruns the CDC migration. The WAL bound is not checked meanwhile | |
| A draft would reach CDC | The publication's row filter, which the setup check compares (`checkReplicationSetup`) | | |
| The slot is missing or Postgres invalidated it | | | A new slot (`ensureReplicationSlot`), then a rebuild while the database holds activities (`settleLostCases`). A slot lost after a quiet spell longer than activity retention is made without one, and the daily verify finds the books wrong |
| The API is away | Nothing is recorded and the stream is held until the socket is back (`whenConnected`) | A send lost as the API left fails its flush, which is read again | |
| A change is delivered again | An activity's id comes from its commit position, so recording inserts and counts nothing twice (`recordFlush`) | | |
| A recount races the stream | The fence counts a change that commits during the recount once (`fence`) | | |
| The books are wrong, as after a `TRUNCATE` of a tracked table, which CDC reads and ignores | | | The daily verify finds it (`verifyBooks`) and a rebuild replaces them (`rebuildBooks`) |
| The counters are emptied | | | Found before the stream is read, then rebuilt (`settleLostCases`) |
| Rows were written before a slot existed, as by a seed while CDC starts | | | The seed asks for a rebuild (`requestBooks`) |
| CDC stops inside a rebuild | | | The fence it stored makes the next start rebuild (`rebuildWasInterrupted`) |
| Clients hold cursors from before a rebuild | | | A new generation: the API ends every stream and clients refetch once (`noteGeneration`) |
| A stream state protocol 1 never sends: a change outside a transaction, a BEGIN or COMMIT without its position, an update without its old row | | Refused (`TransactionBuffer`, `parseUpdate`), then read again | |
| A product row names no organization | | Its flush fails (`organizationOf`, `buildProductMessage`) | |
| A channel delete cascades to its rows | The cascaded deletes are dropped and counted on the channel's delete (`isCascadedDelete`); clients hear `channel.deleted` | | |
| CDC's own write comes back through the WAL, or an update changes no field | Changed fields come from the WAL without `stx`, `seq` and `path`, and an update of only `updatedAt` records nothing (`parseUpdate`). The embedding strip is recognized (`isReferenceStripWrite`) | | |
| An embedded row is deleted while hosts reference it | Its id is stripped from the hosts (`stripEmbeddingReferences`) | | None for a row deleted by its channel's cascade: it is dropped before the strip (`isCascadedDelete`), and a host outside that channel keeps its id |
| A column a migration just added reaches a CDC process of the previous release | Its key is converted without the schema (`convertRowKeys`) | | |
| The WAL moves on while CDC has nothing to record | CDC acknowledges the keepalive position (`acknowledgeIdlePosition`) | | |
| A flush outlasts the server's `wal_sender_timeout` | The status timer repeats the last acknowledgement (`createReplicationService`) | | |
| The API cannot read a CDC message, as during a deploy | | The API drops and counts it (`cdcMessageSchema`); clients get the change at their next catchup | |
| The sync state cannot be read when CDC starts | | Taken as generation 1 (`restoreBooksState`). Open finding, a second answer: read again before the lost cases (`ensureBooksStateRestored`) | |
| CDC reads nothing for a minute | The API's pings tell clients `worker_away` (`isWorkerAway`) | | |

## Verify and rebuild

Verify and rebuild keep the books equal to the tables. There is one repair, the rebuild. A verify only detects. Both run while writes go on.

- **Verify** compares the books with a recount from the tables and ends in a rebuild when they differ. It runs daily, and you start one with `pnpm sync:verify`.
- **Rebuild** replaces the books between two flushes: on a failed verify, on a lost case, or when you start one with `pnpm sync:rebuild`.

CDC settles the lost cases by itself before it reads the stream. It makes a new slot for one that is missing, invalidated or dropped at the WAL bound.

Every rebuild starts a new sync generation. No client holds it already, even after a restore from a backup.

In a lost case, rows changed between the old slot's last acknowledged position and the new slot get no activity and no change frame. They keep the `seq` they had. Counts, sequence values and every client's data are right again afterwards.

Say a colleague renames an attachment while CDC is stuck on a failure, and CDC then drops the slot at the WAL bound. The rename gets no activity. Every client shows the new name after the refetch the rebuild starts.

## Operational constraints

These rules apply when you change a tracked table, migrate or run the database:

- **New tracked table:** add it to the backend's entity or resource table map, then rerun the CDC migration.
- **Drafts on a product table:** add its `publishedAt` column, then rerun the CDC migration.
- **`REPLICA IDENTITY FULL` is mandatory:** changed fields and a deleted row come from the old row.
- **Large columns:** CDC strips them from the row data. API code that reads a CDC message must tolerate their absence.
- **Transaction size:** a migration's writes count as bulk whatever their number: every migration opens with the bulk marker. A backfill you run by hand opens its transaction with the same marker statement (`SELECT pg_logical_emit_message(true, 'sync-bulk', '<label>')`) or stays under CDC's size limit.
- **WAL retention is the recovery margin:** the slot keeps WAL while CDC is down, waits for the API or is stuck on setup. Unbounded, that WAL grows until the disk is full ([Deployment](../cella/docs/DEPLOYMENT.md#overview)).
- **Database role:** needs `REPLICATION` and a row-level security (RLS) bypass ([Database roles](../cella/docs/MULTI_TENANCY.md#database-roles)).
- **A hung CDC process cannot hold API writes for long:** server-side timeouts take back its flush's row locks.
