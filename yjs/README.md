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

The backend counterpart in `backend/src/modules/yjs/` issues tokens, serves `/internal/yjs/materialize` on the internal listener only (the public API has no path to it), sanitizes media URLs, and indexes the materializers modules register. The relay itself is `yjs/src/`, and the editor's side of the protocol is `frontend/src/modules/common/blocknote/`. Limits, timings and protocol details are documented there, at their declarations.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Document** | The collaborative state of one entity's description, kept as long as the entity exists. |
| **Base** | The part of a document the entity row already holds, as one merged state (`yjs_documents`). |
| **Log** | The updates not yet folded into the base, in arrival order, each with its sender (`yjs_updates`). Base plus log is the document. |
| **Seed** | Creating a document from the stored description. The server does it, never a client. |
| **Generation** | The identity of one seed. Two seeds of one description are two Yjs histories that cannot be merged, so a client drops a document of another generation. |
| **Session** | What a relay keeps in memory for a document with connected editors. |
| **Materialization** | Writing the merged document to the entity row, as an ordinary update through the backend. |
| **Compaction** | Folding the log into the base, once the entity row holds it. |
| **Outside write** | A description written by anything but the relay: a REST update, an MCP tool, an import. |
| **Retirement** | Deleting a document because its entity was deleted. |

## Who may edit

Editing needs a token. The backend issues one for a single entity, valid for five minutes, to a user who may update that entity. The relay holds only the public half of the signing key: it can verify a token and cannot mint one.

A valid token opens the socket, and then the relay decides for itself. It reads the entity row and the user's memberships in one RLS-scoped transaction and asks the shared permission engine whether this user may update this row, as the API would, with no call to the backend. Until that answer is in, the socket's frames wait: it receives nothing of the document and relays nothing. A refusal never tells someone without access whether the entity exists.

A document's tenant and organization come from the entity row, never from a token or from whoever joined first. Seeding, logging, compaction and materialization run in that scope as the system, with no user context.

A socket lives no longer than its token. The client refreshes its token and reconnects, and a user who lost access gets no new one, so revoked access ends an open editing session within five minutes.

### Presence

Cursors and selections are relayed between the editors of a document, rate-limited per socket. A socket can announce only its own cursors, so nobody can move or remove someone else's, and when a socket leaves its cursor disappears for the others at once.

Presence is cosmetic. The name and colour next to a cursor are whatever the client sends, so they prove nothing about who edits. Authorship comes from the log: every update is stored under the user its token names, and materialization credits editors from there.

## Session lifecycle

### Seed

The first time a description is opened for editing, over the socket or over HTTP, the server seeds its document from the stored description under a new generation. Concurrent first connections end up with the same seed. Seeding writes nothing to the log, so opening an untouched description never updates the entity.

### Edit

When a socket connects, relay and client exchange what the other lacks, so edits made while disconnected are uploaded like any other. From then on the relay handles a socket's updates one at a time, in the order they arrived. Each update is appended to the log before it is sent to the other editors: peers only ever see durable content, and a client needs no final flush. The relay confirms every update it saved to the socket that sent it, so a client knows when the relay holds all its edits.

### Save

A few seconds after the last update, and at least every ten seconds while typing goes on, the relay merges base and log and sends the result to the backend's materialize route, with the editors of that window. The backend hands it to the entity's materializer, which runs the normal update operation and its permission check as the newest of those editors who may still update the entity. From there the saved row reaches everyone else like any other change ([Sync engine](../cella/SYNC_ENGINE.md)).

The relay compacts a window only once the entity row holds it. The base therefore holds only written state, and the log holds every edit the entity has not received yet. When the backend is away, or refuses for a reason that can change, the log stays and the next window retries.

The template registers the attachment update operation as its materializer. An app registers one per collaborative product through `defineBackendModule({ yjsMaterializer })`, and only a product with a materializer persists collaborative content.

### Outside writes

A description written by anything but the relay does not end live sessions. The backend turns the written blocks into an update to the document and appends it to the log, in the same transaction as the write. Editors receive it as a remote change, in place, and keep typing.

### Deletion

A document is retired only together with its entity. Open sessions end at once, and the editor shows the entity as deleted. Because two seeds cannot be merged, a document otherwise outlives its sessions, relay restarts and offline editors: a client that returns merges into the same history.

### Other writers

The relay is not the only one that appends to a log: outside writes, updates posted over HTTP and, during a rollout, a second relay do too. Each relay listens for Postgres notifications of those appends and passes the new rows on to its editors. A notification can be missed, so every session also checks the log when a socket connects, before it compacts and once a minute. A missed notification costs at most a minute.

### Over HTTP

A client that reaches the API but not the relay keeps working through the API's pull and push routes, which authorize as the token route does. A push is appended to the same log, and live sessions receive it like any other append. A document edited over HTTP alone, with no session on a relay, is written to its entity by the sweep, 5 to 10 minutes after the last push.

### Leave

After its last editor disconnects, a session stays warm for five minutes, so a reconnect reuses it. Then it saves and compacts once more and is forgotten. The document stays.

A sweep, at boot and every five minutes, saves the logs no session holds: those a crash left behind and those posted over HTTP. Since every update was logged before it was broadcast, a crash loses nothing a client had sent.

## Durability and failure

| What happens | Outcome |
| --- | --- |
| A client loses its connection | It keeps editing and reconnects with backoff. The next connection uploads what the relay lacks. A document with unconfirmed edits is never thrown away, and the tab asks before it unloads. |
| The client is offline | A document the user opened for editing is stored per user ([Client](../cella/CLIENT.md#the-per-user-database)), so it opens from storage and stays editable. One never opened is read-only. An edit no server has confirmed stays stored until one does. |
| The relay is out of reach, the API is not | The editor continues [over HTTP](#over-http) and switches back once the socket works again. |
| The relay ends a session for good | The client stops reconnecting and the editor turns read-only with a notice. Edits that can no longer be saved are offered to copy before they are discarded. |
| The backend is unavailable | Materialization is retried at the next window, when the session ends or by the sweep. The log stays until it succeeds. |
| The relay restarts | Clients reconnect with complete documents into the same history. The sweep at boot saves the logs the crash left. |
| Access revoked | The socket closes when its token expires and cannot reconnect. A pending save is credited to the newest editor who may still update the entity. When none may, the log stays until a write succeeds. |
| Entity deleted | Its document is retired: sessions end at once and each client stops, offering the edits it never saved to copy. |
| Description written outside the relay | Editors receive the write in place, with no reconnect. It overrides earlier edits where it differs. Concurrent edits in blocks it keeps survive, and text typed into a block it removes is lost with the block. |
| The notification listener drops | It reconnects with backoff and every session catches up. Meanwhile outside writes reach editors within a minute, and health reports `degraded`. |
| A live update arrives during editing | A read that lags the relay cannot undo what the editor shows: [Sync engine](../cella/SYNC_ENGINE.md#yjs). |

## Operational constraints

- **One relay per document is the normal case.** Two relays holding one document, as in a start-first rollout, stay correct: they share the log and pass on each other's appends, a little later than peers on one relay see them.
- **No server-side edit history.** The base is one merged state. Undo, redo and per-edit history live in clients.
- **Fragment and schema must stay aligned.** The `document-store` fragment and the React-free shared BlockNote schema must match the frontend binding. Custom blocks have round-trip tests.
- **Materialization is eventual.** The entity row lags the live document by at most ten seconds while someone types, plus any retry delay.

## Reference

### Close codes

| Close code | Meaning |
| --- | --- |
| `1011` | The relay could not handle a frame, or too many arrived before authorization. The client reconnects. |
| `1013` | The session ended: its entity was deleted, or its document was seeded anew. The client reconnects, and a deleted entity's reconnect gets `4410`. |
| `4001` | Invalid or expired token. The client refreshes it and reconnects. |
| `4003` | Entity access denied. Final. |
| `4400` | An invalid entity scope, a frame the relay cannot decode, or a socket announcing more cursors than it may hold. Final. |
| `4410` | Entity deleted. Final: the client stops. |
| `4503` | Authorization unavailable |

A request refused before the socket opens (malformed, a token for another document, rate-limited) fails as an HTTP error, which a browser sees as close code `1006`.
