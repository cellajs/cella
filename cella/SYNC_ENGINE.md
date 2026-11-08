# Sync engine

This document explains how product data, and the facts around it, stay current across clients online and offline.

### TL;DR

When data changes, the server announces it on a live stream and the client fetches it through the normal API, then patches only the affected cached entries. The sync engine adds no second data model, storage or permission check. Product rows travel as **changes**; anything else a client must hear about, such as a new membership or an inbox item, travels as a **signal**.

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
tab B ◀────── SSE ─────────── change frame .............. rows with seq and write
  │
  └── GET ?afterSeq=6&untilSeq=7 ──▶ API ──▶ rows ──▶ tab B's cache
```

1. Tab A patches every cached query holding `a42` and sends the edit with its `stx`: an attempt ID and field timestamps. The API stores it and answers with the stored row.
2. Postgres commits. The CDC worker reads the change from the WAL in commit order, records an activity, stamps the row with `org1`'s next sequence position and moves the channel summaries.
3. It hands the API one message per audience, each row with the activity it was recorded as. The API checks every subscriber of `org1` with the permission engine REST reads use, and sends each allowed one a change frame of the rows it may read, without row data.
4. Tab A recognizes its own `stx` and patches only that. Tab B fetches the announced range through the list endpoint.

The diagram's labels are the edit's names: a **change** in the WAL and on the stream, an **activity** once recorded, a **message** between two processes, an **event** inside one. Reconnecting takes the same path: cursor `3` and frontier `7` become `afterSeq=3&untilSeq=7`.

## Changes and signals

The stream carries two kinds of frame. Both are announcements: what a frame points at, the client reads through REST.

| | Change | Signal |
| --- | --- | --- |
| About | A `product` row | A fact of a registered type, such as `membership.changed` or `channel.deleted` |
| Made by | The CDC worker, from a committed row | API code after its commit, or the CDC worker from a tracked table |
| Sent to | Subscribers who may read the row | One user, or the readers of a subject |
| Missed while away | Catchup fetches the sequence gap | Catchup compares a **versioned** signal's version and runs its handler once; an **ephemeral** one is gone |

A signal is versioned when a client that was away must still find out, and then a committed row makes it. Its live frame carries the version, so a client that heard every version since its last catchup does not run them again at the next one. A module declares the signals it sends and the handlers that answer them.

The rows below a deleted channel leave by cascade and get no change of their own, however many there are. The channel's delete sends `channel.deleted` to the channel's readers in their place: a client drops what it holds below the channel and marks the lists of every product type below a channel for a refetch. Missed while away, the signal names no channel, and only the marks remain.

## Selective sync

Only product rows sync: channels are containers, products are synced content. The template ships `organization -> attachment`. Apps add deeper hierarchies, drafts, embeddings and Yjs fields.

| Concept | Meaning |
| --- | --- |
| **Sequence** | One monotonic counter per organization, shared by all product entity types |
| **Path** | Root-first channel ID path of a row. A **subtree** (a channel and everything below it) is a path prefix. |
| **Home** | Deepest non-null channel ancestor of a product row, with organization as fallback |
| **Summary** | Counts and timestamps on a channel row, so one read answers for a subtree. The organization's row also holds the frontiers. |
| **Frontier** | Newest sequence position of a product type in an organization. It only moves forward. |
| **View** | An organization and a product type a client tracks. Catchup authorizes and answers per view. |
| **Cursor** | Latest sequence position a view has ingested |
| **Range fetch** | Ordinary list request for the rows stamped between `afterSeq` and `untilSeq`, deleted rows included |
| **Tombstone** | Soft-deleted row as a range fetch returns it for the deleted-items period: its id, position and place, never its content, so absent clients learn the deletion |
| **`stx`** | Envelope on every product write: mutation ID, source ID and per-field HLC timestamps |

## Server

### Ordering

Commit order is sequence order, across product types, and a change delivered twice moves nothing. Changes go out per audience: the rows of one type under one path.

### Drafts

Sync sees a draft only once it is published. Publishing arrives as a create, and unpublishing as a delete.

### Moves

When an update moves products to a path a subscriber can no longer read, that subscriber receives one `moveOut` of the rows it lost, under their old home channel when they share one, and drops them, because no range fetch could return them. Subscribers who can read both locations receive a normal update.

## Access

**Row readability** decides whether a user may fetch a row. List reads, detail reads, range fetches and change frames ask the permission engine about full rows. A grant reaches down, never up: an elevated role reads the rows below its channel, any other role only the rows homed at it.

**Summary answerability** decides whether a user may see a view's frontier. A frontier reveals that activity exists, so it needs stronger proof. Catchup gives each view one status:

| Status | Meaning | Client behavior |
| --- | --- | --- |
| `ok` | The user reads every row of the type in the organization | Use the frontier and range fetches |
| `opaque` | The user reads some rows: its grants reach part of the organization or carry a row condition | Reveal no numbers. Refetch the cached lists on screen and mark the others: every connection marks them again, so they refetch when opened and the background fill leaves them. |
| `forbidden` | User has no readable scope in the organization | Drop the view |

## Client

### Changes

A change frame names each changed row with its sequence position and the write that changed it. The client fetches created and updated rows and patches them into its caches. A delete only marks the row's lists for a refetch, since no row is left to fetch. A move-out drops the row at once. A frame past a size bound names its rows by id alone, and past a larger bound names none. The client then fetches the range or refetches the lists. An echo of the tab's own write fetches nothing, since the write's answer brings the stored row. A row is an echo only when it carries the tab's source id and names the signed-in user as its writer. The source id alone proves nothing, since anyone who reads the row can copy it.

### Catchup

Catchup runs on every connection before the stream goes live, and only after the persisted cache is restored, so a gap is fetched into the lists on disk. The client posts a view per product type of each organization the user belongs to, and gets each view's status, an `ok` view's frontier, and each organization's signal versions. A view behind its frontier hands the gap to the fetch prioritizer. A view without a cursor, as in a newly joined organization, takes the frontier as its baseline and refetches what it has cached there, unless nothing has changed there yet.

### SSE wire

Beside change and signal frames the stream sends a periodic `ping`, which also says whether a CDC worker is reading, and an `error` naming why the server ends it. The `ping` is a named event, not a comment line, so client code sees it, and every proxy on the way has to keep an idle stream open longer than the ping interval. No frame carries an `id` or a `retry`, so a reconnect sends no `Last-Event-ID`: the client resumes through catchup from its cursors, with a backoff of its own. The server rechecks each open stream's session once a minute, and a new stream's memberships once it registers: one that changed while the stream connected closes it, and the client reconnects with current access. After a session ended for good the client waits for a visible tab and a healthy API; after any other end it reconnects. A stream ended for good still answers 200 and closes after its `error` frame, never with a 204: the app's client stops at the frame, and a stock EventSource stops at the 401 its one reconnect gets. Frame shapes: [API reference](/docs/schemas).

### Fetch prioritization

An announced range is queued, not fetched at once. A viewed channel fetches immediately, a muted or archived one when it is opened, and any other in the background, spread over a window that grows with the organization's online audience.

Apps derive per-user state from `query/realtime/sync-events.ts`, never from queue logic. It announces every readable change, ids only, before any tier decision, and delivers each fetched range's rows. A frame past the id bound announces none: a create's or update's rows still arrive with its fetched range, and after a delete or a move-out the lists refetch.

### Freshness

Synced product queries never go stale on their own while the stream is healthy: catchup owns their freshness, also when the app comes back online. A failed stream or an absent CDC worker lets them go stale with time until the stream delivers again ([REST fallback](#rest-fallback)). Other queries keep the global stale time, infinite while offline.

A list the engine cannot patch whole, such as one a range overflowed or a filtered list a new row may belong to, carries a **refetch mark**: it refetches when it is opened or when the [background fill](./CLIENT.md#cold-start-to-live) reads it. The mark outlives later patches and a reload, and only that refetch clears it. A full read of a canonical list merges the range announced while it ran before it is cached.

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

A product mutation patches the cache optimistically and reconciles with the stored row. Offline, an edit retries network errors only, then pauses in the persisted replay queue. A request that gets no response, as on a link that drops packets, fails the same way once the API's health check goes unanswered too. An HTTP error settles at once, except a gateway's answer to a replay, as during a deploy: the replay stays queued and is sent again until the API answers. A queue restored after a reload or a sign-in replays after the first catchup attempt, or once the stream stops reconnecting; an edit paused in the open page resumes as soon as the app is back online or regains focus. The attachment module runs a tab's attachment writes one at a time, in order, so an online write waits behind a queued one, such as a restored queue that waits for the first catchup.

### Merge metadata

Synced tables store the latest `stx` and a hybrid logical clock (HLC) timestamp per scalar field: deterministic last-writer-wins, not a causal clock. Array fields merge `{ add, remove }` deltas.

An online write is ordered by arrival: the server stamps it with a fresh server HLC, so a device clock that runs behind cannot lose an edit. A replayed offline write keeps its client timestamps, its intent time, so it loses to an edit made elsewhere while it was queued. Its losing fields are skipped and the server returns the stored row, never a conflict response. A timestamp further ahead of the server's clock than a short bound moves no clock and loses to the next write of its field, so one request cannot outrank every later edit.

### Paused writes

Paused mutations persist to IndexedDB and survive a reload, so their variables carry everything a replay needs, including the `stx` minted at intent time. Each tab keeps its own queue, and a tab that starts takes over the queue of a closed one. The attachment module is the reference.

A product's create, update and delete each carry one fixed shape, so the queue can reason about pending work. An edit of a row whose create was never sent folds into that create. While a row has a pending mutation, remote changes and list reads leave the cached row alone. When a row's last pending mutation settles, the row the server stored replaces the cached one. A refused delete puts its rows back. A create that was attempted may have committed, so later edits and deletes of its row are sent after it.

A paused mutation can outlive the bundle that queued it. A lens converts an entity wire-shape change ([Schema evolution](./SCHEMA_EVOLUTION.md)), and a bundle that changes a mutation's own shape declares a version and an upgrade. A mutation no upgrade can read is dropped. A replay the server refuses with a 4xx rolls back and toasts, as a live edit does. A replay that meets a lost session stays queued for the same user's next sign-in.

A replayed create is idempotent by its row ids, and a replayed delete by its mutation id: the rows an earlier attempt of it deleted count as deleted, not refused. An update has no such check.

## Resilience

The REST API and the database work whatever the CDC worker does. The worker records each change once, reads again whatever failed, and rebuilds its books when the WAL cannot help ([CDC worker](../cdc/README.md#failure-and-recovery)).

### REST fallback

Losing the stream costs live updates and nothing else: synced queries go stale with time, so lists refetch when opened. A stream counts as down when it errors, ends or falls silent. The client reconnects with backoff, and at once when the app is back online. The next catchup fetches what its cursors miss. A range fetch that keeps failing, or returns fewer rows than announced, is given up and its lists marked for a full refetch.

### What happens when

Missed frames are repaired by the client's own catchup. Clients refetch everything only when the books themselves were wrong.

| What happened | What a user sees | What repairs it | What is lost |
| --- | --- | --- | --- |
| A client's stream is down | The app works as a REST app; lists refetch when opened | Reconnect and catchup | Nothing |
| The worker is down or reading again | Other users' changes arrive late and in order; in a longer outage lists refetch when opened | The worker reads on from the slot | Nothing |
| The API restarts, loses a frame or closes a stream its client stopped reading | Streams reconnect | Catchup fetches the gap and compares signal versions | Ephemeral signals, and mentions and push notifications of that moment |
| The books are wrong or emptied | Every client refetches once | A rebuild from the tables | Nothing |
| The slot is lost, or the database restored from a backup | Live updates stop until the worker has a new slot; then every client refetches once | A new slot and a rebuild | Activities and notifications of rows changed meanwhile; with a restore, everything after the backup |
| One change can never be processed | Live updates pause until a fix ships or the slot is dropped, by an operator or at the WAL bound; after a drop every client refetches once | A fix lets the worker read on; a dropped slot is made anew and the books rebuilt | Nothing after a fix; after a drop, activities and notifications of the backlog |
| A device was away longer than the activity window | It refetches what it holds of each organization once | Catchup starts over | Nothing |

A rebuild starts a new sync generation, and the API ends every open stream. A client whose catchup answer carries a new generation resets its view cursors to the new frontiers and runs each versioned signal's handler once. It refetches its synced cache once, each client at its own moment within a few seconds: what is on screen then, the rest through its [refetch mark](#freshness).

### Failure modes

Each failure has one answer per level. The **core** is the normal path, built to absorb the failure. The **mid** level recovers when the core cannot: the client runs catchup and the worker reads again. The **lost case** starts over: a client refetches once and the worker rebuilds its books. A second answer at one level is marked as an open finding to remove. A failure nothing answers says None. A change that adds an answer edits its row here, in the [CDC worker's table](../cdc/README.md#failure-and-recovery) or in the [notifications table](../backend/src/modules/notification/README.md#failure-modes).

| What fails | Core | Mid | Lost case |
| --- | --- | --- | --- |
| A readable row changes | A `change` frame names it and a range fetch patches the caches (`fetchRangeAndPatch`); the writing tab fetches nothing for its own write (`isOwnEcho`) | | |
| A change commits while catchup reads | The stream opens before catchup and buffers its frames until catchup ends; a full buffer runs catchup once more (`runCatchupCycle`) | | |
| Frames are missed: the stream was down, or the API restarted, lost a frame or closed a client that stopped reading | | Catchup fetches each view's sequence gap (`processAppCatchup`) | |
| A range fetch fails | Retried with a growing delay (`flushGroup`) | The cursor moves past the range and its lists get a refetch mark (`invalidateUndelivered`) | |
| A range returns fewer rows than announced: a row changed again, became unreadable or left with its channel | | Refetch mark (`invalidateUndelivered`) | |
| Unseen counts miss rows: a range that may hold creates was not delivered whole, or the stream reconnected | | An exact recount, asked for by the undelivered range (`invalidateUndelivered`) and at the end of every catchup (`processAppCatchup`) | |
| A change has more rows than a frame names | The `change` frame's `overflow` names their sequence range for a create or update, fetched as any other, and their ids for a delete or a move-out up to the id bound (`maxStreamChangeIds`), each handled as a named row | Past the id bound a delete or move-out marks the lists, recounts unseen and drops the type's cached details below the old home (`removeEntityDetailsBelow`); the stored files of those rows stay, an open finding | |
| A row moves where a reader cannot read it | One `change` frame with the `moveOut` action per reader for the rows one message moved removes them from the caches and purges their stored files (`removeEntity`, the download purge on sync-events) | | |
| A row is hard-deleted or unpublished | A `change` frame with the `delete` action marks its detail stale without a refetch, takes it off the unseen counts, marks its lists, refetching those on screen, and applies its propagation hint (`handleProductChange`) | | |
| A channel is deleted and its rows leave by cascade | `channel.deleted` drops what is cached below it (`handleChannelDeleted`) | Missed while away: catchup finds a new signal version and marks the lists (`refetchBelowDeletedChannels`), skipping the lists of a scope the same catchup answered opaque or already refetches at its start-over | |
| A versioned signal is heard live | The frame carries its version; the client records it once its handlers ran, and the next catchup does not run it again (`noteHeardSignal`) | Missed across a stream break, moved by a cascade, sent by a worker of an earlier release, or its handler threw: the catchup runs it once | |
| A frame handler throws, in the leader or a follower | Logged and skipped (`applyChange`, the follower's message handler) | | |
| An embedded row changes while hosts hold copies | The frame's `propagation` hint patches the copies (`propagateEmbeddings`) | Missed while away: the catchup's hints (`buildPropagationHints`); past a hint's or a frame's cap the host lists refetch (`invalidateEmbeddingHosts`) | |
| A list read overlaps live patches | The canonical read merges the ranges the cursor moved past while it ran (`readAgainstDeltas`) | | |
| A membership changes while the stream connects | The memberships are read again once the stream registers, and a change closes it with `access_changed` (`membershipsChangedSince`) | | |
| A membership changes while the stream is live | The subscriber's memberships update and `membership.changed` tells the user | Missed while away: catchup's signal versions and its read of the memberships, after which it drops the list caches of each organization where a channel membership was lost | |
| A membership is added in an organization the stream never registered on | The user's `membership.changed` reconnects the stream when the sync store lacks the organization, and the new stream registers there (`appStreamManager.reconnect`) | | |
| A session is revoked | `session.revoked` closes its streams | | |
| A session expires or a system role changes | A sweep each minute closes the stream (`ensureAppStreamSessionSweep`) | | |
| The tenant is archived or restored | Its streams close with `access_changed` (`endOrganizationStreams`) | | |
| The stream errors, ends or falls silent | The silence watchdog, which also runs the connectivity probe, and a reconnect with backoff, at once when the app is back online or a tab takes over (`handleStreamFailure`) | Repeated failures open the circuit, which a passing health check closes; a session or tenant the server refuses opens it until the next sign-in (`openCircuit`) | |
| A request gets no response: the link drops packets, or the tab reloads while it waits | After a few seconds the connectivity probe runs; once it finds the API unreachable the app goes offline and the waiting requests fail as network errors, so a write pauses in the queue (`apiFetch`). A sync write is stored while it runs, so a reload sends it again as a replay (`shouldDehydrateMutation`) | | |
| A catchup hangs or fails | Bounded, then the stream's failure path (`handleCatchupFailure`); the writes waiting for it go ahead (`waitForActiveCatchup`) | The same circuit | |
| No CDC worker reads | | `worker_away` pings put synced queries back on a stale time (`setSyncWorkerAway`) | |
| Rows are readable but the summary is unproven (`opaque`) | | Each catchup marks the view's cached lists and refetches those on screen (`processAppCatchup`); its hint names the embedded rows changed since the last one and moves the org cursor, refetching their hosts and marking their details (`settleOpaqueHint`) | |
| The leader tab closes | Web Locks hand the stream to another tab, which reconnects (`initTabCoordinator`) | | |
| Web Locks are missing or the election throws | The tab takes the leader role (`initTabCoordinator`) | | |
| A tab comes back from a public page while another tab leads | | | None, an open finding: as a follower it runs no catchup of its own (`connect`), so what it missed arrives only when a later frame of the same scope fetches from its cursor |
| Two tabs of one user write the persisted sync store | | | None, an open finding: it is one record per user and the last write wins, so one tab's cursors or cleared refetch can overwrite those of a tab that closed before its refetch ran (`syncStore`) |
| The books get a new generation | | | The API ends every stream with `resync`; each client resets its cursors and signal versions, runs each versioned signal's handler once and refetches once at its share of a spread (`adoptGeneration`) |
| A device was away longer than the activity window | | | It resets its cursors and refetches at once (`startOverIfAway`) |
| A create or update reaches the API after its row left the table | The API sends no frame for it (`dispatchChange`) | | |
| A frame or signal of a type the bundle does not know | Skipped (`handleStreamChange`, `handleStreamSignal`) | | |

### Multiple tabs

One tab leads: it holds the stream, runs catchup and forwards what it receives to the other tabs, which apply it against their own cursors and cache. Another tab takes over when the leader closes.

### Yjs

The template collaborates on attachment descriptions through the Yjs relay (`services.yjs.enabled`). With it on, a description saves through the relay, never as a REST write, so it never enters the replay queue.

The cache takes a description and its derived columns only from a server write of that field. A read that lags the relay therefore cannot undo a collaborative patch.
