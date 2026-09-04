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
micro-batch events by type and action
        ▼
persist activities → update sequences and counters → notify API
        ▼
acknowledge the highest processed LSN
```

The API receives the messages on `/internal/cdc`, publishes them to its ActivityBus, and fans them out over SSE. Clients order by `seq`, not arrival.

## Normal event flow

### Read published changes

The worker consumes `cdc_pub` through `cdc_slot` with `pgoutput`. The CDC migration (`backend/scripts/migrations/10-cdc.migration.ts`) builds the publication and replica identities from the backend's entity and resource table maps.

Draft-lifecycle product tables carry the publication filter `WHERE published_at IS NOT NULL` (PostgreSQL 17+). Channel tables are unfiltered because a `publishedAt` filter would break channel-path sync. What each lifecycle step emits: [Sync engine, Drafts](../cella/SYNC_ENGINE.md#drafts).

### Parse and batch

At startup the worker builds a registry from the backend's `entityTables` and `resourceTables`. Unregistered tables are ignored. Rows that carry `stx.changedFields` (product updates through the API) use it as the change set. Everything else diffs the old and new WAL tuples, ignoring the worker's own `stx`, `seq`, and `path` stamps so stamp-backs do not loop. Deletes use the old tuple, hence `REPLICA IDENTITY FULL`. Varchar columns of 10,000+ characters are stripped after change detection. Consumers must tolerate their absence from `rowData`.

`TransactionBuffer` holds a transaction and suppresses cascade child deletes and embedding-propagation updates paired with a source delete. Survivors enter `FlushBuffer`, which flushes on a size or time limit (`src/constants.ts`).

Each flush groups events by type and action (`attachment:update`), which can reorder messages across transactions.

### Persist, stamp, and publish

Per group, in order: persist activities (IDs derive from the LSN, so a replay is idempotent), reserve sequence values and apply counter deltas, stamp `seq` back onto the rows, mirror changed channel paths onto `channel_counters`, publish the WebSocket message, then clean up embedded references. Groups of one flush run concurrently. The worker acknowledges the highest LSN once every group has settled.

### Sequences and counters

Each group reserves a contiguous per-organization range from `channel_counters.counts['sequence']`, assigned to product creates and updates in WAL order. Soft-delete and restore count as delete and create. Key grammar and scopes: [Sync engine, Counters](../cella/SYNC_ENGINE.md#counters).

## Internal API channel

One server-to-server WebSocket to `/internal/cdc` (30-second ping) that carries entity row data and must never be exposed to browsers or external networks. Protection: isolated internal path, `CDC_SECRET` in the `x-cdc-secret` header, production source-IP allowlist, one connection at a time (a new one replaces the old), 90-second idle timeout.

Data messages carry the activity, compacted row data, the previous location of reparented rows, permission-relevant batch rows, and trace context. The type check in `src/tests/wire-contract.type-check.ts` pins the outbound type to the backend's `CdcMessage` schema. Control messages (`health`, `catchup_complete`) bypass that schema.

## Failure and recovery

The slot advances only after processing and is the only durable buffer, so a crash redelivers unacknowledged changes. Delivery is **at least once**: activity inserts are replay-safe, WebSocket messages may repeat (consumers deduplicate by activity ID), counter and sequence writes are not idempotent.

| Failure | Detection | Recovery |
| --- | --- | --- |
| Activity persistence fails | Insert error | Transient errors retry three times, then per row. Rows that still fail skip counters and notification. Three consecutive failures open a per-table circuit for 60 seconds, then half-open. |
| API WebSocket unavailable | Connection drop. Slot lag is checked every 10 seconds (1 GB warns, 2 GB unhealthy) | Hold data acknowledgements so WAL stays behind the slot. Reconnect with exponential backoff, 1 to 30 seconds. |
| Worker more than 10 seconds behind | Commit timestamp lag | Catch-up mode: ignore seeded inserts (`00000000-` or `gen-` IDs). After three transactions under 2 seconds, recalculate counters and send `catchup_complete` so the backend invalidates its entity cache. |
| Slot held by another worker (rolling deploy) | PostgreSQL error `55006`, logged with the holding walsender | Retry the subscription 12 times at 500 ms, then every 5 seconds (the same cadence as any subscribe error). |
| Unexpected data | Draft row, or product group without an organization | Drop the draft row (rate-limited warning). Log and skip the whole group, activities included, still acknowledging its LSN. |
| Slot dropped or `lost` | Unacknowledged changes gone | Operator recalculates counters. The activity history keeps a gap. A missing publication makes the worker drop and recreate its slot once, discarding unacknowledged WAL. |

## Operational constraints

- **Adding a tracked table takes two changes:** the backend's entity or resource table map, then rerunning the CDC migration. Missing either drops events.
- **`REPLICA IDENTITY FULL` is mandatory** (deletes need the old tuple), so publication column lists are unavailable and large columns are stripped in the worker.
- **Only one worker may consume the slot.**
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
| `API_WS_URL` | Backend WebSocket endpoint |
| `CDC_SECRET` | Internal-channel shared secret, minimum 16 characters |
| `CDC_HEALTH_PORT` | Health server port, default 4001 |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging |

