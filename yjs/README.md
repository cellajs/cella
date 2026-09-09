# Yjs worker

This document covers the Yjs worker: a WebSocket relay for **real-time collaborative editing of BlockNote descriptions**.

### TL;DR

During collaborative editing, the Yjs service is the only component that saves the shared editing
state. It starts each session from the stored description, sends edits to connected clients, and
turns the merged result into normal stored entity data through the backend. Editing clients merge
and display changes but do not save them directly. Other viewers receive the saved result through
the usual live-update system.

## How it fits

```text
BlockNote editors
        │  Yjs sync + awareness over WebSocket
        ▼
Yjs relay
  ├─ authorize connections and fan out live updates
  ├─ append every update to `yjs_updates`, compact into `yjs_documents`
  └─ materialize changed content through the API
        │
        ▼
entity description + derived fields
        │
        ▼
Postgres → CDC → SSE → non-editing viewers
```

Keystrokes merge at character level and reach peers as soon as they are durable. Once per quiet window the relay compacts the log and the backend writes the description, plus whatever the entity's registered materializer derives, through its normal update pipeline.

## Connection and auth

```text
ws://host:port/{entityId}?token=...&entityType=...&tenantId=...
```

Before completing the handshake, the relay validates required parameters, HMAC token and expiry, token scope, and the per-user rate limit. Malformed requests, scope mismatches and rate limits fail as an HTTP 400 with a JSON `{ code, reason }` body, which a browser sees as close code 1006. An invalid or expired token closes after the handshake with code 4001, so the client can refetch its token and reconnect with backoff.

Entity authorization runs after the socket opens, via an RLS-scoped read by the shared permission engine (no backend round trip). Sync frames wait in the socket's serial queue behind it, up to 100, and later ones are dropped; a denied socket's queued frames never run. Awareness bypasses the queue.

| Close code | Meaning |
| --- | --- |
| `4003` | Entity access denied |
| `4400` | Missing or invalid entity scope |
| `4503` | Authorization unavailable |

## Session lifecycle

### Storage

Two tables, both under the same tenant-scoped RLS policies:

| Table | Holds |
| --- | --- |
| `yjs_documents` | One session row per document: the compacted base state, seeded from the entity's description on first connect and replaced on compaction. |
| `yjs_updates` | An append-only log of received updates, one row per frame in arrival order, with the sending user. |

The document as the relay knows it is the base plus every logged update, merged in one call when it is read. Nothing merged is ever held in memory across an await, so concurrent frames cannot overwrite each other.

### Seeding

When no session row exists, the relay loads the entity's `description` with the same schema introspection as `permissions.ts`, converts the blocks to the `document-store` Yjs fragment, and inserts that state as the base. Seeding runs under a per-document lock, so concurrent first connections converge on one seed. Seeding writes no log row, so opening an untouched document never updates the entity.

### Handshake

A client's Step1 is answered with the diff of the merged document, followed by the relay's own Step1 carrying the merged state vector. y-websocket answers a Step1 with a Step2 on its own, so content the client holds and the relay never received (a frame lost on a bad connection, an edit made while reconnecting) is uploaded and logged like any update. The client, for its part, watches `store.pendingStructs`: structs parked for two seconds on a missing dependency trigger a fresh handshake, with a ten-second cooldown.

### Ordering, append, broadcast, compaction

Sync frames from one socket run one at a time in arrival order through a serial queue whose first task is the socket's entity verification; a burst of keystrokes can never interleave. Each update is appended to `yjs_updates` before it is broadcast to peers, so peers only ever see durable content.

Three seconds after the last received update the log is compacted, under the document lock: base and log are merged, the merged blocks are sent to `/yjs/materialize` on behalf of the last editor in the window, and on success the base is replaced and exactly the rows that were read are deleted. A row appended during the write survives for the next round. The backend sanitizes media URLs and hands the document to the entity's registered materializer, which runs the normal update operation and its permission check. The template registers the attachment update op; an app registers one per collaborative product through `defineBackendModule({ yjsMaterializer })`, and materialization returns `4xx` for a product without one.

| Result | Behavior |
| --- | --- |
| `2xx` | Compact: replace the base, delete the merged rows |
| `4xx` | Permanent: entity deleted, access revoked, or no materializer registered. Compact without a re-post |
| `5xx` or network failure | Keep the log; the next window, cleanup or sweep retries |
| Unparseable merged state | Compact without a write, so corrupt data cannot block cleanup |

### Disconnect and recovery

After the last client disconnects, the session stays warm for five minutes (a reconnect reuses it). Then cleanup compacts once more and deletes both tables' rows, or reschedules on a retryable failure.

A startup sweep runs the same compaction over sessions a crash orphaned: session rows older than the grace period with no younger log row. Because every update was logged before it was broadcast, a crash loses nothing that a client had sent.

## Durability and failure

Clients need no unload handlers or final flush: an update is durable before peers see it.

| Failure | Outcome |
| --- | --- |
| A client loses its connection | Client falls back to solo REST/offline. Everything it sent is logged; the next handshake uploads what it had not. |
| The backend is unavailable | Materialization is retried on the next window, at cleanup, or by the sweep; the log stays until the backend recovers |
| The relay restarts | Clients reconnect with complete documents. The startup sweep compacts orphaned sessions. |
| Entity deleted or access revoked | Permanent materialization failure. Cleanup does not resurrect the entity. |
| SSE arrives during editing | Active editors suppress Yjs-owned fields, so an older materialized snapshot cannot overwrite the local document |

## Operational constraints

- **Live collaboration is process-local.** Clients editing one entity must reach the same relay instance (single instance or entity-affinity routing), or updates are not shared between them; the log stays consistent either way.
- **No server-side edit history**: the base holds a merged snapshot and the log only what is not compacted yet. Undo, redo, and per-edit history live in clients.
- **Fragment and schema must stay aligned.** The `document-store` fragment and React-free shared BlockNote schema must match the frontend binding (custom blocks have round-trip tests).
- **Seeds are server-generated and never merged.**
- **RLS differs by path.** Normal operations set tenant and user context. The startup sweep visits every tenant through its own tenant-scoped transaction.
- **Materialization is eventual**: the entity row can lag the live document by the compaction window plus retry delay, and only product entities with a registered materializer persist collaborative content.

## Health and configuration

| Endpoint | Response |
| --- | --- |
| `GET /health` on `YJS_PORT` | 204 |
| `GET /health?depth=full` | JSON: version, uptime, connection, document, client, and event-loop-lag data. Degraded at 100 ms lag, unhealthy at 1 second. |
| Any other path | 404 |

Environment, validated in `src/env.ts` (loads the backend's `.env`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | RLS-scoped reads, log appends and compaction writes |
| `DATABASE_SSL_CA` | Base64 PEM CA for PostgreSQL TLS, required in production unless `NODB` |
| `YJS_SECRET` | HMAC and internal materialization secret, minimum 16 characters |
| `YJS_PORT` | WebSocket and health port, default 4002 (`devPorts.yjs`) |
| `YJS_DB_POOL_MAX` | PostgreSQL pool size, default 20 |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODB` | In-memory connection limiter and no TLS CA requirement. Database reads still open lazily. |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging |

The backend counterpart in `backend/src/modules/yjs/` issues tokens, exposes `/yjs/materialize`, sanitizes media URLs, and indexes the materializers modules register.
