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

A token names one entity: the backend issues it at `GET /{tenantId}/{organizationId}/yjs/token?entityType=&entityId=` to a user who may update that row, with the row's tenant and organization, for five minutes. Before completing the handshake, the relay validates required parameters, the token's Ed25519 signature and expiry, that its entity type, entity id and tenant are the requested ones, and the per-user rate limit. The relay holds only the public half of the backend's signing key, so nothing on the relay can mint a token. Malformed requests fail as HTTP 400, a token for another document as 403 and rate limits as 429, each with a JSON `{ code, reason }` body, which a browser sees as close code 1006. The relay ends the connection once that answer is flushed, and a peer that resets the connection mid-handshake ends only its own socket. An invalid or expired token closes after the handshake with code 4001, so the client can refetch its token and reconnect with backoff. A socket also closes with 4001 when its token expires: the client reconnects with the token it refreshed meanwhile, and a user who lost access gets no new token, so revoking access reaches an open socket within five minutes.

Entity authorization runs after the socket opens, via an RLS-scoped read of the entity row and the user's memberships by the shared permission engine (no backend round trip). It refuses a row in another tenant or organization than the token names, a draft the user did not author, and a row the user may not update, and otherwise returns the document's scope as the row states it. Sync frames wait in the socket's serial queue behind it, up to 100, and later ones are dropped; a denied socket's queued frames never run. The socket joins the document's session only once authorized: until then it receives no peer frames, and it relays no awareness. Its latest awareness frame waits for the join, so a new editor's presence shows at once; a denied socket's is dropped. Sessions are keyed by tenant, entity type and id, and a session's scope is the row's, never a joiner's: seeding, logging, compaction and materialization act in it as the system. Frames that arrive while a socket closes are dropped; updates it sent before closing and that still wait in its queue are logged before it leaves the session.

| Close code | Meaning |
| --- | --- |
| `4001` | Invalid or expired token, or the socket's token expired |
| `4003` | Entity access denied |
| `4400` | Missing or invalid entity scope, or a sync frame or update Yjs cannot decode |
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

Sync frames from one socket run one at a time in arrival order through a serial queue whose first task is the socket's entity verification and join; a burst of keystrokes can never interleave. Each update is appended to `yjs_updates` before it is broadcast to peers, so peers only ever see durable content. An update Yjs cannot decode is never logged or relayed: its socket closes with 4400.

Three seconds after the last received update the log is compacted, under the document lock: base and log are merged, the merged blocks are sent to `/internal/yjs/materialize` on the backend's internal listener with the window's editors, newest first, and on success the base is replaced and exactly the rows that were read are deleted. A row appended during the write survives for the next round. The backend takes the tenant and organization from the entity row, refusing a body that names another, sanitizes media URLs and hands the document to the entity's registered materializer, which runs the normal update operation and its permission check as the newest editor who may still update the entity. The template registers the attachment update op; an app registers one per collaborative product through `defineBackendModule({ yjsMaterializer })`, and materialization returns `400` for a product without one. Only a written window folds into the base, so the base holds only written state and the log every edit the entity has not received.

| Result | Behavior |
| --- | --- |
| `2xx` | Compact: replace the base, delete the merged rows |
| `410` | Gone: the entity no longer exists. Cleanup and sweep delete the document's rows |
| `401`, `403`, `404`, `408`, `409`, `429`, `5xx` or network failure | Retry: the secret or the editors' access can change. Keep the log; the next window, cleanup or sweep retries |
| Other `4xx` | Permanent: an invalid request or no materializer registered. Keep the log; cleanup keeps the rows without retrying |
| Unparseable merged state | Permanent, never posted. Keep the log |
| A log row no merge accepts | Discarded before the window is merged, with its sender logged, so it never blocks the document; a joining client gets the rest |

### Disconnect and recovery

After the last client disconnects, the session stays warm for five minutes (a reconnect reuses it). Then cleanup compacts once more and deletes both tables' rows once the log is written or empty. A retryable failure reschedules cleanup, for up to an hour; after that, and after a permanent failure, the rows stay for the next session or the startup sweep. A client that joins while cleanup runs keeps the session and its rows.

A startup sweep runs the same compaction over sessions a crash orphaned: session rows older than the grace period with no younger log row. Because every update was logged before it was broadcast, a crash loses nothing that a client had sent.

## Durability and failure

Clients need no unload handlers or final flush: an update is durable before peers see it.

| Failure | Outcome |
| --- | --- |
| A client loses its connection | The client keeps editing and reconnects with backoff after any close but a final one. Everything it sent is logged; the next handshake uploads what it had not. |
| The relay ends a session for good (`4003`, `4400`, a frame too big, or five token refusals with no sync between them) | The client stops reconnecting and its editor turns read-only with a notice, so nothing is typed that could not be saved |
| The backend is unavailable | Materialization is retried on the next window, at cleanup, or by the sweep; the log stays until the backend recovers |
| The relay restarts | Clients reconnect with complete documents. The startup sweep compacts orphaned sessions. |
| Access revoked | The socket closes when its token expires and cannot reconnect. Materialization credits the newest editor who may still update the entity; when none may, it is refused and retried, and the rows stay until a write succeeds. |
| Entity deleted | Materialization answers `410` and the document's rows are deleted at cleanup or by the sweep. Cleanup does not resurrect the entity. |
| SSE arrives during editing | Active editors suppress Yjs-owned fields, so an older materialized snapshot cannot overwrite the local document |

## Operational constraints

- **Live collaboration is process-local.** Clients editing one entity must reach the same relay instance (single instance or entity-affinity routing), or updates are not shared between them; the log stays consistent either way.
- **No server-side edit history**: the base holds a merged snapshot and the log only what is not compacted yet. Undo, redo, and per-edit history live in clients.
- **Fragment and schema must stay aligned.** The `document-store` fragment and React-free shared BlockNote schema must match the frontend binding (custom blocks have round-trip tests).
- **Seeds are server-generated and never merged.**
- **RLS scope.** Storage reads and writes run under the document's tenant with no user context; authorization reads the row and memberships under the requesting user's. The startup sweep visits every tenant through its own tenant-scoped transaction.
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
| `YJS_TOKEN_PUBLIC_KEY` | Public half of the backend's `YJS_TOKEN_PRIVATE_KEY` (base64url Ed25519): verifies editor tokens, cannot sign one. `pnpm --filter backend yjs:public-key` prints it |
| `YJS_RELAY_SECRET` | Authenticates the relay on the backend's materialize route, minimum 16 characters |
| `BACKEND_INTERNAL_URL` | The backend's internal listener, default port `devPorts.internal` |
| `YJS_PORT` | WebSocket and health port, default 4002 (`devPorts.yjs`) |
| `YJS_DB_POOL_MAX` | PostgreSQL pool size, default 20 |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODB` | In-memory connection limiter and no TLS CA requirement. Database reads still open lazily. |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging |

The backend counterpart in `backend/src/modules/yjs/` issues tokens, serves `/internal/yjs/materialize` on the internal listener only (the public API has no path to it), sanitizes media URLs, and indexes the materializers modules register.
