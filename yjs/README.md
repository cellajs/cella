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
  ├─ save merged binary state to `yjs_documents`
  └─ materialize changed content through the API
        │
        ▼
entity description + derived fields
        │
        ▼
Postgres → CDC → SSE → non-editing viewers
```

Keystrokes merge at character level and reach peers immediately. Once per save window the relay persists the merged document and the backend writes the description, plus whatever the entity's registered materializer derives, through its normal update pipeline.

## Connection and auth

```text
ws://host:port/{entityId}?token=...&entityType=...&tenantId=...
```

Before completing the handshake, the relay validates required parameters, HMAC token and expiry, token scope, and the per-user rate limit. Malformed requests, scope mismatches and rate limits fail as an HTTP 400 with a JSON `{ code, reason }` body, which a browser sees as close code 1006. An invalid or expired token closes after the handshake with code 4001, so the client can refetch its token and reconnect with backoff.

Entity authorization runs after the socket opens, via an RLS-scoped read by the shared permission engine (no backend round trip). Up to 100 sync messages wait behind it and later ones are dropped. Awareness is not buffered.

| Close code | Meaning |
| --- | --- |
| `4003` | Entity access denied |
| `4400` | Missing or invalid entity scope |
| `4503` | Authorization unavailable |

## Session lifecycle

### State and seeding

When no `yjs_documents` row exists, the relay loads the entity's `description` with the same schema introspection as `permissions.ts`, converts the blocks to the `document-store` Yjs fragment, and inserts that state as the canonical seed. Concurrent first connections race, and `ON CONFLICT DO NOTHING` plus a reload picks one winner. The seed is the materialization baseline, so opening an untouched document does not update the entity.

### Relay, save, and materialize

Updates are broadcast to peers, then merged into pending state. A three-second debounce yields one save per document, overwriting its single `yjs_documents` row. A failed save merges back into pending state for the next window.

After saving, the relay compares the snapshot's BlockNote JSON with the last materialized content. On change it sends one secret-authenticated request to `/yjs/materialize`. The backend acts for the last editor in the window, sanitizes media URLs, and hands the document to the entity's registered materializer, which runs the normal update operation and its permission check. The template registers none, so materialization returns `4xx` until an app registers one through `defineBackendModule({ yjsMaterializer })`.

| Result | Behavior |
| --- | --- |
| `2xx` | Mark the snapshot materialized |
| `4xx` | Permanent: entity deleted, access revoked, or no materializer registered |
| `5xx` or network failure | Keep the session row and retry |
| Unparseable stored state | Permanent, so corrupt data cannot block cleanup |

### Disconnect and recovery

After the last client disconnects, the room stays warm for five minutes (a reconnect reuses pending state). Then cleanup flushes remaining updates, runs a final materialization, and deletes the `yjs_documents` row, or reschedules on a retryable failure.

A startup sweep handles rows older than the grace period that a crash orphaned: rows with `last_edited_by` and non-empty state are materialized before deletion, seed-only rows deleted directly, retryable failures left for a later boot. Duplicate materialization is harmless because unchanged content is a no-op.

## Durability and failure

Clients need no unload handlers or final flush. The only loss window is the three-second debounce, and only if the relay and every connected client disappear within it.

| Failure | Outcome |
| --- | --- |
| A client loses its connection | Client falls back to solo REST/offline. The relay materializes what it has. |
| The backend is unavailable | Materialization is retried on the next save window or at cleanup, which keeps the session row until the backend recovers |
| The relay restarts | Clients reconnect with complete documents. The startup sweep recovers orphaned sessions. |
| Entity deleted or access revoked | Permanent materialization failure. Cleanup does not resurrect the entity. |
| SSE arrives during editing | Active editors suppress Yjs-owned fields, so an older materialized snapshot cannot overwrite the local document |

## Operational constraints

- **Live collaboration is process-local.** Clients editing one entity must reach the same relay instance (single instance or entity-affinity routing), or updates are not shared and snapshots collide.
- **No server-side edit history**: the database holds a merged snapshot. Undo, redo, and per-edit history live in clients.
- **Fragment and schema must stay aligned.** The `document-store` fragment and React-free shared BlockNote schema must match the frontend binding (custom blocks have round-trip tests).
- **Seeds are server-generated and never merged.**
- **RLS differs by path.** Normal operations set tenant and user context. The startup sweep runs across all tenants without RLS context, so a role that enforces RLS makes it a no-op.
- **Materialization is eventual**: the entity row can lag the live document by the save window plus retry delay, and only product entities with a registered materializer persist collaborative content.

## Health and configuration

| Endpoint | Response |
| --- | --- |
| `GET /health` on `YJS_PORT` | 204 |
| `GET /health?depth=full` | JSON: version, uptime, connection, document, client, and event-loop-lag data. Degraded at 100 ms lag, unhealthy at 1 second. |
| Any other path | 404 |

Environment, validated in `src/env.ts` (loads the backend's `.env`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | RLS-scoped reads and session writes |
| `DATABASE_SSL_CA` | Base64 PEM CA for PostgreSQL TLS, required in production unless `NODB` |
| `YJS_SECRET` | HMAC and internal materialization secret, minimum 16 characters |
| `YJS_PORT` | WebSocket and health port, default 4002 (`devPorts.yjs`) |
| `YJS_DB_POOL_MAX` | PostgreSQL pool size, default 20 |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODB` | In-memory connection limiter and no TLS CA requirement. Database reads still open lazily. |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging |

The backend counterpart in `backend/src/modules/yjs/` issues tokens, exposes `/yjs/materialize`, sanitizes media URLs, and indexes the materializers modules register.
