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

The API receives the messages on `/internal/cdc`, publishes them to its ActivityBus, and fans them out over SSE; clients order by `seq`, not arrival.

## Normal event flow

### Read published changes

The worker consumes `cdc_pub` through `cdc_slot` with `pgoutput`; the CDC migration (`backend/scripts/migrations/10-cdc.migration.ts`) builds the publication and replica identities from the backend's entity and resource table maps.

Draft-lifecycle product tables carry the filter `WHERE published_at IS NOT NULL` (PostgreSQL 17+): publishing is an insert, unpublishing a delete with the old row, draft-only changes are absent, and soft-deleting a published row stays an update so its tombstone syncs. Channel tables are unfiltered: filtering on their `publishedAt` would break channel-path sync.

### Parse and batch

At startup the worker builds a registry from the backend's `entityTables` and `resourceTables`; unregistered tables are ignored. Handlers produce `{ activity, rowData, oldRowData }`:

- Product updates use `stx.changedFields`; other tables diff old and new WAL tuples.
- `stx` and `seq` are excluded from diffs so worker stamp-backs do not loop.
- No-op updates, updates to already-soft-deleted rows, and embedding-cleanup-only writes are ignored.
- Deletes use the old tuple, hence `REPLICA IDENTITY FULL`.
- Varchar columns of 10,000+ characters are stripped after change detection; consumers must tolerate their absence from `rowData`.

`TransactionBuffer` holds a transaction and suppresses cascade child deletes and embedding-propagation updates paired with a source delete; survivors enter `FlushBuffer`, which flushes on the first limit reached:

| Trigger | Limit |
| --- | --- |
| Normal load | 100 events |
| Low traffic | 50 ms |
| Hard cap | 20,000 events |

Each flush groups events by type and action (`attachment:update`), which can reorder messages across transactions.

### Persist, stamp, and publish

Per group, in order: persist activities (IDs derive from the LSN, duplicates ignored); apply unified deltas (reserve sequence values, apply frontier and count deltas in parallel, bulk-write `seq` back, clear `stx.changedFields`); publish the WebSocket message, then remove deleted embedded IDs from host rows. After each group settles, the worker acknowledges the highest LSN.

### Sequences and counters

Each group reserves a contiguous per-organization range from `channel_counters.counts['sequence']`, assigned to product creates and updates in WAL order; all product types share one sequence. Soft-delete and restore count as delete and create.

| Keys | Meaning |
| --- | --- |
| `sequence` | Sequence reservation |
| `e:f:{type}`, `e:f:h:{type}` | Subtree and home-node sequence frontiers |
| `e:c:{type}`, `e:c:h:{type}` | Subtree and home-node entity counts |
| `m:c:{role}`, `m:c:total`, `m:c:pending` | Membership counts |
| `membership` | Detects missed membership updates after reconnect |
| `e:li:h:{type}`, `e:lu:h:{type}` | Last-insert and last-update timestamps |

Frontier and timestamp keys max-merge; count keys sum with a lower bound of zero (`apply_count_deltas`). Reparenting moves self counts and re-credits ancestors.

## Internal API channel

One server-to-server WebSocket to `/internal/cdc` (30-second ping) that carries entity row data and must never be exposed to browsers or external networks. Protection: isolated internal path, `CDC_SECRET` in the `x-cdc-secret` header, production source-IP allowlist, single-connection limit, 90-second idle timeout.

`CdcOutboundMessage` carries the activity, compacted row data, previous location for reparented rows, permission-relevant batch rows, and trace context. Batches split by `(path, entityType)` so each message has one audience; sequence ranges may interleave across groups, so `count`, not range arithmetic, defines batch size. After channel-entity creates and updates, the worker copies the row's canonical path to `channel_counters.path` for catch-up authorization; counter recalculation backfills it.

Control messages (`health`, `catchup_complete`, `wal_lag_alert`) bypass the data-message schema. `src/tests/wire-contract.type-check.ts` verifies the outbound type against the backend's `CdcMessage` schema.

## Failure and recovery

The slot advances only after processing and is the only durable buffer, so a crash redelivers unacknowledged changes. Delivery is **at least once**: activity inserts are replay-safe, WebSocket messages may repeat (consumers deduplicate by activity ID), counter and sequence writes are not idempotent.

| Failure | Detection | Recovery |
| --- | --- | --- |
| Activity persistence fails | Insert error | Retry three times, then per row; still failing, skip counters and notification. Three consecutive failures open a per-table circuit for 60 seconds, then half-open. |
| API WebSocket unavailable | Connection drop; slot lag checked every 10 seconds (1 GB warns, 2 GB also unhealthy, both send `wal_lag_alert`) | Pause acknowledgements (WAL stays behind the slot); reconnect with exponential backoff, 1 to 30 seconds. |
| Worker more than 10 seconds behind | Commit timestamp lag | Catch-up mode: ignore seeded inserts (`00000000-` or `gen-` IDs); after three transactions under 2 seconds, recalculate counters and send `catchup_complete` so the backend invalidates its entity cache. |
| Slot held by another worker (rolling deploy) | PostgreSQL error `55006`, logged with the holding walsender | Retry takeover 12 times at 500 ms, then every 5 seconds. |
| Transaction never commits | 30-second timer, or a new `BEGIN` | Flush it unfiltered. |
| Unexpected data | Draft row, or product group without an organization | Drop the draft row (rate-limited warning); log and skip the group, still acknowledging its LSN. |
| Slot manually rewound or reset | Counter and sequence writes applied twice | Full counter recalculation. |
| Slot dropped or `lost` | Unacknowledged changes gone | Recalculate counters; the activity history keeps a gap. |

## Operational constraints

- **Adding a tracked table takes two changes:** the backend's entity or resource table map, then rerunning the CDC migration. Missing either drops events.
- **`REPLICA IDENTITY FULL` is mandatory** (deletes need the old tuple), so publication column lists are unavailable and large columns are stripped in the worker.
- **`stx` and `seq` are part of the protocol** (see Parse and batch).
- **Only one worker may consume the slot.** The backend also accepts only one CDC connection.
- **WAL retention is the recovery margin.** Needs `wal_level=logical`, slot/sender capacity, a suitable `max_slot_wal_keep_size`, and a `REPLICATION` role.

## Health and configuration

| Endpoint | Response |
| --- | --- |
| `GET /health` on `CDC_HEALTH_PORT` | 204 |
| `GET /health?depth=full` | JSON snapshot (also sent to the backend every 15 seconds); degraded when replication stops, acknowledgements pause, slot lag hits 2 GB, or a circuit opens |

Environment, validated in `src/env.ts` (loads the backend's `.env`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_CDC_URL` | Replication and write connection; the role needs `REPLICATION` |
| `DATABASE_SSL_CA` | Base64 PEM CA for PostgreSQL TLS; required in production |
| `API_WS_URL` | Backend WebSocket endpoint |
| `CDC_SECRET` | Internal-channel shared secret; minimum 16 characters |
| `CDC_HEALTH_PORT` | Health server port; default 4001 |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging |

`CDC_SLOT_NAME` (default `cdc_slot`) and `RELEASE_SHA` come straight from `process.env`; flush, retry, catch-up, and WAL-lag thresholds live in `src/constants.ts`.
