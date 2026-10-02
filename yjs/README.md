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

Keystrokes merge at character level and reach peers as soon as they are durable. Once per quiet window, and at least every ten seconds while someone keeps typing, the relay compacts the log and the backend writes the description, plus whatever the entity's registered materializer derives, through its normal update pipeline.

## Connection and auth

```text
ws://host:port/{entityId}?token=...&entityType=...&tenantId=...
```

A token names one entity: the backend issues it at `GET /{tenantId}/{organizationId}/yjs/token?entityType=&entityId=` to a user who may update that row, with the row's tenant and organization, for five minutes. Before completing the handshake, the relay validates required parameters, the token's Ed25519 signature and expiry, that its entity type, entity id and tenant are the requested ones, and the per-user rate limit. The relay holds only the public half of the backend's signing key, so nothing on the relay can mint a token. Malformed requests fail as HTTP 400, a token for another document as 403 and rate limits as 429, each with a JSON `{ code, reason }` body, which a browser sees as close code 1006. The relay ends the connection once that answer is flushed, and a peer that resets the connection mid-handshake ends only its own socket. An invalid or expired token closes after the handshake with code 4001, so the client can refetch its token and reconnect with backoff. A socket also closes with 4001 when its token expires: the client reconnects with the token it refreshed meanwhile, and a user who lost access gets no new token, so revoking access reaches an open socket within five minutes.

Entity authorization runs after the socket opens, via an RLS-scoped read of the entity row and the user's memberships by the shared permission engine (no backend round trip). It refuses a row in another tenant or organization than the token names, a draft the user did not author, and a row the user may not update, and otherwise returns the document's scope as the row states it. Sync frames wait in the socket's serial queue behind it, up to 100, and later ones are dropped; a denied socket's queued frames never run. The socket joins the document's session only once authorized: until then it receives no peer frames, and it relays no awareness. Its latest awareness frame waits for the join, so a new editor's presence shows at once; a denied socket's is dropped. Sessions are keyed by tenant, entity type and id, and a session's scope is the row's, never a joiner's: seeding, logging, compaction and materialization act in it as the system. Frames that arrive while a socket closes are dropped; updates it sent before closing and that still wait in its queue are logged before it leaves the session, unless the session ended under it meanwhile: those belong to a generation its next handshake drops.

| Close code | Meaning |
| --- | --- |
| `1011` | Handling a frame failed in the relay; the client reconnects |
| `1013` | The socket's session ended: its document was retired. The client reconnects and handshakes again |
| `4001` | Invalid or expired token, or the socket's token expired |
| `4003` | Entity access denied |
| `4400` | Missing or invalid entity scope, a frame no decoder accepts (its message type, a sync frame, an update or an awareness update), or a socket announcing a fifth awareness client |
| `4503` | Authorization unavailable |

Every frame is decoded without throwing: one no decoder accepts closes only its own socket, and nothing a frame does can end the process, which under singleVM is the whole API.

### Presence

Awareness frames (cursors and selections, with the name and colour shown next to them) are relayed per client id, at most two a second per socket. A socket announces only its own clients: an id no socket holds, or one another socket of the same user holds (a reconnect takes its client over), up to four per socket, and a fifth closes it with 4400. An entry for a client another user's socket holds is dropped, so no one can move or remove someone else's cursor. A removal takes no client, since y-websocket re-sends every change it applies, including the removal of each peer it timed out. A frame with more than eight entries is dropped whole. The entries relayed go to every socket of the document, the sender's own included: y-websocket closes a socket that received nothing for 30 seconds, and its client renews its own presence every 15, so the copy it gets back keeps an editor alone on its document connected. When a socket leaves, the sockets that stay receive a removal of each client it held, a null state one clock past the last one relayed, so its cursor goes at once and not after y-protocols' 30-second timeout; a client another socket of the same user took over stays.

What the relay does not check is the state an entry carries. The name and colour are whatever the client sends, so a user can label their own cursor with anyone's name. Presence is cosmetic and proves nothing about who edits: each logged update carries the user its token names, and materialization credits editors from that log.

## Session lifecycle

### Storage

Two tables, both under the same tenant-scoped RLS policies:

| Table | Holds |
| --- | --- |
| `yjs_documents` | One row per document: the compacted base state, seeded from the entity's description on the first connect and replaced on compaction, with the generation of its seed. The row outlives the session, so it holds one merged state per collaboratively edited entity, about the size of its description's Yjs encoding. |
| `yjs_updates` | An append-only log of received updates, one row per frame in arrival order, with the sending user; the window not compacted yet. |

The document as the relay knows it is the base plus every logged update, merged in one call when it is read. Nothing merged is ever held in memory across an await, so concurrent frames cannot overwrite each other.

### Seeding and generations

When no document row exists, the relay loads the entity's `description` with the same schema introspection as `permissions.ts`, converts the blocks to the `document-store` Yjs fragment, and inserts that state as the base under a new generation. Seeding runs under a per-document lock, so concurrent first connections converge on one seed. Seeding writes no log row, so opening an untouched document never updates the entity.

Two seeds of one description are two Yjs histories: a client document that survived a session (an editor open while offline, a socket closed at token expiry, a relay restart) and met a reseed would merge into a second top-level block group, of which the editor shows one. So the row is kept across sessions and retired only when its history is void: the backend deletes both tables' rows, in the writing transaction, when a description is written by anything but the relay (a REST update; the yjs module's `<type>.updated` handler, skipping the relay's own writes, which carry `materialized`) and when the entity is deleted (`<type>.deleted`), through `retireYjsDocuments`. A module that dispatches neither event calls it itself. A session whose document was retired ends at its next live stamp, compaction, handshake or update: its sockets close with `1013` and reconnect into a fresh session, which reseeds. Every log row belongs to one generation: `appendUpdate` inserts only while the document row of the session's generation exists, holding it under a key-share lock, and the retire deletes the document row before the log, so an update sent after a retire is never logged and a reseed never merges one. `compactState` writes only the generation it read.

### Handshake

The relay first tells the client the document's generation (its own message type `4`, a string after the type), then answers the client's Step1 with the diff of the merged document, followed by the relay's own Step1 carrying the merged state vector. y-websocket answers a Step1 with a Step2 on its own, so content the client holds and the relay never received (a frame lost on a bad connection, an edit made while reconnecting) is uploaded and logged like any update. An update the socket sends between the relay's Step1 and that reply is dropped: the reply carries it. After each Step2 or update it handled, the relay sends that socket alone a `Saved` frame (its own message type `5`, with no body), in the order the frames arrived: the update was logged, carried nothing, or was dropped for the reply that carries it. A Step1 gets none. A frame the relay refuses or could not log gets none either, and closes its socket (`4400`, `1013`, or `1011` when handling it failed), so a client that counts the Step2 and update frames it sent on a socket against the `Saved` frames it received there knows when the relay holds all its edits. A client whose document is of another generation than announced drops it before it merges or replies, connects afresh, and tells the user when the dropped document held edits the relay had not saved. The client also watches `store.pendingStructs`: structs parked for two seconds on a missing dependency trigger a fresh Step1 on the open socket, which the relay answers like a handshake's, with a ten-second cooldown.

### Ordering, append, broadcast, compaction

Sync frames from one socket run one at a time in arrival order through a serial queue whose first task is the socket's entity verification and join; a burst of keystrokes can never interleave. Each update is appended to `yjs_updates` before it is broadcast to peers, so peers only ever see durable content. An update Yjs cannot decode is never logged or relayed: its socket closes with 4400.

Three seconds after the last received update, and at most ten seconds after the first one since the last compaction started, the log is compacted, under the document lock: base and log are merged, the merged blocks are sent to `/internal/yjs/materialize` on the backend's internal listener with the window's editors, newest first, and on success the base is replaced and exactly the rows that were read are deleted. A row appended during the write survives for the next round. The backend takes the tenant and organization from the entity row, refusing a body that names another, sanitizes media URLs and hands the document to the entity's registered materializer, which runs the normal update operation and its permission check as the newest editor who may still update the entity. The template registers the attachment update op; an app registers one per collaborative product through `defineBackendModule({ yjsMaterializer })`, and materialization returns `400` for a product without one. Only a written window folds into the base, so the base holds only written state and the log every edit the entity has not received.

| Result | Behavior |
| --- | --- |
| `2xx` | Compact: replace the base, delete the merged rows |
| `410` | Gone: the entity no longer exists. Cleanup and sweep delete the document's rows |
| `401`, `403`, `404`, `408`, `409`, `429`, `5xx` or network failure | Retry: the secret or the editors' access can change. Keep the log; the next window, cleanup or sweep retries |
| Other `4xx` | Permanent: an invalid request or no materializer registered. Keep the log; cleanup keeps it without retrying |
| Unparseable merged state | Permanent, never posted. Keep the log |
| No document row (retired) | Never posted: the rows extend a history the next seed does not share, and merged alone they are a partial document. The log is discarded and the session ends with `1013` |
| A log row no merge accepts | Discarded before the window is merged, with its sender logged, so it never blocks the document; a joining client gets the rest |

### Disconnect and recovery

After the last client disconnects, the session stays warm for five minutes (a reconnect reuses it). Then cleanup compacts once more, which deletes the log rows it wrote, and forgets the session; the document row stays, so a client whose document survived merges into the same history when it returns, and the row goes only with the entity (`410`). A retryable failure reschedules cleanup, for up to an hour; after that, and after a permanent failure, the log stays for the next session or the startup sweep. A client that joins while cleanup runs keeps the session; one that leaves again first hands over to the cleanup its own leave starts, so what it sent is compacted too. A session leaves memory with no timer left on it, so no later cleanup can reach a newer session of the same document.

A startup sweep writes the logs a crash left behind through the same locked routine: documents with an uncompacted log whose row no session stamped within the grace period, with no younger log row; a document at rest, with nothing logged, is not visited. A session stamps its row when it opens and every minute while it lasts, so a relay generation started next to a running one, as a start-first rollout does, never takes that one's idle sessions for orphans. A client that joins while the sweep writes a document waits for the document lock and keeps the session. Because every update was logged before it was broadcast, a crash loses nothing that a client had sent.

## Durability and failure

Clients need no final flush: an update is durable before peers see it.

| Failure | Outcome |
| --- | --- |
| A client loses its connection | The client keeps editing in memory and reconnects with backoff after any close but a final one. Everything it sent is logged; the next handshake uploads what it had not. A document holding edits the relay has not confirmed is never destroyed: it outlives its editor until the relay saved them, and the tab asks before it unloads. |
| The relay ends a session for good (`4003`, `4400`, a frame too big, or five different tokens refused with no sync between them) | The client stops reconnecting and its editor turns read-only with a notice, so nothing is typed that could not be saved. An expired token refused again, while no refetch reaches the API, does not count: the client keeps reconnecting with backoff and syncs once a fresh token arrives |
| The backend is unavailable | Materialization is retried on the next window, at cleanup, or by the sweep; the log stays until the backend recovers |
| The relay restarts | Clients reconnect with complete documents into the same history, since the document row outlived the session. The startup sweep writes the logs the crash left. |
| Access revoked | The socket closes when its token expires and cannot reconnect. Materialization credits the newest editor who may still update the entity; when none may, it is refused and retried, and the log stays until a write succeeds. |
| Entity deleted | Its deletion retires the document; a session that outlives it gets `410` from materialization and deletes the rows at cleanup or by the sweep. Cleanup does not resurrect the entity. |
| Description written outside the relay | The write retires the document. Open sessions end with `1013` within a minute, sooner when someone types; clients reconnect, are told the new generation, drop their document, and show the written description, with a notice when they held edits. Edits logged after the write are discarded. |
| SSE arrives during editing | The cache takes a Yjs-owned field only from a server write of it, which carries a new `stx.fieldTimestamps` stamp. A read that lags the relay keeps the cached value, in every view |

## Operational constraints

- **Live collaboration is process-local.** Clients editing one entity must reach the same relay instance (single instance or entity-affinity routing). Two relays holding one document share its log but not each other's live updates, and two compactions that overlap can each fold a different window, the later base write dropping rows the earlier one merged. A start-first rollout is safe: live sessions stamp their row, and the new relay's sweep visits only documents no session holds.
- **No server-side edit history**: the base holds a merged snapshot and the log only what is not compacted yet. Undo, redo, and per-edit history live in clients.
- **Fragment and schema must stay aligned.** The `document-store` fragment and React-free shared BlockNote schema must match the frontend binding (custom blocks have round-trip tests).
- **Seeds are server-generated and never merged.** A reseed is a new generation, and a client never merges two.
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
| `YJS_DB_POOL_MAX` | PostgreSQL pool size, default 10 |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODB` | In-memory connection limiter and no TLS CA requirement. Database reads still open lazily. |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging. `DEBUG` also prints every query, with its values, in the `development` app mode only |

The backend counterpart in `backend/src/modules/yjs/` issues tokens, serves `/internal/yjs/materialize` on the internal listener only (the public API has no path to it), sanitizes media URLs, and indexes the materializers modules register.
