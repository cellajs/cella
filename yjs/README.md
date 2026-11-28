# Yjs relay

This document explains how the Yjs relay lets people edit [BlockNote](https://www.blocknotejs.org) descriptions together with [Yjs](https://docs.yjs.dev): who may edit, how a document is seeded and saved, and what survives a failure.

### TL;DR

People edit a description together, live, and every edit is stored before anyone else sees it. The Yjs relay starts each document from the stored description, passes edits between the editors and has the backend save the merged result as an ordinary update of the entity. A description written through the API ends nobody's editing session: it joins the live document.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Document** | The collaborative state of one entity's description, kept as long as the entity exists. |
| **Base** | The part of a document the entity row already holds, as one merged state (`yjs_documents`). |
| **Log** | The updates not yet folded into the base, in arrival order, each with its sender (`yjs_updates`). Base plus log is the document. |
| **Seed** | Creating a document from the stored description. The server does it, never a client. |
| **Seed generation** | The identity of one seed. A client drops a document of another seed generation, since two seeds are two histories. |
| **Collab session** | What a relay keeps in memory for a document with connected editors. |
| **Materialization** | Writing the merged document to the entity row through the entity's materializer, which runs its ordinary update operation in the backend. |
| **Compaction** | Folding the log into the base, once the entity row holds it. |
| **Outside write** | A description written by anything but the relay, such as a REST update. It joins the live document as an edit. |
| **Retirement** | Deleting a document because its entity was deleted. |

## How it fits

The relay sits between the editors and the backend. It keeps the live document of each description being edited, and the backend keeps the entity row the rest of the app reads. After a pause in typing, the backend writes the merged description through its normal update pipeline ([Save](#save)).

```text
BlockNote editors
        │  Yjs updates + awareness over WebSocket
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

The backend counterpart in `backend/src/modules/yjs/` issues tokens and serves the materialize route on its internal listener only. The relay itself is `yjs/src/`, and the editor's side of the protocol is `frontend/src/modules/common/blocknote/`.

The socket speaks the update and awareness messages of y-protocols plus two message types the relay adds: a document's seed generation and the confirmation of a saved update. A stock y-websocket client can edit, but it skips the generation check and reports every confirmation as a message it cannot read.

## Who may edit

Only users who may update an entity edit its description together, and both the backend and the relay check it. The backend issues a socket token per entity, for five minutes. A valid token opens the socket, and the relay then asks the permission engine itself whether this user may update this row. A socket lives no longer than its token, so the client refreshes and reconnects.

Four rules keep that safe:

- **No minting on the relay.** It holds only the public half of the signing key.
- **One origin.** A page on another origin than the app's cannot open a socket.
- **No existence leak.** A refusal tells nobody whether the entity exists.
- **Scope from the row.** The document's tenant and organization come from the entity row, never from the token.

Your module can close collaborative editing of a row its user may still update, such as a submission past its deadline, with `yjsEditable`. The token, pull and push routes then refuse that row as they refuse a user without edit rights, and the editor opens read-only.

### Presence

Presence shows each editor's cursor and name to the others. It is cosmetic, and three rules keep it so:

- **Checked shape.** The relay passes on a cursor only when its colour is a hex colour and its name is short text. Every peer's editor turns a cursor's colour into CSS.
- **No proof of identity.** The name and colour are whatever the client sends. Every update is logged under the user its token names.
- **Own cursors only.** A socket announces only its own cursors, and they leave with it. Nobody moves or removes someone else's.

## Document lifecycle

A collab session holds a document in a relay's memory while people edit it. The document itself lives as long as its entity.

### Seed

A document starts from the description the entity row holds. The first time a description is opened for editing, over the socket or over HTTP, the server seeds its document from it. Seeding writes nothing to the log: opening an untouched description never updates the entity.

A client can start editing offline, from a document it builds itself. A seed and its generation follow from the entity and its description alone: an offline client that never stored the document builds the same seed from its cached description and lets the user edit. Its next connection merges both as one history. When the server's document started from another description, the generations differ: the offline edits are kept apart and offered to copy.

A description the server cannot convert, such as one with a block type it does not know, is not opened: an empty document in its place would replace the description at the next save.

### Edit

Each update is appended to the log before it is sent to the other editors. Peers only ever see durable content, and a client needs no final flush. The relay confirms every saved update to its sender: a client knows when the relay holds all its edits. On connect, edits made while disconnected upload like any other.

### Save

Saving writes the live document to the entity row, where the rest of the app reads it. After a pause in typing, and periodically while typing goes on, the relay merges base and log. It sends the result to the backend with the editors since the last save.

The backend hands it to the entity's materializer, which runs the normal update operation and its permission check as the newest of those editors who may still update the entity. From there the saved row reaches everyone else like any other change ([Sync engine](../cella/docs/SYNC_ENGINE.md)).

To make a product's description collaborative, you register a materializer for it through `defineBackendModule({ yjsMaterializer })`. Only a product with a materializer persists collaborative content. The template registers the attachment update operation as its materializer.

The log holds every edit the entity has not received yet: the relay compacts a save's updates only once the entity row holds them. A sentence removed from a description does not stay in the stored document.

### Outside writes

A description written by anything but the relay (a REST update, an MCP tool, an import) does not end live collab sessions. The backend turns the written blocks into an update to the document and appends it to the log, in the same transaction as the write.

Say an MCP tool rewrites a description while two people type in it. Both keep typing, and the tool's text reaches their editors as one more edit.

### Over HTTP

A client that reaches the API but not the relay keeps working through the API's pull and push routes. They authorize as the token route does. A push is appended to the same log, and live collab sessions receive it like any other append.

### Leave

After its last editor disconnects, a collab session stays in memory for a while: a reconnect reuses it. Then it saves and compacts once more and is forgotten. The document stays. A sweep, at boot and periodically, saves the logs no collab session holds, such as those a crash left behind.

### Deletion

A document outlives its collab sessions, relay restarts and offline editors: a client that returns merges into the same history. It is retired only together with its entity.

## Durability and failure

A crash loses nothing a client had sent: every update is logged before it is passed on.

| What happens | What follows |
| --- | --- |
| A client loses its connection | It keeps editing and reconnects with backoff. A document with unconfirmed edits is never thrown away, and the tab asks before it unloads while no per-user database keeps them. |
| The client is offline | A document the user opened for editing is stored per user and stays editable, its unconfirmed edits included. One never stored here opens from the cached description, unless the entity's create is still queued. |
| The relay is out of reach, the API is not | The editor continues [over HTTP](#over-http) and switches back once the socket works again. |
| The relay ends a session for good | The client stops reconnecting and the editor turns read-only with a notice. Edits that can no longer be saved are offered to copy before they are discarded. |
| The backend is unavailable, or refuses the write | The log stays, and materialization is retried at the next save, when the collab session ends and then by every sweep. |
| The relay restarts | Clients reconnect into the same history, and the sweep at boot saves what the crash left. |
| Access revoked | The socket closes when its token expires and cannot reconnect. When no editor of a pending save may still update the entity, the log stays until a write succeeds. |
| Entity deleted | Its document is retired: collab sessions end at once and each client stops, offering the edits it never saved to copy. |
| Description written outside the relay | It overrides earlier edits where it differs. Concurrent edits in blocks it keeps survive, and text typed into a block it removes is lost with the block. |
| The notice listener drops | It reconnects with backoff, every collab session catches up, and health reports `degraded` meanwhile. |
| A live update arrives during editing | A read that lags the relay cannot undo what the editor shows. |

## Operational constraints

- **One relay per document is the normal case.** During a rollout two relays serve one document.
- **No server-side edit history.** The base is one merged state, which lets compaction drop deleted text for good. Undo, redo and per-edit history live in clients.
- **Schema must stay aligned.** When you change the shared BlockNote schema or the frontend binding, keep the two matched.
- **Materialization is eventual.** The entity row lags the live document by at most ten seconds while someone types, plus any retry delay. In return, the entity row takes one write per save, not one per keystroke.
