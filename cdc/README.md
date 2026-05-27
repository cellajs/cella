# cdc

PostgreSQL logical-replication worker for activity and sync events.

Subscribes to WAL changes (INSERT/UPDATE/DELETE) via the `pgoutput` plugin, transforms them into activity records, writes them to the `activities` table, and forwards events to the API server over WebSocket for real-time sync. Only runs when `DEV_MODE=full` or in production.

## Internal service only

The CDC worker is a **server-to-server** component co-located with the API server (same host/pod/network). The WebSocket channel carries full entity row data for the real-time sync pipeline. Never expose `/internal/cdc` to external networks or browser clients.

Security layers: path isolation (`/internal/cdc` only), shared secret (`CDC_SECRET`, min 16 chars), loopback enforcement in production (127.0.0.1/::1), single-connection limit, 90s idle timeout.

## File structure

```
cdc/src
├── cdc-worker.ts                Entry point
├── constants.ts                 Publication/slot names, resource limits
├── env.ts                       Zod env variables
├── table-registry.ts            Drizzle schema → tracked tables map
├── types.ts                     Shared CDC type definitions
├── pipeline
│   ├── worker.ts                Start/stop replication loop
│   ├── replication.ts           Slot management, reconnect, backpressure
│   ├── handle-message.ts        Route pgoutput messages to handlers
│   ├── parse-message.ts         Parse raw WAL into typed events
│   └── process-events.ts        Batch-process parsed events
├── handlers
│   ├── index.ts                 Re-exports
│   ├── insert.ts                INSERT handler
│   ├── update.ts                UPDATE handler
│   ├── delete.ts                DELETE handler
│   └── create-activity.ts       Build activity record from change
├── network
│   ├── websocket-client.ts      WS connection to API server
│   └── health.ts                HTTP health endpoint
├── services
│   ├── activity-service.ts      Activity persistence
│   ├── flush-buffer.ts          Debounced buffer flush
│   ├── transaction-buffer.ts    Buffer changes per transaction
│   ├── circuit-breaker.ts       Failure circuit breaker
│   ├── retry.ts                 Retry with backoff
│   ├── replication-state.ts     LSN tracking state
│   ├── catchup-recovery.ts      Catchup after reconnect
│   ├── cdc-metrics.ts           OpenTelemetry metrics
│   └── get-error-message.ts     Error normalization
├── utils
│   ├── index.ts                 Re-exports
│   ├── action-to-verb.ts        Map DB action to activity verb
│   ├── apply-unified-deltas.ts  Apply delta objects
│   ├── compact-row-data.ts      Strip unchanged fields
│   ├── compute-unified-deltas.ts  Diff old/new rows
│   ├── convert-row-keys.ts      snake_case → camelCase
│   ├── embedding-cleanup.ts     Clean up stale embeddings
│   ├── extract-row-data.ts      Extract columns from WAL tuple
│   ├── extract-stx-data.ts      Extract context from row data
│   ├── get-changed-fields.ts    Detect changed columns
│   ├── get-row-value.ts         Safe row field access
│   ├── snake-to-camel.ts        Case conversion helper
│   └── update-counts.ts         Entity count updates
├── lib
│   ├── db.ts                    PG pool for CDC
│   ├── pino.ts                  Structured logger
│   └── tracing.ts               OpenTelemetry SDK
└── tests/
```

## WAL configuration

Requires `wal_level=logical`. Already set in `compose.yaml` for local dev. For production:

```sql
ALTER SYSTEM SET wal_level = 'logical';
ALTER SYSTEM SET max_wal_senders = 10;
ALTER SYSTEM SET max_replication_slots = 10;
ALTER SYSTEM SET max_slot_wal_keep_size = '10GB';
SELECT pg_reload_conf();
```

## Scripts

```sh
pnpm dev          # Development with watch mode (requires DEV_MODE=full)
pnpm build        # Production build via tsup
pnpm start        # Run production build
pnpm start:dev    # Run with tsx (no build)
pnpm ts           # Type-check
pnpm test         # Run tests
pnpm test:watch   # Run tests in watch mode
```

## Related docs

- [Architecture overview](../info/ARCHITECTURE.md)
- [Sync engine](../info/SYNC_ENGINE.md)
