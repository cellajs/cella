# CDC worker

This document covers the CDC worker: the service that turns committed PostgreSQL changes into the server-side outputs used by the sync engine.

### TL;DR

A **Change Data Capture** worker watches committed database changes and turns them into audit history, progress numbers,
totals, and live client notifications. It keeps changes in commit order and groups nearby changes
when the same clients should receive them. Each change gets an order number and all counts are updated.

## How it fits

```text
Postgres WAL (`cdc_pub` / `cdc_slot`)
        │
        ▼
parse and normalize rows
        ▼
buffer transaction → suppress cascade noise
        ▼
micro-batch whole transactions, in commit order
        ▼
one database transaction per flush: activities, sequences, counters, row stamps
        ▼
notify API → acknowledge the last event of the flush
```

The API receives the messages on `/internal/cdc` of its internal listener, publishes them to its ActivityBus, and fans them out over SSE. Clients order by `seq`, not arrival.

## Normal event flow

### Read published changes

The worker consumes `cdc_pub` through `cdc_slot` with `pgoutput`. The CDC migration (`backend/scripts/migrations/10-cdc.migration.ts`) builds the publication and replica identities from the backend's entity and resource table maps.

Draft-lifecycle product tables carry the publication filter `WHERE published_at IS NOT NULL` (PostgreSQL 17+). Channel tables are unfiltered because a `publishedAt` filter would break channel-path sync. What each lifecycle step emits: [Sync engine, Drafts](../cella/SYNC_ENGINE.md#drafts).

### Parse and batch

At startup the worker builds a registry from the backend's `entityTables` and `resourceTables`. Unregistered tables are ignored. Rows that carry `stx.changedFields` (product updates through the API) use it as the change set. Everything else diffs the old and new WAL tuples, ignoring the worker's own `stx`, `seq`, and `path` stamps so stamp-backs do not loop. Deletes use the old tuple, hence `REPLICA IDENTITY FULL`. Varchar columns of 10,000+ characters are stripped after change detection. Consumers must tolerate their absence from `rowData`.

`TransactionBuffer` holds a transaction and suppresses cascade child deletes and embedding-propagation updates paired with a source delete. It stamps each surviving activity with the transaction's commit time. Survivors enter `FlushBuffer`, which flushes on a size or time limit (`src/constants.ts`).

A flush takes whole source transactions in commit order, up to `flushMaxEvents` events; a larger transaction is flushed alone. One flush runs at a time. Once `flushBatchSize` events are pending, the worker stops reading the replication stream until they are flushed, so a worker that is behind holds the stream where it is.

### Persist, stamp, and publish

A flush is recorded in one database transaction (`recordFlush` in `src/pipeline/process-events.ts`): insert the activities, reserve sequence values and apply counter deltas, then stamp `seq` back onto the rows. An activity's key is its id, derived from the LSN, plus its commit time, so an event that is delivered a second time inserts nothing. Only events whose activity was inserted by this transaction get a sequence value and count: recording happens once per event however often it arrives. A row changed twice in one flush is stamped once, with its last value. Statements run in a fixed order (counter rows by key, product rows by id) and in bounded chunks.

After the commit, per type and action (`attachment:update`): mirror each changed channel's path onto `channel_counters` (computed from the row's id columns, since the generated `path` column is not in the row image), publish the WebSocket message, then clean up embedded references. These steps repeat for a redelivered event, and each is safe to repeat. The worker then acknowledges the last event of the flush.

### Sequences and counters

Each flush reserves a contiguous per-organization range from `channel_counters.counts['sequence']`, assigned to product creates and updates in commit order across entity types. Soft-delete and restore count as delete and create. Key grammar and scopes: [Sync engine, Counters](../cella/SYNC_ENGINE.md#counters).

## Internal API channel

One server-to-server WebSocket to `/internal/cdc` (30-second ping) that carries entity row data and must never be exposed to browsers or external networks. Protection: served only on the backend's internal listener (`INTERNAL_PORT`, which the infra routes from the private network alone; the public listener answers 404), `CDC_SECRET` in the `x-cdc-secret` header, production source-IP allowlist, one connection at a time (a new one replaces the old), 90-second idle timeout.

Data messages carry the activity, compacted row data, the previous location of reparented rows, permission-relevant batch rows, and trace context. The type check in `src/tests/wire-contract.type-check.ts` pins the outbound type to the backend's `CdcMessage` schema. Control messages (`health`, `catchup_complete`) bypass that schema.

## Failure and recovery

The slot advances only after a flush committed and is the only durable buffer, so a crash redelivers unacknowledged changes. A message the worker has nothing to do for is acknowledged only while nothing earlier is buffered. An idle worker (nothing buffered, no acknowledgement held) also confirms the server's keepalive position, so WAL without published changes does not pile up behind the slot. Every subscription starts at the slot's confirmed position with empty buffers. Delivery is **at least once**, recording is **once**: a redelivered event changes no activity, counter or sequence, and its WebSocket message is sent again with the sequence value the row already holds (consumers deduplicate by activity ID).

| Failure | Detection | Recovery |
| --- | --- | --- |
| A flush cannot be recorded | Error in its transaction | Passing errors (deadlock, lost connection) repeat the transaction three times. Then the flush is tried one source transaction at a time. The one that still fails stops the subscription without an acknowledgement: after 5 seconds the worker reads again from the confirmed position. A failure that is not a passing error counts against the tables of that transaction: three open a per-table circuit for 60 seconds, then half-open, and events of a table with an open circuit are left out. |
| API WebSocket unavailable | Connection drop. Slot lag is checked every 10 seconds (1 GB warns, 2 GB unhealthy) | Hold data acknowledgements so WAL stays behind the slot. Reconnect with exponential backoff, 1 to 30 seconds, then send the held acknowledgement. |
| Worker more than 10 seconds behind | Commit timestamp lag | Catch-up mode: ignore seeded inserts (`00000000-` or `gen-` IDs). After three transactions under 2 seconds, recalculate counters and send `catchup_complete` so the backend invalidates its entity cache. |
| Slot held by another worker (rolling deploy) | PostgreSQL error `55006`, logged with the holding walsender | Retry the subscription 12 times at 500 ms, then every 5 seconds (the same cadence as any subscribe error). |
| Unexpected data | Draft row, or product row without an organization | Drop the draft row (rate-limited warning). A product row without an organization fails its flush: see the first row. |
| Slot dropped or `lost` | Unacknowledged changes gone | Operator recalculates counters. The activity history keeps a gap. A missing publication makes the worker drop and recreate its slot once, discarding unacknowledged WAL. |

## Operational constraints

- **Adding a tracked table takes two changes:** the backend's entity or resource table map, then rerunning the CDC migration. Missing either drops events.
- **`REPLICA IDENTITY FULL` is mandatory** (deletes need the old tuple), so publication column lists are unavailable and large columns are stripped in the worker.
- **Only one worker may consume the slot.**
- **A source transaction is held whole.** The worker buffers it until its commit and records it in one database transaction, so the largest transaction the app writes has to fit in the worker's memory.
- **WAL retention is the recovery margin.** Needs `wal_level=logical`, slot/sender capacity, a suitable `max_slot_wal_keep_size`, and a `REPLICATION` role.

## Health and configuration

| Endpoint | Response |
| --- | --- |
| `GET /health` on `CDC_HEALTH_PORT` | 204 |
| `GET /health?depth=full` | JSON snapshot. Reports `degraded` when acknowledgements pause, the WebSocket is down, a circuit is open, or event-loop lag passes 100 ms. Reports `unhealthy` when replication stops, slot lag hits 2 GB, or event-loop lag passes 1 second. A smaller status payload also goes to the backend every 15 seconds. |

Environment, validated in `src/env.ts` (loads the backend's `.env`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_CDC_URL` | Replication and write connection. The role needs `REPLICATION`. |
| `DATABASE_SSL_CA` | Base64 PEM CA for PostgreSQL TLS, required in production |
| `BACKEND_INTERNAL_URL` | The backend's internal listener (an http base; the socket is its `/internal/cdc` route), default port `devPorts.internal` |
| `CDC_SECRET` | Internal-channel shared secret, minimum 16 characters |
| `CDC_HEALTH_PORT` | Health server port, default 4001 |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging. `DEBUG` also prints every query, with its values, in the `development` app mode only |

