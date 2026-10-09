# CDC worker

This document covers the CDC worker: the service that turns committed Postgres changes into the server-side outputs used by the sync engine.

### TL;DR

A **Change Data Capture** worker watches committed database changes and turns them into audit history, progress numbers,
totals, and live client notifications. It keeps changes in commit order and groups nearby changes
when the same clients should receive them. Each change gets an order number and all counts are updated.

## Vocabulary

The words this document uses, each for one thing. Sequence, frontier, path and summary are explained in [Sync engine](../cella/SYNC_ENGINE.md#selective-sync).

| Term | Meaning |
| --- | --- |
| **Change** | One insert, update or delete of a row, read from the WAL. The code calls it an event. |
| **Source transaction** | The transaction that made the changes, as opposed to one of the worker's own. The worker gets it whole, when it commits. |
| **Position** | A place in the WAL (an LSN). Every change has one, and so does the commit of its source transaction. |
| **Slot** | Postgres's bookmark for the worker (`cdc_slot`). Postgres keeps the WAL from the slot's acknowledged position on. |
| **Subscription** | One connection that reads the stream of changes from the slot. A new one starts at the acknowledged position. |
| **Flush** | The worker's unit of work: the changes of one or more whole source transactions, recorded together, handed to the API, then acknowledged. |
| **Record** | Write what a change leaves in the database: its activity, its sequence value, the counters and the stamp on its row. Once per change, in one transaction per flush. |
| **Activity** | The audit row of a change. |
| **Acknowledge** | Tell the slot that everything up to a position is recorded. Postgres never delivers it again. |
| **Read again** | End the subscription without acknowledging and start a new one. Postgres delivers the same changes again, and what is recorded already is not recorded twice. |
| **Message** | What the worker sends the API. For product rows: one message per **audience** (the rows of one type under one path, which the same clients may read), holding one or more rows. For any other row: one message with the whole row. |
| **Books** | The numbers the worker keeps in `channel_counters`: the counts, the sequence counter and the frontiers. |
| **Recount** | The books counted anew from the tables, at one snapshot. A verify compares with it, a rebuild replaces the books by it. |
| **Fence** | The stretch between a recount's snapshot and the point where the stream has passed it. Inside it, a source transaction the recount already saw must not count twice. It ends at the **marker**, which the worker writes into the WAL right after the snapshot. |
| **Passing failure** | A failure that says nothing about the change: the connection, a lock, the API away. |
| **Stuck** | Five failures in a row at one position that the change itself caused. |
| **Lost case** | A state the WAL cannot repair: no slot, empty counters, a stuck worker, a rebuild that was interrupted. It ends in a rebuild. |
| **Generation** | A number that moves on whenever the books were rebuilt. A client that holds another one refetches. Each rebuild leaves an **incident**, a row in `sync_incidents`. |

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

The API receives the messages on `/internal/cdc` of its internal listener, passes them to its ActivityBus, and fans them out over SSE. Clients order by `seq`, not arrival.

## Normal flow

### Read the stream

The worker reads `cdc_pub` through `cdc_slot` with `pgoutput`. The CDC migration (`backend/scripts/migrations/10-cdc.migration.ts`) builds the publication and replica identities from the backend's entity and resource table maps.

Draft-lifecycle product tables carry the publication filter `WHERE published_at IS NOT NULL` (Postgres 17+). Channel tables are unfiltered because a `publishedAt` filter would break channel-path sync. What each lifecycle step emits: [Sync engine, Drafts](../cella/SYNC_ENGINE.md#drafts).

### Parse and collect

At startup the worker builds a registry from the backend's `entityTables` and `resourceTables`: its tracked tables. Changes of other tables are ignored. Rows that carry `stx.changedFields` (product updates through the API) use it as the change set. Everything else diffs the old and new WAL tuples, ignoring the worker's own `stx`, `seq`, and `path` stamps so stamp-backs do not loop. Deletes use the old tuple, hence `REPLICA IDENTITY FULL`. Varchar columns of 10,000+ characters are stripped after change detection. Consumers must tolerate their absence from `rowData`.

`TransactionBuffer` holds a source transaction and suppresses cascade child deletes. For an app that configures product embeddings it also drops the host updates of a transaction that deletes an embedded row (everything the worker does for embeddings is in `src/embeddings/` and returns at once while none is configured). It stamps each surviving change with the transaction's commit time. Survivors enter `FlushBuffer`, which flushes on a size or time limit (`src/constants.ts`).

A flush takes every whole source transaction that is pending, in commit order. One flush runs at a time. Once `flushBatchSize` changes are pending, the worker stops reading the stream until they are flushed, so a worker that is behind holds the stream where it is.

### Record and hand over

A flush is recorded in one transaction of the worker (`recordFlush` in `src/pipeline/process-events.ts`): insert the activities, reserve sequence values and apply counter deltas, then stamp `seq` back onto the rows. An activity's key is its id plus its commit time. The id is the commit position of its source transaction and the index of the change in that transaction, so ids are unique, also for the rows one WAL record holds (a `COPY` writes a page of them at once), and sort in commit order. Both parts of the key are the same on every delivery, so a change that is delivered again inserts nothing. Only changes whose activity was inserted by this transaction get a sequence value and count: recording happens once per change however often it arrives. A row changed twice in one flush is stamped once, with its last value. Statements run in a fixed order (counter rows by key, product rows by id) and in bounded chunks.

After the commit: mirror each changed channel's path onto `channel_counters` (computed from the row's id columns, since the generated `path` column is not in the row image), hand the changes to the API, then clean up embedded references and soft-delete owned embedded rows no host references any more. A row that is no product (a membership, a tenant, a channel) goes to the API alone and in commit order, because its listeners act on that one row and carry its channel ids. Product rows go per type and action (`attachment:update`), one message per audience with a list of its rows. The API turns a list of one into a notification for that row, with its `stx`, so the tab that wrote it fetches nothing; a longer list becomes a range. These steps repeat for a change that is delivered again, and each is safe to repeat. The worker then acknowledges the commit position of the last source transaction of the flush.

### Sequences and counters

Each flush reserves a contiguous per-organization range from `channel_counters.counts['sequence']`, assigned to product creates and updates in commit order across entity types. Soft-delete and restore count as delete and create. Key grammar and scopes: [Sync engine, Counters](../cella/SYNC_ENGINE.md#counters).

## Internal API channel

One server-to-server WebSocket to `/internal/cdc` that carries entity row data and must never be exposed to browsers or external networks. Protection: served only on the API's internal listener (`INTERNAL_PORT`, which the infra routes from the private network alone; the public listener answers 404), `CDC_SECRET` in the `x-cdc-secret` header, peers from the private network or loopback only (a public address is refused in every mode), one connection at a time (a new one replaces the old), 90-second idle timeout. The worker's health push every 15 seconds is the traffic that keeps the socket open.

A product message carries the activity of its first row, a list of rows (for each: the permission-relevant fields, its sequence value, and its previous location when it was reparented) and trace context. A message for a row that is no product carries its activity and the whole compacted row. The API also takes the two shapes a worker of the release before sends, for one release. The type check in `src/tests/wire-contract.type-check.ts` pins the outbound type to the backend's `CdcMessage` schema. The `health` control message bypasses that schema, and the same file pins its payload to the backend's `CdcWorkerHealth`.

## Failure and recovery

The slot advances only after a flush committed and is the only durable buffer, so after a crash Postgres delivers the unacknowledged changes again. The worker acknowledges in three ways and no more. A flush acknowledges the commit position of its last source transaction. An idle worker (nothing buffered, nothing in flight) acknowledges Postgres's keepalive position, which moves the slot past whatever leaves nothing to record: a marker, a source transaction whose rows the worker drops, WAL without changes of tracked tables. And a timer repeats the last acknowledged position every 10 seconds. Every subscription starts at the slot's acknowledged position with empty buffers, once the flush in flight of the subscription before it has ended. Delivery is **at least once**, recording is **once**: a change that is delivered again changes no activity, counter or sequence value, and its message is sent again with the sequence value the row already holds (consumers deduplicate by activity ID).

There is one way a failure is handled: the worker acknowledges nothing, forgets what it holds and reads again from the slot's acknowledged position. Nothing is retried in place and nothing is left out to keep going.

| Failure | Detection | Recovery |
| --- | --- | --- |
| A flush or a change fails, whatever the cause | An error in the flush's transaction, in a send to the API, or in parsing a change | The subscription ends without an acknowledgement and the worker reads again, after 0.5, 2, 5, 15 and then 30 seconds. A passing failure (`isPassingError`: the connection, a lock, a statement timeout, a serialization failure, the API away) is read again for as long as it lasts and never counted. A row the worker cannot turn into a message is the change's own failure. Five failures in a row at one position that the change itself caused make the worker `stuck`: it reports unhealthy with the position and the error, and rebuilds as soon as it is allowed to (see the lost cases). |
| API away | The WebSocket drops. Slot lag is checked every 10 seconds (degraded from 50 MB, a warning in the log at 1 GB, unhealthy from 2 GB) | Nothing is recorded: a flush waits for the socket, the stream is held and the WAL keeps the changes. A new subscription waits for the socket too. The socket reconnects with a backoff of 1 to 5 seconds, and the worker reads on. A send into a closed socket fails its flush. The API sends nothing back: a change whose message the socket took is acknowledged to the slot even when the API dies before it dispatched that message, or drops it on validation; a client learns of that change at its next catchup. |
| Slot held by another worker (rolling deploy) | Postgres error `55006`, logged as it is | The subscription is tried again 12 times at 500 ms, then every 5 seconds (the same cadence as any subscribe error). Health stays `degraded` meanwhile, with the reason `replication_stopped`. |
| Unexpected data | Draft row, or product row without an organization | Drop the draft row (rate-limited warning). A product row without an organization fails its flush: see the first row. |
| The WAL cannot help: the slot is gone, invalidated or older than its publication, the counters are empty, or the worker is stuck | Checked before every subscription; a slot older than its publication shows in the subscribe error | A lost case: the worker rebuilds its books from the tables and every client refetches. See [Verify and rebuild](#verify-and-rebuild). |

## Verify and rebuild

The failure handling has three levels and no more. The core records a change once. Whatever fails is read again from the slot. And when the WAL cannot help, or the books turn out wrong, they are rebuilt from the tables. There is one repair, the rebuild; a verify only detects. The worker runs both itself, with writes going on (`src/pipeline/verify.ts`).

Both start with a recount: every counter, counted from the tables in one `REPEATABLE READ` transaction that is taken between two flushes. Right after taking that snapshot the worker writes the marker, a Postgres logical message. Until the marker arrives in the stream, a source transaction the stream delivers may already be in the recount, and its transaction id, from BEGIN, says so. That stretch is the fence (`src/services/fence.ts`).

- **Verify** compares and runs beside the stream. What was stored at the snapshot, plus the plain counts (`e:c:`, `m:c:`) of the changes the recount already saw, must equal the recount. `sequence` and the frontiers may be ahead of the tables, never behind. Only channels the recount yields are compared: the counter row of a channel that is gone is nobody's book. Right books: `sync_state.verified_at` is stamped and nothing else is written. Wrong books: they are rebuilt, and the incident lists what differed. Once a day at 03:00 UTC the worker asks itself for a verify, exactly as `pnpm sync:verify` does, and every full bench run ends with one. A verify runs only while the worker reads; one that is asked for and cannot run stays asked for, and one that started and gave no answer (the stream did not pass its recount within five minutes) is tried again ten minutes later.
- **Rebuild** replaces the books by the recount, between two flushes, and the subscription stays. Inside the fence a source transaction the recount saw adds nothing to the plain counts; the sequence counter and the frontiers only move forward. The new counters, the fence's marker, the incident and the next generation are one transaction: a worker that dies leaves all of it or none. `pnpm sync:rebuild` asks for one: the worker looks at `sync_state.requested` every 5 seconds, and before every subscription. Both commands wait up to two minutes and exit 1 when the books were wrong or nothing answered.

One verify or rebuild runs at a time. A rebuild starts by itself in these cases; all but the first are checked before every subscription:

| Case | What the worker does first |
| --- | --- |
| A verify found the books wrong | Nothing: it rebuilds between two flushes |
| No slot, or one Postgres invalidated, on a database with a history | Makes a new slot at the current position |
| A slot that predates its publication | Drops it, unless the books were rebuilt in the last ten minutes; the next attempt makes a new one |
| `channel_counters` is empty on a database with a history (a truncate, a partial restore; the table is logged, so a crash keeps it) | Nothing |
| The worker before this one ended inside the fence of a rebuild | Nothing. What that fence left out is gone with its process, so the books are rebuilt again |
| The worker is stuck | Writes a rebuild request, then moves the slot to the current position, which gives up its backlog: everything it had not recorded. A worker that dies between the move and the rebuild finds the request at its next start. At most once in ten minutes, counted from the last rebuild of any kind, also across a restart |

While another worker still reads the slot, as during a deploy, a starting worker settles none of these: it waits for the slot first.

Every rebuild writes an incident (when, why, the positions given up, the keys that differed), moves `sync_state.generation` on and logs an error; a rebuild that was asked for logs at info. A generation only tells two states of the books apart: it grows, and is never below the clock in minutes, so a database restored from a backup cannot hand out a number a client already holds. The worker's health push carries the generation (every 15 seconds, at once when the socket opens and at once after an incident); when it moves, the API ends every app stream with `resync`, and the catchup of each new connection brings the generation that makes the client refetch.

What a lost case costs: rows changed while the slot was gone, or in a given-up backlog, keep the `seq` they had and get no activity and no notification. Counts, sequence values and every client's data are right again afterwards.

## Operational constraints

- **Adding a tracked table takes two steps:** the backend's entity or resource table map, then rerunning the CDC migration. Before every subscription the worker checks that the publication holds exactly the tables of its registry, that each has `REPLICA IDENTITY FULL`, that `wal_level` is `logical` and that its role may read the slot and write past row-level security (`src/services/setup-check.ts`). While that does not hold it reads nothing and reports unhealthy with what is wrong. The check comes before the slot, so the worker never makes a slot ahead of a missing publication.
- **`REPLICA IDENTITY FULL` is mandatory** (deletes need the old tuple), so publication column lists are unavailable and large columns are stripped in the worker.
- **Only one worker may read the slot.**
- **A source transaction is held whole, up to 100,000 changes.** The worker buffers it until its commit and records it in one transaction, at about 2 KB a change. A larger one fails where it passes the limit, and after five reads the worker is stuck and rebuilds: the rows of that backlog are counted and get no activity. Write a backfill in smaller transactions.
- **WAL retention is the recovery margin.** Needs `wal_level=logical`, slot/sender capacity and a `max_slot_wal_keep_size`: without one a worker that is down keeps WAL until the disk is full, and the worker warns about that before every subscription.
- **The worker's role needs `REPLICATION` and an effective RLS bypass** (it owns the tables and none forces row-level security, or it holds `BYPASSRLS`): without the bypass a `seq` stamp changes zero rows. The setup check reads both, so the worker reads nothing while either is missing.
- **The worker cannot hold the API's rows.** A flush locks the product rows it stamps. Every session of the worker's pool has a lock timeout of 10 seconds, a statement timeout of a minute and an idle-in-transaction timeout of 30 seconds, so Postgres takes those locks back from a worker that hangs or is cut off.
- **A held stream stays connected.** The worker repeats its last acknowledged position every 10 seconds, so a flush that holds the stream stays inside Postgres's `wal_sender_timeout`. The replication connection uses TCP keepalive, so a peer that is gone ends the read.

## Health and configuration

| Endpoint | Response |
| --- | --- |
| `GET /health` on `CDC_HEALTH_PORT` | 204 |
| `GET /health?depth=full` | JSON: `status`, `reasons`, the `replication` object (status, acknowledged position, lag in bytes and milliseconds, the failure the worker reads again from, setup problems), the socket, throughput. Answers 503 when unhealthy. |

The worker grades itself once (`gradeWorker` in `src/network/health.ts`), for the endpoint and for the health push alike. The push carries `status`, `reasons`, `details` and the generation. It goes to the API every 15 seconds, when the socket opens, when a subscription starts and at every incident. The API's `/health?depth=full` passes it on as the `cdc` component and adds only what the worker cannot tell: no worker connected, or no report for 45 seconds. So a stuck worker and a failed setup check fail a deploy's smoke step. Thresholds: `RESOURCE_LIMITS.health` in `src/constants.ts`.

| Reason | `unhealthy` when | `degraded` when |
| --- | --- | --- |
| `worker_stuck` | Five failures in a row at one position that the change itself caused | |
| `setup_problems` | The setup check found a problem: `details.setupProblems` names each | |
| `api_away` | The API has been away for more than 5 minutes | The API is away for less |
| `slot_lost` | The slot's `wal_status` is `lost` or `unreserved` | |
| `wal_lag_critical`, `wal_lag_high` | Slot lag at 2 GB | Slot lag at 50 MB |
| `event_loop_lag` | Mean event-loop delay over the last 30 seconds at 1 second | Mean delay at 100 ms |
| `replication_stopped` | | No subscription while the API is reachable and the setup holds: between two reads, and while another worker still holds the slot during a deploy |
| `reading_again` | | A failed flush is being read again, and the worker is not stuck |
| `slot_inactive` | | The worker is subscribed and Postgres shows the slot as not read |

Environment, validated in `src/env.ts` (loads the backend's `.env`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_CDC_URL` | Replication and write connection. The role needs `REPLICATION`. |
| `DATABASE_SSL_CA` | Base64 PEM CA for Postgres TLS, required in production |
| `BACKEND_INTERNAL_URL` | The API's internal listener (an http base; the socket is its `/internal/cdc` route), default port `devPorts.internal` |
| `CDC_SECRET` | Internal-channel shared secret, minimum 16 characters |
| `CDC_SLOT_NAME` | Replication slot, default `cdc_slot` |
| `CDC_HEALTH_PORT` | Health server port, default 4001 |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional OTLP base URL for telemetry; wins over the ingest key |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging. `DEBUG` also prints every query, with its values, in the `development` app mode only |

