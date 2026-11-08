# Yjs worker

This document covers the Yjs worker: a WebSocket relay for real-time collaborative editing of BlockNote descriptions. It assumes you know [Yjs](https://docs.yjs.dev).

### TL;DR

During collaborative editing, the Yjs service saves the shared editing state. It starts each
session from the stored description, sends edits to connected clients, and turns the merged result
into normal stored entity data through the backend. A description written through the API ends nobody's editing
session: it joins the live document.

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

Edits reach peers as soon as they are durable. Now and then the backend writes the merged description through its normal update pipeline ([Save](#save)). The same write carries whatever the entity's registered materializer derives.

The backend counterpart in `backend/src/modules/yjs/` issues tokens, serves the materialize route on its internal listener only, sanitizes media URLs, and indexes the materializers modules register. The relay itself is `yjs/src/`, and the editor's side of the protocol is `frontend/src/modules/common/blocknote/`.

The socket speaks the sync and awareness framing of y-protocols plus two message types of the relay's own: a document's seed generation and the confirmation of a saved update. Their numbers stay clear of those y-websocket uses. A stock y-websocket client syncs, but skips the generation check and reports every confirmation as a message it cannot read.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Document** | The collaborative state of one entity's description, kept as long as the entity exists. |
| **Base** | The part of a document the entity row already holds, as one merged state (`yjs_documents`). |
| **Log** | The updates not yet folded into the base, in arrival order, each with its sender (`yjs_updates`). Base plus log is the document. |
| **Seed** | Creating a document from the stored description. The server does it, never a client. |
| **Seed generation** | The identity of one seed. A client drops a document of another seed generation, since two seeds are two histories. |
| **Collab session** | What a relay keeps in memory for a document with connected editors. |
| **Materialization** | Writing the merged document to the entity row, as an ordinary update through the backend. |
| **Compaction** | Folding the log into the base, once the entity row holds it. |
| **Retirement** | Deleting a document because its entity was deleted. |

## Who may edit

Editing needs a token. The backend issues one per entity, for five minutes, to a user who may update it. A valid token opens the socket. The relay then asks the permission engine itself whether this user may update this row. A socket lives no longer than its token, so the client refreshes and reconnects.

- **No minting on the relay.** It holds only the public half of the signing key.
- **One origin.** A page on another origin than the app's cannot open a socket.
- **No existence leak.** A refusal tells nobody whether the entity exists.
- **Scope from the row.** The document's tenant and organization come from the entity row, never from the token.
- **Five-minute bound.** The editing session of a user who lost access or signed out ends within five minutes: they get no new token.

### Presence

Presence is cosmetic. The relay passes on a cursor only when its colour is a hex colour and its name is short text. Every peer's editor turns a cursor's colour into CSS.

Within that, the name and colour prove nothing about who edits: they are whatever the client sends. Every update is logged under the user its token names. A save credits one editor per window: the newest who may still update the entity.

Nobody moves or removes someone else's cursors, since a socket announces only its own. A socket's cursors leave with it.

## Collab session lifecycle

### Seed

The first time a description is opened for editing, over the socket or over HTTP, the server seeds its document from the stored description under a new seed generation. Concurrent first connections end up with the same seed. Opening an untouched description never updates the entity, since seeding writes nothing to the log.

### Edit

On connect, edits made while disconnected upload like any other.

From then on the relay handles a socket's updates one at a time, in arrival order. Peers only ever see durable content, and a client needs no final flush. Each update is appended to the log before it is sent to the other editors.

A client knows when the relay holds all its edits: the relay confirms every saved update to its sender.

### Save

After a pause in typing, the relay merges base and log and sends the result to the backend with the editors of that window. It also does so periodically while typing goes on.

The backend hands it to the entity's materializer, which runs the normal update operation and its permission check as the newest of those editors who may still update the entity. From there the saved row reaches everyone else like any other change ([Sync engine](../cella/SYNC_ENGINE.md)).

The template registers the attachment update operation as its materializer. An app registers one per collaborative product through `defineBackendModule({ yjsMaterializer })`, and only a product with a materializer persists collaborative content.

The log holds every edit the entity has not received yet: the relay compacts a window only once the entity row holds it. A sentence removed from a description does not stay in the stored document. Compaction drops the text of what was deleted and keeps only its length.

### Outside writes

A description written by anything but the relay (a REST update, an MCP tool, an import) does not end live collab sessions. The backend turns the written blocks into an update to the document and appends it to the log, in the same transaction as the write.

### Deletion

A document is retired only together with its entity. A client that returns merges into the same history: the document outlives its collab sessions, relay restarts and offline editors.

### Other writers

Three other writers append to the log: outside writes, updates posted over HTTP and a second relay during a rollout. Each relay listens for Postgres notices of those appends and passes the new rows on to its editors. Every collab session also checks the log when a socket connects, before it compacts and periodically, since a notice can be missed.

### Over HTTP

A client that reaches the API but not the relay keeps working through the API's pull and push routes. They authorize as the token route does. A push is appended to the same log, and live collab sessions receive it like any other append.

### Leave

After its last editor disconnects, a collab session stays warm for a while, so a reconnect reuses it. Then it saves and compacts once more and is forgotten. The document stays.

A sweep, at boot and periodically, saves the logs no collab session holds: those a crash left behind, those a session's last save could not write, and those posted over HTTP. Since every update was logged before it was broadcast, a crash loses nothing a client had sent.

## Durability and failure

| What happens | Outcome |
| --- | --- |
| A client loses its connection | It keeps editing and reconnects with backoff. A document with unconfirmed edits is never thrown away, and the tab asks before it unloads while no per-user database keeps them. |
| The client is offline | A document the user opened for editing is stored per user and stays editable, its unconfirmed edits included. One never opened is read-only. |
| The relay is out of reach, the API is not | The editor continues [over HTTP](#over-http) and switches back once the socket works again. |
| The relay ends a session for good | The client stops reconnecting and the editor turns read-only with a notice. Edits that can no longer be saved are offered to copy before they are discarded. |
| The backend is unavailable, or refuses the write | The log stays, and materialization is retried at the next window, when the collab session ends and then by every sweep. |
| The relay restarts | Clients reconnect into the same history, and the sweep at boot saves what the crash left. |
| Access revoked | The socket closes when its token expires and cannot reconnect. When no editor of a pending save may still update the entity, the log stays until a write succeeds. |
| Entity deleted | Its document is retired: collab sessions end at once and each client stops, offering the edits it never saved to copy. |
| Description written outside the relay | It overrides earlier edits where it differs. Concurrent edits in blocks it keeps survive, and text typed into a block it removes is lost with the block. |
| The notice listener drops | It reconnects with backoff, every collab session catches up, and health reports `degraded` meanwhile. |
| A live update arrives during editing | A read that lags the relay cannot undo what the editor shows. |

## Operational constraints

- **One relay per document is the normal case.** During a rollout two relays serve one document. They stay correct because they share the log.
- **No server-side edit history.** The base is one merged state. Undo, redo and per-edit history live in clients.
- **Schema must stay aligned.** The shared BlockNote schema must match the frontend binding. The round-trip tests catch a mismatch.
- **Materialization is eventual.** The entity row lags the live document by at most ten seconds while someone types, plus any retry delay.
