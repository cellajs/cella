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

Keystrokes merge at character level and reach peers immediately; once per save window the relay persists the merged document and the backend updates description, summary, checkbox counts, keywords, and sync metadata through its normal update pipeline.

## Connection and auth

```text
ws://host:port/{entityId}?token=...&entityType=...&tenantId=...
```

Before completing the handshake, the relay validates required parameters, HMAC token and expiry, token scope, and the per-user rate limit; failed upgrades get a raw HTTP rejection so the client's reconnect backoff survives.

Entity authorization runs after the socket opens, via an RLS-scoped read by the shared permission engine (no backend round trip). Sync messages wait behind it (up to 100 messages or about 200 KB); awareness is not buffered.

| Close code | Meaning |
| --- | --- |
| `4001` | Invalid or expired token |
| `4003` | Token scope mismatch or entity access denied |
| `4400` | Missing or invalid entity scope |
| `4429` | Connection rate exceeded |
| `4503` | Authorization unavailable |

## Session lifecycle

### State and seeding

Rooms are keyed by `{entityType}:{entityId}` and held in process memory as raw binary updates (`Y.mergeUpdates`, `Y.diffUpdate`, `Y.encodeStateAsUpdate`); short-lived `Y.Doc` instances exist only for Yjs/BlockNote conversion. Sync step 1 diffs against the client's state vector, or sends full state if the stored update is corrupt.

When no `yjs_documents` row exists, the relay loads the entity's `description` with the same schema introspection as `permissions.ts`, converts the blocks to the `document-store` Yjs fragment, and inserts that state as the canonical seed. Concurrent first connections race; `ON CONFLICT DO NOTHING` plus a reload picks one winner. The seed is the materialization baseline, so opening an untouched document does not update the entity.

### Relay, save, and materialize

Updates are broadcast to peers, then merged into pending state; a three-second debounce yields one save per document, overwriting its single `yjs_documents` row. A failed save merges back into pending state for the next window.

After saving, the relay compares the snapshot's BlockNote JSON with the last materialized content; on change it sends one secret-authenticated request to `/yjs/materialize`. The backend acts for the last editor in the window, rechecks update permission, sanitizes media URLs, derives fields, and applies a server HLC.

| Result | Behavior |
| --- | --- |
| `2xx` | Mark the snapshot materialized |
| `4xx` | Permanent: entity deleted, access revoked, or no materializer |
| `5xx` or network failure | Keep the session row and retry |
| Unparseable stored state | Permanent, so corrupt data cannot block cleanup |

### Disconnect and recovery

After the last client disconnects, the room stays warm for five minutes (a reconnect reuses pending state); then cleanup flushes remaining updates, runs a final materialization, and deletes the `yjs_documents` row, or reschedules on a retryable failure.

A startup sweep handles rows orphaned by a crash: rows with `last_edited_by` and non-empty state are materialized before deletion, seed-only rows deleted directly, retryable failures left for a later boot. Duplicate materialization is harmless: unchanged content is a no-op and HLC ordering resolves concurrent writes.

## Durability and failure

Durability layers:

1. Every connected client holds a complete live `Y.Doc`.
2. `yjs_documents` preserves the relay session (saved within three seconds, kept five minutes after the last disconnect).
3. The entity's `description` is the durable application record.

Clients need no unload handlers or final flush; the only loss window is the three-second debounce, and only if the relay and every connected client disappear within it.

| Failure | Outcome |
| --- | --- |
| Tab closes right after typing | The relay still saves and materializes the received update |
| A client loses its connection | Client falls back to solo REST/offline; the relay materializes what it has |
| The backend is unavailable | Materialization retries; cleanup keeps the session row until the backend recovers |
| The relay restarts | Clients reconnect with complete documents; the startup sweep recovers orphaned sessions |
| Entity deleted or access revoked | Permanent materialization failure; cleanup does not resurrect the entity |
| SSE arrives during editing | Active editors suppress Yjs-owned fields, so an older materialized snapshot cannot overwrite the local document |
| A solo-mode edit during a collaborative session | Known conflict: the next collaborative materialization can supersede the solo description, which never enters the shared document |

## Operational constraints

- **Live collaboration is process-local.** Clients editing one entity must reach the same relay instance (single instance or entity-affinity routing), or updates are not shared and snapshots collide.
- **One document per entity**, keyed by entity type plus ID in both room and database.
- **No server-side edit history**: the database holds a merged snapshot; undo, redo, and per-edit history live in clients.
- **Fragment and schema must stay aligned.** The `document-store` fragment and React-free shared BlockNote schema must match the frontend binding (custom blocks have round-trip tests).
- **Seeds are server-generated and never merged.**
- **RLS differs by path.** Normal operations set tenant and user context; the startup sweep runs across all tenants without RLS context, so a role that enforces RLS makes it a no-op.
- **Materialization is eventual**: the entity row can lag the live document by the save window plus retry delay, and only product entities with a registered materializer persist collaborative content.

## Health and configuration

| Endpoint | Response |
| --- | --- |
| `GET /health` on `YJS_PORT` | 204 |
| `GET /health?depth=full` | JSON: version, uptime, connection, document, client, and event-loop-lag data; degraded at 100 ms lag, unhealthy at 1 second |
| Any other path | 404 |

The HTTP server starts before backend readiness checks, so the port is visible immediately.

| Setting | Default | Location |
| --- | --- | --- |
| Save and materialize debounce | 3 seconds | `src/constants.ts` |
| Grace period and cleanup retry | 5 minutes | `src/constants.ts` |
| Awareness rate | 2 per second per client | `src/constants.ts` |
| Connection rate | 20 per user per 60 seconds | `src/server/rate-limiter.ts` |
| Maximum WebSocket payload | 2 MB | `src/server/ws-server.ts` |
| Pre-authorization buffer | 100 messages | `src/sync/relay.ts` |

Environment, validated in `src/env.ts` (loads the backend's `.env`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | RLS-scoped reads and session writes |
| `DATABASE_SSL_CA` | Base64 PEM CA for PostgreSQL TLS; required in production |
| `YJS_SECRET` | HMAC and internal materialization secret; minimum 16 characters |
| `YJS_PORT` | WebSocket and health port; defaults to the configured Yjs URL or 4002 |
| `YJS_DB_POOL_MAX` | PostgreSQL pool size; default 20 |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODB` | Disable database paths; in-memory rate limiter |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging |

The backend counterpart in `backend/src/modules/yjs/` issues tokens, exposes `/yjs/materialize`, sanitizes media URLs, and registers per-entity materializers in `yjs-materializers.ts`.
