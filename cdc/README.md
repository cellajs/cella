# CDC worker

This document covers the CDC worker: the service that turns committed PostgreSQL changes into the server-side outputs used by the sync engine.

### TL;DR

A **Change Data Capture** worker watches committed database changes and turns them into audit history, progress numbers,
totals, and live client notifications. It keeps changes in commit order and groups nearby changes
when the same clients should receive them. Each change gets a order number and all counts are updated.

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

The API receives the worker's WebSocket messages through `/internal/cdc`, publishes them to its ActivityBus, and fans them out to clients over SSE. Clients use sequence values for ordering; WebSocket arrival order is not authoritative.

## Normal event flow

### Read published changes

The worker consumes the `cdc_pub` publication through the `cdc_slot` logical-replication slot using PostgreSQL's `pgoutput` plugin. The CDC migration (`backend/scripts/migrations/10-cdc.migration.ts`) builds the publication and replica identities from the backend's entity and resource table maps. At startup, `ensureReplicationSlot()` provides a best-effort slot fallback.

Draft-lifecycle product tables use the publication filter `WHERE published_at IS NOT NULL` (PostgreSQL 17+), so the stream contains only synced rows:

- publishing a draft appears as an insert;
- unpublishing a row appears as a delete containing the old row;
- draft-only changes do not appear; and
- soft-deleting a published row remains an update, so its tombstone still syncs.

Channel tables are not filtered because their `publishedAt` field has different semantics and filtering them would break channel-path synchronization. Filter changes apply to newly decoded transactions without resetting the slot.

### Parse and batch

At startup, the worker builds a registry from the backend's `entityTables` and `resourceTables`. The registry identifies each table and precomputes its snake_case-to-camelCase column map. Tables missing from the registry are ignored.

Insert, update, and delete handlers are pure transforms that produce `{ activity, rowData, oldRowData }`:

- Product updates use `stx.changedFields`; other tables compare old and new WAL tuples.
- `stx` and `seq` are excluded from diffs so worker stamp-backs do not loop.
- No-op updates, already-soft-deleted row updates, and embedding-cleanup-only writes are ignored.
- Deletes use the old tuple, which is why tracked tables require `REPLICA IDENTITY FULL`.
- Varchar columns of at least 10,000 characters are removed after change detection to keep buffers small. Downstream code must tolerate their absence from `rowData`.

`TransactionBuffer` holds events from `BEGIN` through `COMMIT`. It suppresses child deletes from channel-entity cascades and embedding-propagation updates paired with a source delete, preventing one logical deletion from producing thousands of client events.

Surviving events enter `FlushBuffer` and flush on the first of these limits:

| Trigger | Limit |
| --- | --- |
| Normal load | 100 events |
| Low traffic | 50 ms |
| Hard cap | 20,000 events |

Each flush groups events by type and action, such as `attachment:update`. WAL order is preserved within a transaction, but cross-transaction grouping can reorder API messages. Clients therefore order changes by `seq`, not arrival time.

### Persist, stamp, and publish

Each group performs side effects in this order:

1. **Persist activities.** Activity IDs derive from the LSN, and duplicate inserts are ignored.
2. **Apply unified deltas.** The worker reserves sequence values, updates counters and frontiers, and stamps product rows.
3. **Publish.** It sends the WebSocket message, then removes deleted embedded IDs from host rows where needed.

After every group settles, the worker acknowledges the highest processed LSN, which also covers all earlier events.

### Sequences and counters

For each organization, groups reserve a contiguous range from `channel_counters.counts['sequence']`. Product creates and updates receive sequence values in WAL order, and all product entity types share this sequence.

After sequence reservation, independent updates run in parallel: frontier and count deltas are applied, assigned sequence values are written back with a bulk update, and `stx.changedFields` is cleared. Soft-delete and restore transitions are treated as delete and create so counts remain accurate.

Counter keys use these families:

| Keys | Meaning |
| --- | --- |
| `sequence` | Organization sequence reservation |
| `e:f:{type}`, `e:f:h:{type}` | Subtree and home-node sequence frontiers |
| `e:c:{type}`, `e:c:h:{type}` | Subtree and home-node entity counts |
| `m:c:{role}`, `m:c:total`, `m:c:pending` | Membership counts |
| `membership` | Change counter used to detect missed membership updates after reconnecting |
| `e:li:h:{type}`, `e:lu:h:{type}` | Last-insert and last-update timestamps |

Frontier and timestamp keys are max-merged; count keys are summed and floored at zero by `apply_count_deltas`. Reparenting moves self counts and re-credits ancestor counts.

## Internal API channel

The worker maintains one server-to-server WebSocket to `/internal/cdc`, with a 30-second ping. The channel carries entity row data and must never be exposed to browsers or external networks. It is protected by:

- the isolated internal path;
- `CDC_SECRET` in the `x-cdc-secret` header;
- a production source-IP allowlist;
- a single-connection limit; and
- a 90-second idle timeout.

`CdcOutboundMessage` contains the activity, compacted row data, previous location data for reparented rows, permission-relevant batch rows, and trace context. Batches are split by `(path, entityType)` so each message has one audience. Sequence ranges may interleave across groups, so `count`, not range arithmetic, defines batch size.

After channel-entity creates and updates, the worker copies the row's canonical generated path to `channel_counters.path`. Catch-up authorization uses this path to verify ancestry, and counter recalculation backfills it.

Control messages (`health`, `catchup_complete`, and `wal_lag_alert`) bypass the data-message schema. `src/tests/wire-contract.type-check.ts` verifies at type-check time that the worker's outbound type satisfies the backend's `CdcMessage` schema.

## Failure and recovery

Acknowledgement is manual. The worker advances the slot only after processing, so a crash can redeliver unacknowledged changes. The replication slot is the durable buffer; the worker has no durable queue of its own. It still acknowledges requested standby heartbeats while idle.

Delivery is therefore **at least once**. Activity inserts are replay-safe, but WebSocket messages may repeat and consumers deduplicate them by activity ID. Counter and sequence writes are not idempotent; if an already-applied range is replayed, a full counter recalculation is the repair path.

| Situation | Behavior |
| --- | --- |
| Activity persistence fails | Retry the batch three times, then try individual rows. If persistence still fails, skip counters and notification. Three consecutive failures open a per-table circuit for 60 seconds before a half-open probe. |
| The API WebSocket is unavailable | Pause acknowledgements and retain WAL behind the slot. Reconnect with exponential backoff from 1 to 30 seconds. Slot lag is checked every 10 seconds; 1 GB warns, while 2 GB also reports unhealthy. Both thresholds send `wal_lag_alert`. |
| The worker falls more than 10 seconds behind | Enter catch-up mode and ignore seeded inserts (`00000000-` or `gen-` IDs). Exit after three transactions below 2 seconds, recalculate counters, and send `catchup_complete` so the backend invalidates its entity cache. |
| A rolling deployment contends for the slot | Retry takeover 12 times at 500 ms, then every 5 seconds. PostgreSQL error `55006` logs the walsender holding the slot. |
| A transaction never commits | Flush it unfiltered after 30 seconds. A new `BEGIN` also flushes any transaction already in progress. |
| Unexpected data reaches the pipeline | Drop draft rows with a rate-limited warning. Log and skip product groups without an organization; their LSN is still acknowledged. |
| The slot is manually rewound or reset | Replayed counter and sequence writes can be applied twice; run a full counter recalculation. |
| The slot is dropped or becomes `lost` | Unacknowledged changes are gone. Counters can be recalculated, but the activity history retains a gap. |

## Operational constraints

- **Adding a tracked table requires two changes:** add it to the backend's entity or resource table map, then rerun the CDC migration so the publication and replica identity are regenerated. Missing the registry drops events at parse time; missing the publication means no events arrive.
- **`REPLICA IDENTITY FULL` is mandatory.** Deletes and fallback change detection need the old tuple. PostgreSQL therefore cannot use publication column lists for these tables; large columns are stripped in the worker instead.
- **`stx` and `seq` are part of the protocol.** Product update detection reads `stx.changedFields`, and the worker writes `seq` back to product rows.
- **Only one worker may consume the slot.** The backend also accepts only one CDC connection.
- **WAL retention is the recovery margin.** PostgreSQL needs `wal_level=logical`, replication slot/sender capacity, a suitable `max_slot_wal_keep_size`, and a role with `REPLICATION`.

## Health and configuration

`GET /health` on `CDC_HEALTH_PORT` returns 204. `GET /health?depth=full` returns a JSON snapshot. Health degrades if replication stops, acknowledgements pause, slot lag reaches 2 GB, or a circuit breaker opens. The same snapshot is sent to the backend every 15 seconds.

Environment values are validated in `src/env.ts`, which loads the backend's `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_CDC_URL` | PostgreSQL replication and write connection; the role needs `REPLICATION` |
| `DATABASE_SSL_CA` | Base64 PEM CA for PostgreSQL TLS; required in production |
| `API_WS_URL` | Backend WebSocket endpoint |
| `CDC_SECRET` | Internal-channel shared secret; minimum 16 characters |
| `CDC_HEALTH_PORT` | Health server port; default 4001 |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging |

`CDC_SLOT_NAME` (default `cdc_slot`) and `RELEASE_SHA` are read directly from `process.env`. Flush, retry, catch-up, and WAL-lag thresholds live in `src/constants.ts`.
