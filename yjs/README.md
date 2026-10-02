# Yjs worker

This document covers the Yjs worker: a WebSocket relay for **real-time collaborative editing of BlockNote descriptions**.

### TL;DR

During collaborative editing, the Yjs service saves the shared editing state. It starts each
session from the stored description, sends edits to connected clients, and turns the merged result
into normal stored entity data through the backend. A description written through the API joins the
live document as an update, so nobody's editing session ends. Other viewers receive the saved result
through the usual live-update system.

## How it fits

```text
BlockNote editors
        │  Yjs sync + awareness over WebSocket
        ▼
Yjs relay
  ├─ authorize connections and fan out live updates
  ├─ append every update to `yjs_updates`, compact into `yjs_documents`
  ├─ relay rows others appended (outside writes, other relays), woken by LISTEN
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

Entity authorization runs after the socket opens, via an RLS-scoped read of the entity row and the user's memberships by the shared permission engine (no backend round trip). It refuses a row in another tenant or organization than the token names, a draft the user did not author, and a row the user may not update, and otherwise returns the document's scope as the row states it. The read includes soft-deleted rows, so a deletion is told apart: a deleted row the user may update, or a missing one (the token proves the user could update it within five minutes), closes with `4410`. A deleted row the user may not update gets `4003`, like any refusal, so the code reveals nothing to someone without access. Sync frames wait in the socket's serial queue behind it, up to 100; one more closes the socket with `1011`, since the relay would owe it a `Saved` it never sends. A denied socket's queued frames never run. The socket joins the document's session only once authorized: until then it receives no peer frames, and it relays no awareness. Its latest awareness frame waits for the join, so a new editor's presence shows at once; a denied socket's is dropped. Sessions are keyed by tenant, entity type and id, and a session's scope is the row's, never a joiner's: seeding, logging, compaction and materialization act in it as the system. Frames that arrive while a socket closes are dropped; updates it sent before closing and that still wait in its queue are logged before it leaves the session, unless the session ended under it meanwhile: those belong to a generation its next handshake drops.

| Close code | Meaning |
| --- | --- |
| `1011` | Handling a frame failed in the relay, or more than 100 sync frames arrived before authorization; the client reconnects |
| `1013` | The socket's session ended: its entity was deleted, or its document was reseeded. The client reconnects and handshakes again; a deleted entity's reconnect gets `4410` |
| `4001` | Invalid or expired token, or the socket's token expired |
| `4003` | Entity access denied |
| `4410` | Entity deleted. Final: the client stops and drops edits it never saved |
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
| `yjs_documents` | One row per document: the compacted base state, seeded from the entity's description on the first connect or pull over HTTP, and replaced on compaction, with the generation of its seed. The row outlives the session, so it holds one merged state per collaboratively edited entity, about the size of its description's Yjs encoding. |
| `yjs_updates` | An append-only log of updates in arrival order, the window not compacted yet: one row per client frame, with the sending user, and one per outside write, with none (server-origin). |

The document as the relay knows it is the base plus every logged update, merged in one call when it is read. Base and log are one read: the document row is held `FOR SHARE` while the log is read, so a compaction on another relay never pairs an old base with a newer log. Nothing merged is ever held in memory across an await, so concurrent frames cannot overwrite each other. Every append, the relay's and the backend's, goes through `appendYjsUpdate` (`backend/src/modules/yjs/operations/append-yjs-update.ts`), and the read of base and log is the backend's `findYjsDocument` (`yjs-queries.ts`).

### Seeding and generations

When no document row exists, the first handshake seeds it in one transaction, through the backend's `seedYjsDocument`, as the API's first pull over HTTP does: it reads the entity's `description` `FOR SHARE`, converts the blocks to the `document-store` Yjs fragment with the headless BlockNote converter, inserts that state as the base under a new generation, and reads the row back. An outside write either commits first and is seeded, or waits for the seed and then finds the document row, into which it appends its update. A missing or empty description seeds one empty paragraph: from an empty fragment, two first writers would create two top-level block groups, of which the editor shows one. A description that does not convert is logged and seeds the same empty document. An entity with no live row seeds nothing, and the session ends. Seeding runs under a per-document lock, so concurrent first connections on one relay converge on one seed, and on several relays or the API the insert does. Seeding writes no log row, so opening an untouched document never updates the entity.

**Outside writes are updates.** A description written by anything but the relay (a REST update, an MCP tool, an import) does not end live sessions. The backend's `<type>.updated` handler diffs the written blocks into the document as committed and appends the result as a server-origin row, in the writing transaction. Live editors receive it as a remote change, in place, and keep editing; the generation stays.

**Retirement is for deletions only.** Two seeds of one description are two Yjs histories: a client document that survived a session (an editor open while offline, a socket closed at token expiry, a relay restart) and met a reseed would merge into a second block group. So the row is kept across sessions and retired only when its entity is deleted: the `<type>.deleted` handler deletes both tables' rows through `retireYjsDocuments` (`operations/retire-yjs-documents.ts`) and notifies, and the session ends at once with `1013`. The reconnect is closed with `4410`. A restore, which cella has none of, seeds a new generation from the row. Every log row belongs to one generation: `appendYjsUpdate` inserts only while the document row of the session's generation exists, holding it under a key-share lock, and the retire deletes the document row before the log, so an update sent after a retire is never logged. `compactState` writes only the generation it read.

### Wake-up

Each relay holds one dedicated connection, outside its pool, that listens on the `yjs_log` channel. A notice carries keys and log row ids only. The backend's appends (outside writes) and every retirement notify there in their own transaction: delivered at commit, never on rollback.

A relay's own appends notify nothing in their transaction. A notifying commit holds a cluster-wide lock through its WAL flush, so one per keystroke would make each append wait for the one before it, and under load the relay fell behind its typists. Once an append committed, the relay queues its row instead, and 50 ms after the first row of a batch it announces the batch in one statement of its own: one notice per document, with every row id it collected. One batch is in flight at a time: a notify that waits for the lock holds one pool connection, and rows queued meanwhile go in the next batch. A row whose append rolled back is never queued, and a batch whose send fails is logged and dropped, like a missed notification.

A session keeps the ids of the log rows its sockets hold: its own appends, counted before they commit, and every row it relayed or loaded into a handshake. On a notice holding any row it has not seen, the relay reads the session's log and broadcasts the rows it lacks, oldest first, to every socket, then schedules compaction. Every row of a notice counts, not just the newest, since rows of one batch can commit out of id order. A retirement ends the session. A notification can be missed, so the same catch-up runs at every handshake, before every compaction folds, at the live stamp when the newest log row is unseen, and for every session after the connection is replaced, which happens with a 1 to 30 second backoff. A missed notification thus costs at most a minute. Two relays holding one document (a start-first rollout) each relay the other's appends this way.

### Over HTTP

A client that reaches the API but not the relay syncs through `POST /{tenantId}/{organizationId}/yjs/pull` and `/yjs/push`, which authorize as the token route does. A pull answers the generation, what the caller's state vector lacks and the server's vector, seeding a document never opened. A push appends through `appendYjsUpdate` under its sender with no notification in its transaction, and its 200 is the client's `Saved`. Once it committed, one notification on `yjs_log` brings the row to live sessions as any append does; a missed one reaches them at the live stamp. A document no session holds is written by the sweep.

### Handshake

The relay first tells the client the document's generation (its own message type `4`, a string after the type), then answers the client's Step1 with the diff of the merged document, followed by the relay's own Step1 carrying the merged state vector. y-websocket answers a Step1 with a Step2 on its own, so content the client holds and the relay never received (a frame lost on a bad connection, an edit made while reconnecting) is uploaded and logged like any update. An update the socket sends between the relay's Step1 and that reply is dropped: the reply carries it. After each Step2 or update it handled, the relay sends that socket alone a `Saved` frame (its own message type `5`, with no body), in the order the frames arrived: the update was logged, carried nothing, or was dropped for the reply that carries it. A Step1 gets none. A frame the relay refuses or could not log gets none either, and closes its socket (`4400`, `1013`, or `1011` when handling it failed), so a client that counts the Step2 and update frames it sent on a socket against the `Saved` frames it received there knows when the relay holds all its edits. A client whose document is of another generation than announced drops it before it merges or replies, connects afresh, and tells the user when the dropped document held edits the relay had not saved. The client also watches `store.pendingStructs`: structs parked for two seconds on a missing dependency trigger a fresh Step1 on the open socket, which the relay answers like a handshake's, with a ten-second cooldown.

### Ordering, append, broadcast, compaction

Sync frames from one socket run one at a time in arrival order through a serial queue whose first task is the socket's entity verification and join; a burst of keystrokes can never interleave. Each update is appended to `yjs_updates` before it is broadcast to peers, so peers only ever see durable content. An update Yjs cannot decode is never logged or relayed: its socket closes with 4400.

Three seconds after the last received update, and at most ten seconds after the first one since the last compaction started, the log is compacted, under the document lock: base and log are merged, the merged blocks are sent to `/internal/yjs/materialize` on the backend's internal listener with the window's editors, newest first, and on success the base is replaced and exactly the rows that were read are deleted. A window of server-origin rows alone is not sent: its merge is the last outside write, which the entity row already holds, so it folds unsaved. A mixed window names its server rows in `serverRowIds` (`[]` for none, at most 10,000; more fold alone first). The backend answers `409` when the log holds a server row the window lacks, an outside write committed during the POST, which the stale merge would overwrite: a retry, and the next window holds it. The fold locks the document row and is rolled back when fewer of its rows are left than it merged, since another compaction (a second relay) took them. A row appended during the write survives for the next round. The backend takes the tenant and organization from the entity row, refusing a body that names another, sanitizes media URLs and hands the document to the entity's registered materializer, which runs the normal update operation and its permission check as the newest editor who may still update the entity. The template registers the attachment update op; an app registers one per collaborative product through `defineBackendModule({ yjsMaterializer })`, and materialization returns `400` for a product without one. Only a written window folds into the base, so the base holds only written state and the log every edit the entity has not received.

| Result | Behavior |
| --- | --- |
| `2xx` | Compact: replace the base, delete the merged rows |
| Server rows alone | Never posted: fold into the base unsaved |
| `410` | Gone: the entity no longer exists. Cleanup and sweep delete the document's rows |
| `401`, `403`, `404`, `408`, `409`, `429`, `5xx` or network failure | Retry: the secret or the editors' access can change, and a `409` names an outside write the merge lacks. Keep the log; the next window, cleanup or sweep retries |
| Other `4xx` | Permanent: an invalid request or no materializer registered. Keep the log; cleanup keeps it without retrying |
| Unparseable merged state | Permanent, never posted. Keep the log |
| No document row (retired), or another generation | Never posted: the retirement took the log too, and a reseeded document's log is the new session's. The session ends with `1013` |
| Another compaction folded the rows | Retry: the fold is rolled back, and the next window reads the base it wrote |
| A log row no merge accepts | Discarded before the window is merged, with its sender logged, so it never blocks the document; a joining client gets the rest |

### Disconnect and recovery

After the last client disconnects, the session stays warm for five minutes (a reconnect reuses it). Then cleanup compacts once more, which deletes the log rows it wrote, and forgets the session; the document row stays, so a client whose document survived merges into the same history when it returns, and the row goes only with the entity (`410`). A retryable failure reschedules cleanup, for up to an hour; after that, and after a permanent failure, the log stays for the next session or the sweep. A client that joins while cleanup runs keeps the session; one that leaves again first hands over to the cleanup its own leave starts, so what it sent is compacted too. A session leaves memory with no timer left on it, so no later cleanup can reach a newer session of the same document.

A sweep, at boot and every five minutes after, writes the logs no session holds through the same locked routine: those a crash left behind, and the rows clients posted over HTTP while they could not reach a relay. It visits documents with an uncompacted log whose row no session stamped within the grace period, with no younger log row, so a document edited over HTTP alone is written 5 to 10 minutes after its last post; a document at rest, with nothing logged, is not visited, and one with a session on this relay is left to it. One sweep runs at a time on a relay. A session stamps its row when it opens and every minute while it lasts, so a relay generation started next to a running one, as a start-first rollout does, never takes that one's idle sessions for orphans. A client that joins while the sweep writes a document waits for the document lock and keeps the session. Because every update was logged before it was broadcast, a crash loses nothing that a client had sent.

## Durability and failure

Clients need no final flush: an update is durable before peers see it.

| Failure | Outcome |
| --- | --- |
| A client loses its connection | The client keeps editing in memory and reconnects with backoff after any close but a final one. Everything it sent is logged; the next handshake uploads what it had not. A document holding edits the relay has not confirmed is never destroyed: it outlives its editor until the relay saved them, and the tab asks before it unloads. |
| The relay ends a session for good (`4003`, `4400`, a frame too big, or five different tokens refused with no sync between them) | The client stops reconnecting and its editor turns read-only with a notice, so nothing is typed that could not be saved. An expired token refused again, while no refetch reaches the API, does not count: the client keeps reconnecting with backoff and syncs once a fresh token arrives |
| The backend is unavailable | Materialization is retried on the next window, at cleanup, or by the sweep; the log stays until the backend recovers |
| The relay restarts | Clients reconnect with complete documents into the same history, since the document row outlived the session. The sweep at boot writes the logs the crash left. |
| Access revoked | The socket closes when its token expires and cannot reconnect. Materialization credits the newest editor who may still update the entity; when none may, it is refused and retried, and the log stays until a write succeeds. |
| Entity deleted | Its deletion retires the document and notifies: open sessions end at once with `1013`, and the reconnect is closed with `4410`. The client stops, and drops edits it never saved with a notice. A session that outlives a missed notification ends at its next live stamp, compaction, handshake or update. Cleanup does not resurrect the entity. |
| Description written outside the relay | The write becomes an update to the document, which live editors receive in place, with no reconnect and the same generation. Earlier edits are overridden where the write differs; edits made concurrently in blocks it keeps survive. Text typed into a block the write removes is lost with the block. |
| The log listener's connection drops | It is replaced with backoff, and every session catches up. Meanwhile outside writes reach live editors at the next live stamp, within a minute, and health reports `degraded`. |
| SSE arrives during editing | The cache takes a Yjs-owned field only from a server write of it, which carries a new `stx.fieldTimestamps` stamp. A read that lags the relay keeps the cached value, in every view |

## Operational constraints

- **Live collaboration is meant for one relay per document.** Two relays holding one document (a start-first rollout) share its log and relay each other's appends through the log channel, a batch and a database round trip later than peers on one relay. Overlapping compactions cannot drop rows: a fold whose rows another one took is rolled back. A start-first rollout is safe: live sessions stamp their row, and the new relay's sweep visits only documents no session holds.
- **No server-side edit history**: the base holds a merged snapshot and the log only what is not compacted yet. Undo, redo, and per-edit history live in clients.
- **Fragment and schema must stay aligned.** The `document-store` fragment and React-free shared BlockNote schema must match the frontend binding (custom blocks have round-trip tests).
- **Seeds are server-generated and never merged.** A reseed is a new generation, and a client never merges two.
- **RLS scope.** Storage reads and writes run under the document's tenant with no user context; authorization reads the row and memberships under the requesting user's. The sweep visits every tenant through its own tenant-scoped transaction, every five minutes: one small query per tenant, four tenants at a time.
- **Materialization is eventual**: the entity row lags the live document by at most ten seconds while someone types, plus any retry delay, and only product entities with a registered materializer persist collaborative content.

## Health and configuration

| Endpoint | Response |
| --- | --- |
| `GET /health` on `YJS_PORT` | 204 |
| `GET /health?depth=full` | JSON: version, uptime, connection, document, client, event-loop-lag data, and `listener` (`listening`, `connecting`, or `off` without a database). Degraded at 100 ms lag or while the listener reconnects, unhealthy at 1 second lag. |
| Any other path | 404 |

Environment, validated in `src/env.ts` (loads the backend's `.env`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | RLS-scoped reads, log appends and compaction writes, and the log listener's connection |
| `DATABASE_SSL_CA` | Base64 PEM CA for PostgreSQL TLS, required in production unless `NODB` |
| `YJS_TOKEN_PUBLIC_KEY` | Public half of the backend's `YJS_TOKEN_PRIVATE_KEY` (base64url Ed25519): verifies editor tokens, cannot sign one. `pnpm --filter backend yjs:public-key` prints it |
| `YJS_RELAY_SECRET` | Authenticates the relay on the backend's materialize route, minimum 16 characters |
| `BACKEND_INTERNAL_URL` | The backend's internal listener, default port `devPorts.internal` |
| `YJS_PORT` | WebSocket and health port, default 4002 (`devPorts.yjs`) |
| `YJS_DB_POOL_MAX` | PostgreSQL pool size, default 10. The log listener holds one more connection, outside the pool |
| `MAPLE_SECRET_INGEST_KEY` | Optional telemetry ingest key |
| `NODB` | In-memory connection limiter, no TLS CA requirement and no log listener. Database reads still open lazily. |
| `NODE_ENV`, `PINO_LOG_LEVEL`, `DEBUG` | Runtime mode and logging. `DEBUG` also prints every query, with its values, in the `development` app mode only |

The backend counterpart in `backend/src/modules/yjs/` issues tokens, serves `/internal/yjs/materialize` on the internal listener only (the public API has no path to it), sanitizes media URLs, and indexes the materializers modules register.
