# cdc: change data capture worker

PostgreSQL logical-replication worker that turns committed WAL into the sync engine's server-side outputs: **activity rows** (append-only audit log and SSE cursor history), **counter and sequence stamps** (`context_counters` plus per-row `seq` for client gap detection), and **realtime messages** pushed to the API server for SSE fan-out.

This document covers the worker itself. For what its outputs mean to clients (notification shapes, catchup, HLC merge), see [Sync engine](/docs/page/architecture/sync-engine).

## Replication session

The worker consumes the `cdc_pub` publication through the `cdc_slot` slot using the **pgoutput** plugin (protocol v1, via `pg-logical-replication`). Both are created by the CDC migration (`backend/scripts/migrations/10-cdc.migration.ts`), which regenerates the publication's table list and replica identities from the backend table maps; the worker's own `ensureReplicationSlot()` at boot is a best-effort fallback.

Acknowledgement is **manual** (`acknowledge: { auto: false }`): the slot only advances after events are fully processed (see delivery semantics below). Standby heartbeats are acknowledged when Postgres requests a reply, so an idle worker doesn't time out. The worker keeps no durable state of its own — everything needed to resume lives in the slot's restart position, and whatever was not yet acknowledged is simply redelivered.

**Slot takeover (rolling deploys).** Only one consumer can hold a slot. When a new worker generation boots while the old one still holds `cdc_slot`, the subscribe loop retries fast (12 attempts at 500 ms) for a sub-second cutover, then settles to a gentle 5 s cadence for steady-state reconnects. On PG error `55006` (object in use) it joins `pg_replication_slots` with `pg_stat_activity` and logs which walsender holds the slot (`application_name`, `client_addr`).

**Backpressure.** While the WebSocket to the API is down, LSN acknowledgements are held. WAL then accumulates against the slot and Postgres retains it until the worker catches up: the slot is the durable buffer; there is no in-worker queue to overflow. Slot lag is polled every 10 s from `pg_replication_slots`: at 1 GB the worker warns, at 2 GB it reports unhealthy, and both thresholds emit a `wal_lag_alert` control message.

## Pipeline stages

```text
Postgres WAL: pgoutput plugin, slot cdc_slot, publication cdc_pub
        ▼
parse              table-registry lookup → insert/update/delete handler
        ▼
TransactionBuffer  per-transaction buffering, cascade suppression
        ▼
FlushBuffer        50 ms cross-transaction micro-batch, grouped (type, action)
        ▼
processEvents      1. persist activities (idempotent)
                   2. apply unified deltas (seq ranges + counters)
                   3. dispatch WebSocket message (+ embedding cleanup)
        ▼
acknowledge highest processed LSN → replication slot advances
```

### Table registry

Built once at startup from the backend's `entityTables` and `resourceTables` (imported via `#/tables`; the worker is deliberately coupled to the backend's Drizzle schema). Each entry carries the kind (entity or resource), the entity/resource type, and a precomputed snake_case → camelCase column map for O(1) row conversion. WAL events for tables not in the registry are dropped at parse time.

### Handlers

The `insert`, `update`, and `delete` handlers are **pure transforms** (no database writes), each producing `{ activity, rowData, oldRowData }`:

- **Changed-field detection**: product-entity updates trust `stx.changedFields`, written by the backend sync engine inside the same transaction. Other tables fall back to diffing the WAL old/new tuples. Sync-state keys (`stx`, `seq`) are stripped from the diff so the worker's own stamp-backs don't loop.
- **Skips**: no-op updates, updates to already-soft-deleted rows, and the worker's own embedding-cleanup writes (only embedding columns changed, no `updatedAt`) are dropped.
- **Deletes** read the `old` tuple; this is why every tracked table needs `REPLICA IDENTITY FULL`.
- **Large-column stripping**: after change detection, columns whose Drizzle varchar length is ≥ 10 000 (descriptions, summaries, keywords) are stripped from `rowData` so they never accumulate in buffers. Downstream consumers must not rely on them being present.

### TransactionBuffer: cascade suppression

Events are buffered between BEGIN and COMMIT so each transaction can be filtered as a unit (events outside a transaction pass through immediately):

- A context-entity DELETE (e.g. an organization) registers its id; child deletes referencing it are dropped **inline while streaming**, so memory stays bounded no matter how large the cascade.
- On commit, a second pass catches children that appeared in WAL before their parent, and soft-cascade suppression drops embedding-propagation updates paired with a source delete in the same transaction. Clients get one parent-delete notification instead of thousands of child echoes.
- Safety valves: a transaction with no COMMIT after 30 s is force-flushed unfiltered, and a BEGIN while another transaction is active flushes the previous one.

### FlushBuffer: micro-batching

Surviving events accumulate across transactions and flush on the first of: **100 events** (the primary trigger under load), a **50 ms** window timer (the low-traffic deadline), or a 20 000-event hard cap. Each flush groups events by `type:action` (e.g. `attachment:update`) and hands the groups to `processEvents`. After all groups settle, the buffer **acknowledges only the highest LSN**, implicitly covering everything before it.

### processEvents: ordered side effects

Each group runs three steps in a fixed order, so a failure cannot leave partial side effects:

1. **Persist activities.** Multi-row insert with retry (3 attempts, exponential backoff) and `onConflictDoNothing`; a failing batch falls back to per-row inserts. If persistence permanently fails, the whole group is skipped (no deltas, no WS message) and the per-table **circuit breaker** records the failure (3 consecutive failures → open, 60 s cooldown → half-open probe). An open circuit skips that table's events so one poisoned table can't stall the stream.
2. **Apply unified deltas** (see below).
3. **Dispatch** the WebSocket message, then run embedding cleanup for product-entity updates and deletes (stripping deleted embedded ids from host array columns; done here rather than in the user's request to avoid row locks).

### Unified deltas: seq ranges and counters

One pure computation plans everything a group needs; one applier executes the plan in two phases:

- **Phase 1 (sequential):** for every context + entity-type group of product creates/updates, reserve a **contiguous seq range** by upserting `context_counters.counts['s:{entityType}']` with `RETURNING`, then assign `baseSeq + i + 1` to each row in WAL order. The context key is the row's **deepest non-null ancestor**, falling back to the organization when nearer ancestor ids are all null. A product row without even an organization violates the hierarchy model: its group fails loudly (logged, LSN still acknowledged) instead of getting an invented scope.
- **Phase 2 (parallel):** apply the remaining count deltas and stamp assigned `seq` values back onto the rows with one bulk `UPDATE ... FROM VALUES` per table (also clearing `stx.changedFields`).

Counter keys in `context_counters`: `e:{type}` entity counts (credited to the organization and every non-null ancestor; reparent diffs re-credit), `m:{role}` / `m:total` / `m:pending` membership counts plus an org-level `s:membership` bump for catchup screening, and `li:` / `lu:` last-insert/last-update epoch stamps (merged with max, not sum). All land through the `apply_count_deltas` SQL function, which floors counts at zero. Soft-delete and restore transitions are remapped to delete/create so counts stay truthful.

## Delivery semantics

**At-least-once.** The slot only advances on acknowledgement, and acknowledgement happens after processing: a crash in between redelivers the events. The consequences:

- **Activities are replay-safe.** The activity id is derived deterministically from the LSN, and inserts are `onConflictDoNothing`: replaying an unacknowledged range produces the same rows exactly once.
- **Counters and seq stamps are not.** Replaying an *already-acknowledged* range would double-count `context_counters`. That can't happen in normal operation (the slot gates replay to unacknowledged ranges); it takes a manual slot reset or LSN rewind. The repair path is catchup recovery's full counter recalculation.
- **Ordering.** Within a transaction, WAL order is preserved and seq values are assigned in it. Across transactions the FlushBuffer regroups by `(type, action)`, so delivery to the API is not globally ordered. Client-visible ordering comes from `seq`, not from message arrival.
- Downstream consumers see duplicate messages after a redelivery; they dedupe on activity id.

## Catchup mode

When the worker starts against a backlog (or falls behind), replaying WAL at full speed would hammer counters and flood the API. Lag is measured from each BEGIN's commit timestamp; catchup mode **enters above 10 s** lag and **exits after 3 consecutive transactions under 2 s** (hysteresis, so it doesn't flap). During catchup, seeded inserts (ids prefixed `00000000-` or `gen-`) are dropped. On exit the worker runs **post-catchup recovery**: it recalculates every counter from the source tables (this doubles as the repair path for any counter drift) and sends a `catchup_complete` control message so the backend busts its entity cache.

## Fan-out channel

Processed events reach clients indirectly: the worker holds **one server-to-server WebSocket** to the backend's `/internal/cdc` endpoint, which feeds the ActivityBus → SSE fan-out. Reconnects use exponential backoff with jitter (1 s → 30 s cap), with a 30 s ping.

This channel carries **full entity row data**: it is an internal service channel and must never be exposed to browsers or external networks. Defense layers: path isolation (`/internal/cdc` only), shared secret (`CDC_SECRET`, min 16 chars, sent as `x-cdc-secret`), a production source-IP allowlist (loopback/VPC), a single-connection limit (a new worker connection replaces the old), and a 90 s idle timeout.

**Message shape** (`CdcOutboundMessage`): the activity (with id, `seq`, `batchUntilSeq`), the compacted `rowData`, `batchRows` for batches (permission-relevant fields only: id, createdBy, deletedAt, publicAt, context ids), a `cacheToken` for product entities, and trace context. Batches are split per seq context so **every message describes one contiguous seq range**, the invariant client gap detection relies on.

**Control messages** bypass the data schema: `health` (pushed every 15 s), `catchup_complete`, and `wal_lag_alert`.

**Drift guard:** `src/tests/wire-contract.type-check.ts` asserts at compile time that the outbound message type satisfies the backend's `CdcMessage` schema type. It runs under `pnpm ts`, so contract drift fails type-checking, not runtime.

## Health

`GET /health` on `CDC_HEALTH_PORT` returns 204; `GET /health?depth=full` returns a JSON snapshot. Status degrades on: replication stopped, acknowledgements paused (WS down), slot lag ≥ 2 GB, or open circuit breakers. The same snapshot is pushed to the backend every 15 s over the WebSocket.

## Constraints

- **Adding a tracked table takes two coupled steps**: add it to the backend's `entityTables`/`resourceTables` maps *and* re-run the CDC migration, which regenerates the publication and sets `REPLICA IDENTITY FULL` from those maps. Miss the registry and events are silently dropped at parse; miss the publication and no WAL events arrive at all. There is no `FOR ALL TABLES`: the list is explicit.
- **`REPLICA IDENTITY FULL` is mandatory** on every tracked table. Delete row data and the changed-field fallback both read the old tuple. It is also why the publication carries all columns: Postgres rejects publication column lists on tables with replica identity FULL.
- **Large columns are stripped in-process, not in the publication.** Anything downstream of the handlers must tolerate their absence from `rowData`.
- **`stx` and `seq` are load-bearing columns** on product tables: `stx.changedFields` drives update detection and the worker writes `seq` back. Renaming or dropping them breaks the pipeline.
- **One consumer per slot.** A second worker contends and sits in the takeover retry loop; the backend likewise accepts a single worker connection.
- **WAL retention is the safety margin.** Postgres needs `wal_level=logical`, slot/sender headroom, and a sane `max_slot_wal_keep_size` (dev is preconfigured in `compose.yaml`; production is provisioned by the infra stack). If the slot is dropped or overflows to `wal_status='lost'`, unacknowledged changes are gone: recovery is a counter recalculation plus accepting the audit gap. The DB role needs the `REPLICATION` attribute.
- **Everything downstream must tolerate at-least-once**: duplicate messages and conflict-ignored activity inserts are normal after a crash.

## Environment

Validated in `src/env.ts` (loads the backend's `.env`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_CDC_URL` | Postgres connection for replication + writes; the role needs `REPLICATION` |
| `DATABASE_SSL_CA` | Base64 PEM CA to verify Postgres TLS; required in production |
| `API_WS_URL` | Backend WebSocket endpoint (defaults to `ws://localhost:{backendPort}/internal/cdc`) |
| `CDC_SECRET` | Shared secret for the internal channel (min 16 chars) |
| `CDC_HEALTH_PORT` | Health server port (default 4001) |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODE_ENV` / `PINO_LOG_LEVEL` / `DEBUG` | Runtime mode, log level, Drizzle query logging |

Read directly from `process.env` (not in the schema): `CDC_SLOT_NAME` (default `cdc_slot`) and `RELEASE_SHA` (health version header). Tuning constants (flush window, retry/backoff, catchup thresholds, WAL-lag thresholds) live in `src/constants.ts`.

## Related docs

- [Architecture overview](/docs/page/architecture)
- [Sync engine](/docs/page/architecture/sync-engine)
