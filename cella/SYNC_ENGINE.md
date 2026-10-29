# Sync engine

This document explains how product data, and the facts around it, stay current across clients online and offline.

### TL;DR

When data changes, the server announces it on a live stream and the client fetches it through the normal API, often from cache, then patches only the affected cached entries. The sync engine adds no second data model, storage or permission check. Product rows travel as **changes**; anything else a client must hear about, such as a new membership or an inbox item, travels as a **signal**.

## One edit, end to end

Renaming attachment `a42` in organization `org1`, with two tabs open:

```text
tab A ──PATCH──▶ API ──UPDATE──▶ Postgres
  ▲               │                 │ WAL ............... a change
  └── stored row ─┘                 ▼
                               CDC worker ............... records an activity,
                                    │                     a sequence position, counters
                                    │ socket ............ a message per audience
                                    ▼
                               API activityBus .......... an event
                                    │ who may read the row?
                                    ▼
tab B ◀────── SSE ─────────── change frame .............. ids, path, sequence range
  │
  └── GET ?afterSeq=6&untilSeq=7 ──▶ API ──▶ rows ──▶ tab B's cache
```

1. Tab A patches every cached query holding `a42` and sends the edit with its `stx`: an attempt ID and field timestamps. The API stores it and answers with the stored row.
2. Postgres commits. The CDC worker reads the change from the WAL in commit order, records an activity, stamps the row with `org1`'s next sequence position and moves the channel summaries.
3. It hands the API one message per audience. The API checks every subscriber of `org1` with the permission engine REST reads use, and sends the allowed ones a change frame without row data.
4. Tab A recognizes its own `stx` and patches only that. Tab B fetches the announced range through the list endpoint.

The diagram's labels are the edit's names: a **change** in the WAL and on the stream, an **activity** once recorded, a **message** between two processes, an **event** inside one. Reconnecting takes the same path: cursor `3` and frontier `7` become `afterSeq=3&untilSeq=7`.

## Changes and signals

The stream carries two kinds of frame. Both are announcements: what a frame points at, the client reads through REST.

| | Change | Signal |
| --- | --- | --- |
| About | A product row | A fact of a registered type, such as `membership.changed` |
| Made by | The CDC worker, from a committed row | API code after its commit, or the CDC worker from a tracked table |
| Sent to | Subscribers who may read the row | One user, or the readers of a subject |
| Missed while away | Catchup fetches the sequence gap | Catchup compares a **versioned** signal's version and runs its handler once; an **ephemeral** one is gone |

A signal is versioned when a client that was away must still find out, and then a committed row makes it. A module declares the signals it sends and the handlers that answer them.

## Selective sync

Only product rows sync: channels are containers, products are synced content. The template ships `organization -> attachment`. Apps add deeper hierarchies, drafts, embeddings and Yjs fields.

| Concept | Meaning |
| --- | --- |
| **Sequence** | One monotonic counter per organization, shared by all product entity types |
| **Path** | Root-first channel ID path of a row. A **subtree** (a channel and everything below it) is a path prefix. |
| **Home** | Deepest non-null channel ancestor of a product row, with organization as fallback |
| **Summary** | Frontier, counts and timestamps on a channel row, so one read answers for a subtree |
| **Frontier** | Newest sequence position in a summary. It only moves forward. |
| **View** | The subtrees and entity types a client tracks. Catchup authorizes and answers per view. |
| **Cursor** | Latest sequence position a view has ingested; the **stream cursor** is the last activity a connection received |
| **Range fetch** | Ordinary list request for the rows stamped between `afterSeq` and `untilSeq`, deleted rows included |
| **Tombstone** | Soft-deleted row as a range fetch returns it for the deleted-items period: its id, position and place, never its content, so absent clients learn the deletion |
| **`stx`** | Envelope on every product write: mutation ID, source ID and per-field HLC timestamps |

## Server

### Ordering

Commit order is sequence order, across product types, and a change delivered twice moves nothing. Changes go out per audience: the rows of one type under one path.

### Drafts

A product table that opts into drafts is published with a row filter, so sync sees a draft only once it is published: publishing arrives as a create, unpublishing as a delete.

### Moves

When an update moves a product to a path a subscriber can no longer read, that subscriber receives `moveOut` with the old path and drops the row, because no range fetch could return it. Subscribers who can read both locations receive a normal update.

### Detail cache

The server caches enriched product detail responses briefly. Every write of the row drops its entry, and every hit rechecks access. Lists bypass it.

## Access

**Row readability** decides whether a user may fetch a row. List reads, range fetches, change frames and detail-cache hits all ask the permission engine about full rows. A grant reaches down, never up: an elevated role reads the rows below its channel, any other role only the rows homed at it.

**Summary answerability** decides whether a user may see a view's frontiers and counts. Summaries reveal that activity exists, so they need stronger proof. Catchup gives each view one status:

| Status | Meaning | Client behavior |
| --- | --- | --- |
| `ok` | Every prefix is proven for the requested depth | Use frontiers, counts, and range fetches |
| `opaque` | Rows may be readable, but the summary is not fully proven | Reveal no numbers. Refetch cached active lists. |
| `forbidden` | User has no readable scope in the organization | Drop the view |

The client derives its views from the user's memberships and the policy matrix. Apps declare none by hand.

## Client

### Changes

A change frame announces one row or a range of rows to fetch and patch into the caches, a delete that only invalidates (no sync-visible row remains), or a move-out that drops the row at once. An echo of the tab's own write patches only `stx`.

### Catchup

Catchup runs on every connection before the stream goes live. The client posts its stream cursor and a view per organization the user belongs to, and gets each view's status, an `ok` view's frontier and count, and each organization's signal versions. A view behind its frontier hands the gap to the fetch prioritizer. A view without a cursor, as in a newly joined organization, takes the frontier as its baseline and refetches what it has cached there.

### SSE wire

Beside change and signal frames the stream sends a periodic `ping`, which also says whether a CDC worker is reading, and an `error` naming why the server ends it. The server rechecks each open stream's session once a minute. After a session ended for good the client waits for a visible tab and a healthy API; after any other end it reconnects. Frame shapes: [API reference](/docs/schemas).

### Fetch prioritization

An announced range is queued, not fetched at once. A viewed channel fetches immediately, a muted or archived one when it is opened, and any other in the background, spread over a window that grows with the organization's online audience.

Apps derive per-user state from `query/realtime/sync-events.ts`, never from queue logic. It announces every readable change, ids only, before any tier decision, and delivers each settled range's rows.

### Freshness

Synced product queries never go stale on their own while the stream is healthy: catchup owns their freshness. A failed stream, a delivery shortfall or an absent CDC worker lets them go stale with time until a clean catchup ([REST fallback](#rest-fallback)). Other queries keep the global stale time, infinite while offline.

### Unseen tracking

Unseen badges count delivered rows with the server's own predicate and are replaced by an exact server recount on staleness and after catchup, because seen marks from other devices never enter CDC. Only types every channel member may read are counted on the client; the others are counted by their endpoint.

## Embeddings

A product can reference other products through an id array column: the **host** row holds the ids, each referenced row is **embedded**. Declare the relationship in `appConfig.productEmbeddings`; the CDC worker, the stream and the client cache handle the rest. Host and embedded rows sync independently, and an embedded row's change patches its copies inside cached host rows. A host write keeps only the ids that name a live row of its organization.

The embedding's `lifecycle` decides what a deletion does:

- `shared` (default): embedded rows live on their own. When one is deleted, the CDC worker strips its id from the hosts.
- `owned`: the CDC worker also soft-deletes an embedded row once no live host references it.

The engine keeps no usage counts: derive one, such as the tasks with a label, on the client from the synced host rows. Count on the server where the hosts are not synced, or where a decision must not rest on what this viewer can read, such as deleting an unused label.

A side effect an embedding cannot express, such as seeding rows when a project is created, goes through the mutation bus of `defineBackendModule`.

## Writes

A product mutation patches the cache optimistically and reconciles with the stored row. Offline, an edit retries network errors only, then pauses in the persisted replay queue; an HTTP error settles at once. Paused edits replay after the first catchup attempt, or once the stream stops reconnecting. Online writes never wait.

### Merge metadata

Synced tables store the latest `stx` and a hybrid logical clock (HLC) timestamp per scalar field: deterministic last-writer-wins, not a causal clock. Array fields merge `{ add, remove }` deltas.

An online write is ordered by arrival: the server stamps it with a fresh server HLC, so a device clock that runs behind cannot lose an edit. A replayed offline write keeps its client timestamps, its intent time, so it loses to an edit made elsewhere while it was queued. Its losing fields are skipped and the server returns the stored row, never a conflict response.

### Paused writes

Paused mutations persist to IndexedDB and survive a reload, so their variables carry everything a replay needs, including the `stx` minted at intent time. Each tab keeps its own queue, and a tab that starts takes over the queue of a closed one. The attachment module is the reference.

A product's create, update and delete each carry one fixed shape, so the queue can reason about pending work: an edit folds into a still-queued create of its row, a remote change of a row with a pending mutation waits until it settles, and a refused delete puts its rows back.

A paused mutation can outlive the bundle that queued it. A lens converts an entity wire-shape change ([Schema evolution](./SCHEMA_EVOLUTION.md)), and a bundle that changes a mutation's own shape declares a version and an upgrade. A mutation no upgrade can read, and a replay the server refuses with a 4xx, go to the `failedSync` quarantine for export and are never replayed.

A replayed create is idempotent by its row ids. Update and delete have no such check.

## Resilience

The REST API and the database work whatever the CDC worker does: it records each change once, reads again whatever failed, and rebuilds its books when the WAL cannot help ([CDC worker](../cdc/README.md#failure-and-recovery)).

### REST fallback

Losing the stream costs live updates and nothing else: synced queries go stale with time, so lists refetch when opened. A stream counts as down when it errors, ends or falls silent. The client reconnects with backoff, and at once when the app is back online. The next catchup fetches what its cursors miss. A range fetch that keeps failing, or returns fewer rows than announced, is given up and its lists invalidated.

### What happens when

Missed frames are repaired by the client's own catchup. Clients refetch everything only when the books themselves were wrong.

| What happened | What a user sees | What repairs it | What is lost |
| --- | --- | --- | --- |
| A client's stream is down | The app works as a REST app; lists refetch when opened | Reconnect and catchup | Nothing |
| The worker is down or reading again | Other users' changes arrive late and in order; in a longer outage lists refetch when opened | The worker reads on from the slot | Nothing |
| The API restarts or loses a frame | Streams reconnect | Catchup fetches the gap and compares signal versions | Ephemeral signals, and mentions and push notifications of that moment |
| The books are wrong or emptied | Every client refetches once | A rebuild from the tables | Nothing |
| The slot is lost, or the database restored from a backup | Live updates stop until the worker has a new slot; then every client refetches once | A new slot and a rebuild | Activities and notifications of rows changed meanwhile; with a restore, everything after the backup |
| One change can never be processed | Live updates pause; then every client refetches once | The worker skips the backlog and rebuilds the books | Activities and notifications of that backlog |
| A device was away longer than the activity window | It refetches what it holds of each organization once | Catchup starts over | Nothing |

A rebuild starts a new sync generation, and the API ends every open stream. A client whose catchup answer carries a new generation resets its view cursors to the new frontiers and refetches its synced cache, the lists on screen first.

### Multiple tabs

One tab leads: it holds the stream, runs catchup and forwards what it receives to the other tabs, which apply it against their own cursors and cache. Another tab takes over when the leader closes.

### Yjs

The template collaborates on attachment descriptions through the Yjs relay (`services.yjs.enabled`). With it on, a description saves through the relay, never as a REST write, so it never enters the replay queue.

The cache takes a description, and the columns derived from it, only from a server write of that field, so a read that lags the relay cannot undo a collaborative patch.
