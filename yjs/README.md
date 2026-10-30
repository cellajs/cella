# Yjs worker

This document covers the Yjs worker: a WebSocket relay for **real-time collaborative editing of BlockNote descriptions**.

### TL;DR

During collaborative editing, the Yjs service saves the shared editing state. It starts each
session from the stored description, sends edits to connected clients, and turns the merged result
into normal stored entity data through the backend. A description written through the API joins the
live document, so nobody's editing session ends.

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

Keystrokes merge at character level and reach peers as soon as they are durable. Now and then the backend writes the merged description, plus whatever the entity's registered materializer derives, through its normal update pipeline ([Save](#save)).

The backend counterpart in `backend/src/modules/yjs/` issues tokens, serves the materialize route on its internal listener only, sanitizes media URLs, and indexes the materializers modules register. The relay itself is `yjs/src/`, and the editor's side of the protocol is `frontend/src/modules/common/blocknote/`. Limits, timings, close codes and protocol details are documented there, at their declarations.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Document** | The collaborative state of one entity's description, kept as long as the entity exists. |
| **Base** | The part of a document the entity row already holds, as one merged state (`yjs_documents`). |
| **Log** | The updates not yet folded into the base, in arrival order, each with its sender (`yjs_updates`). Base plus log is the document. |
| **Seed** | Creating a document from the stored description. The server does it, never a client. |
| **Seed generation** | The identity of one seed. Two seeds of one description are two Yjs histories that cannot be merged, so a client drops a document of another seed generation. |
| **Collab session** | What a relay keeps in memory for a document with connected editors. |
| **Materialization** | Writing the merged document to the entity row, as an ordinary update through the backend. |
| **Compaction** | Folding the log into the base, once the entity row holds it. |
| **Retirement** | Deleting a document because its entity was deleted. |

## Who may edit

Editing needs a token. The backend issues one for a single entity, for a few minutes, to a user who may update that entity. The relay holds only the public half of the signing key: it can verify a token and cannot mint one.

A valid token opens the socket, and then the relay decides for itself: it asks the permission engine, as the API would, whether this user may update this row. Until that answer is in, the socket receives nothing of the document and relays nothing. A refusal never tells someone without access whether the entity exists. A document's tenant and organization come from the entity row, never from a token or from whoever joined first.

A socket lives no longer than its token. The client refreshes its token and reconnects, and a user who lost access gets no new one, so revoked access ends an open editing session within five minutes. The same bound holds when a session ends, by a sign-out, a revocation or a stopped impersonation: no new token is minted for it, and its open sockets and earlier tokens lapse.

### Presence

Cursors and selections are relayed between the editors of a document. A socket can announce only its own cursors, so nobody can move or remove someone else's, and a socket's cursors leave with it.

Presence is cosmetic. Every peer's editor turns a cursor's colour into CSS, so the relay passes on a cursor only when its colour is a hex colour and its name is short text; any other cursor reaches no peer. Within that, the name and colour are whatever the client sends, so they prove nothing about who edits. Every update is logged under the user its token names, and a save credits one editor per window: the newest who may still update the entity.

## Collab session lifecycle

### Seed

The first time a description is opened for editing, over the socket or over HTTP, the server seeds its document from the stored description under a new seed generation. Concurrent first connections end up with the same seed. Seeding writes nothing to the log, so opening an untouched description never updates the entity.

### Edit

When a socket connects, relay and client exchange what the other lacks, so edits made while disconnected are uploaded like any other.

From then on the relay handles a socket's updates one at a time, in arrival order. Each update is appended to the log before it is sent to the other editors, so peers only ever see durable content and a client needs no final flush. The relay confirms every saved update to its sender, so a client knows when the relay holds all its edits.

### Save

After a pause in typing, and periodically while it goes on, the relay merges base and log and sends the result to the backend with the editors of that window. The backend hands it to the entity's materializer, which runs the normal update operation and its permission check as the newest of those editors who may still update the entity. From there the saved row reaches everyone else like any other change ([Sync engine](../cella/SYNC_ENGINE.md)).

The relay compacts a window only once the entity row holds it, so the log holds every edit the entity has not received yet. Compaction also drops the text of what was deleted, keeping only its length, so a sentence removed from a description does not stay in the stored document.

The template registers the attachment update operation as its materializer. An app registers one per collaborative product through `defineBackendModule({ yjsMaterializer })`, and only a product with a materializer persists collaborative content.

### Outside writes

A description written by anything but the relay (a REST update, an MCP tool, an import) does not end live collab sessions. The backend turns the written blocks into an update to the document and appends it to the log, in the same transaction as the write. Editors receive it as a remote change, in place, and keep typing.

### Deletion

A document is retired only together with its entity. Because two seeds cannot be merged, a document otherwise outlives its collab sessions, relay restarts and offline editors: a client that returns merges into the same history.

### Other writers

Outside writes, updates posted over HTTP and, during a rollout, a second relay append to the log too. Each relay listens for Postgres notices of those appends and passes the new rows on to its editors. A notice can be missed, so every collab session also checks the log when a socket connects, before it compacts and periodically.

### Over HTTP

A client that reaches the API but not the relay keeps working through the API's pull and push routes, which authorize as the token route does. A push is appended to the same log, and live collab sessions receive it like any other append.

### Leave

After its last editor disconnects, a collab session stays warm for a while, so a reconnect reuses it. Then it saves and compacts once more and is forgotten. The document stays.

A sweep, at boot and periodically, saves the logs no collab session holds: those a crash left behind and those posted over HTTP. Since every update was logged before it was broadcast, a crash loses nothing a client had sent.

## Durability and failure

| What happens | Outcome |
| --- | --- |
| A client loses its connection | It keeps editing and reconnects with backoff. A document with unconfirmed edits is never thrown away, and the tab asks before it unloads. |
| The client is offline | A document the user opened for editing is stored per user and stays editable, its unconfirmed edits included. One never opened is read-only. |
| The relay is out of reach, the API is not | The editor continues [over HTTP](#over-http) and switches back once the socket works again. |
| The relay ends a session for good | The client stops reconnecting and the editor turns read-only with a notice. Edits that can no longer be saved are offered to copy before they are discarded. |
| The backend is unavailable, or refuses for a reason that can change | The log stays, and materialization is retried at the next window, when the collab session ends or by the sweep. |
| The relay restarts | Clients reconnect into the same history, and the sweep at boot saves what the crash left. |
| Access revoked | The socket closes when its token expires and cannot reconnect. When no editor of a pending save may still update the entity, the log stays until a write succeeds. |
| Entity deleted | Its document is retired: collab sessions end at once and each client stops, offering the edits it never saved to copy. |
| Description written outside the relay | It overrides earlier edits where it differs. Concurrent edits in blocks it keeps survive, and text typed into a block it removes is lost with the block. |
| The notice listener drops | It reconnects with backoff, every collab session catches up, and health reports `degraded` meanwhile. |
| A live update arrives during editing | A read that lags the relay cannot undo what the editor shows. |

## Operational constraints

- **One relay per document is the normal case.** Two relays holding one document, as in a start-first rollout, stay correct: they share the log and pass on each other's appends, a little later than peers on one relay see them.
- **No server-side edit history.** The base is one merged state. Undo, redo and per-edit history live in clients.
- **Fragment and schema must stay aligned.** The `document-store` fragment and the React-free shared BlockNote schema must match the frontend binding; the round-trip tests of the custom blocks fail on a mismatch.
- **Materialization is eventual.** The entity row lags the live document by at most ten seconds while someone types, plus any retry delay.
