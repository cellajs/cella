# Yjs collaborative editing relay

The Yjs worker is a WebSocket relay for real-time collaborative editing of BlockNote descriptions. During collaboration, the relay is the single writer: it seeds new sessions from the stored description and materializes merged edits back into the entity row. Clients merge and render the shared document, but do not seed or persist it.

This document covers the relay. For token fetching, solo fallback, SSE suppression, offline writes, and HLC merging, see the [sync engine documentation](/docs/page/architecture/sync-engine).

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

The relay drives two related data paths:

- **Live CRDT state:** keystrokes merge at character level and reach peers immediately.
- **Materialized entity state:** once per save window, the relay persists the merged document and asks the backend to update the description, summary, checkbox counts, keywords, and sync metadata.

The backend uses its normal update pipeline for materialization: it rechecks permission, sanitizes media URLs, derives fields, stamps a server HLC, and commits. Clients with an active editor suppress Yjs-owned fields from SSE so an older materialized snapshot cannot overwrite their fresher local document.

## Connection and authorization

Clients connect to:

```text
ws://host:port/{entityId}?token=...&entityType=...&tenantId=...
```

Before completing the WebSocket handshake, the relay validates required parameters, the HMAC token and expiry, token scope, and the per-user rate limit (20 connections per 60 seconds). Failed upgrades receive a raw HTTP rejection. This avoids briefly opening the socket, which would reset the client's reconnect backoff.

Entity authorization happens asynchronously after the socket opens. The shared permission engine performs an RLS-scoped read of the entity and memberships without a backend round trip. Sync messages wait behind this check, up to 100 messages or about 200 KB. Awareness messages are not buffered because they are ephemeral and never persisted.

| Close code | Meaning |
| --- | --- |
| `4001` | Invalid or expired token |
| `4003` | Token scope mismatch or entity access denied |
| `4400` | Missing or invalid entity scope |
| `4429` | Connection rate exceeded |
| `4503` | Authorization unavailable |

## Session lifecycle

### State and seeding

Rooms are keyed by `{entityType}:{entityId}`. Each process keeps the room's clients, timers, pending updates, cached state, and materialization baseline in memory.

The relay does not keep a resident server-side `Y.Doc`. It stores raw binary updates and works with `Y.mergeUpdates`, `Y.diffUpdate`, and `Y.encodeStateAsUpdate`. Short-lived `Y.Doc` instances are created only when converting between Yjs and BlockNote. During sync step 1, the relay computes a diff from the client's state vector and falls back to the full state if the stored update is corrupt.

When an authorized connection finds no `yjs_documents` row, the relay:

1. loads the entity's `description` using the same schema introspection as `permissions.ts`;
2. converts the blocks to the `document-store` Yjs fragment; and
3. inserts that state as the canonical seed.

The server BlockNote schema comes from the same React-free configuration as the frontend and is covered by round-trip tests for custom blocks. Concurrent first connections may build the same seed, but `ON CONFLICT DO NOTHING` followed by a reload makes every connection adopt one winner. That seed also becomes the materialization baseline, so merely opening an untouched document does not update the entity.

### Relay, save, and materialize

Incoming document updates are broadcast to peers first, then merged into pending state. A three-second debounce combines edits from every active client into one save per document rather than one save per editor.

`yjs_documents` stores an overwrite snapshot, not an update log. Each save writes the fully merged state to the document's single row. Undo and redo history remains client-side. If a save fails, its snapshot is merged back into pending state for the next window; a short-lived cache avoids rereading the database within that window.

After saving, the relay converts the snapshot to BlockNote JSON and compares it with the last materialized content. If it changed, the relay sends one secret-authenticated request to `/yjs/materialize`. The backend acts for the last editor in the save window, rechecks update permission, sanitizes untrusted media URLs, derives dependent fields, and applies a server HLC. Attribution is therefore per window, not per individual change.

Materialization results control cleanup and retries:

| Result | Behavior |
| --- | --- |
| `2xx` | Mark the snapshot materialized |
| `4xx` | Treat as permanent; the entity was deleted, access was revoked, or no materializer exists |
| `5xx` or network failure | Keep the session row and retry |
| Unparseable stored state | Treat as permanent so corrupt data cannot block cleanup forever |

### Disconnect and recovery

When the last client disconnects, the room stays warm for a five-minute grace period. A reconnect during that period reuses its pending state. After the grace period, cleanup waits for any in-flight save, flushes remaining updates, and performs a final materialization. Deleting the `yjs_documents` row is gated on that result: retryable failures keep the row and reschedule cleanup; success or a permanent failure allows deletion.

At startup, a sweep handles rows orphaned by a relay crash. Old rows with `last_edited_by` and non-empty state are materialized before deletion; seed-only rows can be deleted directly. Retryable failures remain for a later boot or session. Duplicate materialization across instances is harmless because unchanged content is a no-op and HLC ordering resolves concurrent durable writes.

The sweep intentionally reads across tenants without RLS context. If the worker's database role enforces RLS, the sweep cannot see those rows and degrades to a no-op.

## Durability and failure behavior

Durability has three layers:

1. Every connected client holds a complete live `Y.Doc`.
2. `yjs_documents` preserves the relay session, normally within three seconds and for five minutes after the last disconnect.
3. The entity's `description` is the durable application record.

Because the relay materializes independently of the browser lifecycle, clients do not need unload handlers or a final flush. The remaining loss window is the relay's three-second save debounce, and only when the relay and every connected client disappear within that window.

| Scenario | Outcome |
| --- | --- |
| Two users edit the same paragraph | Yjs merges both edits at character level |
| A tab closes immediately after typing | The relay continues saving and materializing the received update |
| A client loses its connection | It falls back to solo REST/offline behavior; the relay materializes the shared session it has |
| The backend is unavailable | Materialization retries and cleanup keeps the session row until the backend recovers |
| The relay restarts | Clients reconnect with complete documents; the startup sweep recovers saved orphaned sessions |
| The entity is deleted or access is revoked | Materialization becomes permanent failure and cleanup does not resurrect the entity |
| SSE arrives during editing | Yjs-owned fields are suppressed for the active editor |

One known conflict remains: if one user edits in solo mode while others are in an active collaborative session, the next collaborative materialization can supersede that solo description. The solo edit does not enter the shared Yjs document.

## Operational constraints

- **Live collaboration is process-local.** Clients editing the same entity must reach the same relay instance. Use one instance or entity-affinity routing. Multiple uncoordinated instances do not share live updates and can overwrite each other's session snapshots.
- **There is one document per entity.** Both the room key and database uniqueness use entity type plus entity ID.
- **There is no server-side edit history.** The database contains a merged snapshot; per-edit history belongs in clients.
- **The fragment and schema must remain aligned.** The `document-store` fragment and shared BlockNote schema must match the frontend binding.
- **Seeds are server-generated and never merged.** Merging independently generated seeds would duplicate content; conflict handling chooses and reloads one canonical seed.
- **Authorization is asynchronous.** The socket opens before entity access is known. Sync messages buffer behind the decision, while awareness bypasses it.
- **RLS differs by path.** Normal operations set tenant and user context; the startup sweep is deliberately cross-tenant.
- **Materialization is eventual.** The entity row can lag the live document by the save window and any retry delay. Only product entities with a registered materializer can persist collaborative content.

## Health and configuration

The HTTP server starts before backend readiness checks so the platform can see its port immediately. `GET /health` returns 204, while `GET /health?depth=full` returns version, uptime, connection, document, client, and event-loop-lag data. Status becomes degraded at 100 ms event-loop lag and unhealthy at 1 second. Other paths return 404.

Worker tuning defaults live in the relay:

| Setting | Default | Location |
| --- | --- | --- |
| Save and materialize debounce | 3 seconds | `src/constants.ts` |
| Grace period and cleanup retry | 5 minutes | `src/constants.ts` |
| Awareness rate | 2 messages per second per client | `src/constants.ts` |
| Connection rate | 20 per user per 60 seconds | `src/server/rate-limiter.ts` |
| Maximum WebSocket payload | 2 MB | `src/server/ws-server.ts` |
| Pre-authorization buffer | 100 messages | `src/sync/relay.ts` |

Environment values are validated in `src/env.ts`, which loads the backend's `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection for RLS-scoped reads and session writes |
| `DATABASE_SSL_CA` | Base64 PEM CA for PostgreSQL TLS; required in production |
| `YJS_SECRET` | HMAC and internal materialization secret; minimum 16 characters |
| `YJS_PORT` | WebSocket and health port; defaults to the configured Yjs URL or 4002 |
| `YJS_DB_POOL_MAX` | PostgreSQL pool size; default 20 |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODB` | Disable database-backed paths and use the in-memory rate limiter |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging |

The backend counterpart lives in `backend/src/modules/yjs/`. It issues tokens, exposes `/yjs/materialize`, sanitizes media URLs, and registers per-entity materializers in `yjs-materializers.ts`.
