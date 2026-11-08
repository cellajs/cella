# Sync engine

This document explains how product data, and the facts around it, stay current across clients online and offline. It assumes you know TanStack Query: queries, stale time and paused mutations ([tanstack.com](https://tanstack.com/query/latest)).

### TL;DR

The server announces each data change on a live stream: product rows as **changes**, anything else a client must hear about as **signals**. The client fetches the data through the normal API and patches only the affected cached entries. The sync engine adds no second data model, storage or permission check.

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

1. Tab A patches its cached `a42` and sends the edit with its `stx`.
2. The API stores the edit and answers with the stored row.
3. The CDC worker reads the commit from the WAL, records an activity and stamps a sequence position.
4. The worker hands the API one message per audience.
5. The API asks the permission engine of REST reads which subscribers of `org1` may read the rows.
6. Each allowed subscriber gets a change frame of its readable rows, without row data.
7. Tab A recognizes its own write and fetches nothing.
8. Tab B fetches the announced range through the list endpoint.

The diagram names one edit at each stage:

- **change:** in the WAL and on the stream
- **activity:** once recorded
- **message:** between two processes
- **event:** inside one process

Reconnecting takes the same path. Cursor `3` and frontier `7` become `afterSeq=3&untilSeq=7`.

## Changes and signals

The stream carries two kinds of frame. Both are announcements. The client reads what a frame points at through REST.

| | Change | Signal |
| --- | --- | --- |
| About | A `product` row | A fact of a registered type, such as `membership.changed` or `channel.deleted` |
| Made by | The CDC worker, from a committed row | API code after its commit, or the CDC worker from a tracked table |
| Sent to | Subscribers who may read the row | One user, or the readers of a subject |
| Missed while away | Catchup fetches the sequence gap | Catchup compares a **versioned** signal's version and runs its handler once. An **ephemeral** one is gone |

A signal is versioned when a client that was away must still hear it. A committed row then makes it. A module declares the signals it sends and the handlers that answer them.

The rows below a deleted channel leave by cascade and get no change of their own. The channel's delete sends one `channel.deleted` to its readers in their place.

## Selective sync

Only product rows sync. Channels are containers, and products are the synced content. The template ships `organization -> attachment`. Apps add deeper hierarchies and options such as drafts and embeddings.

| Concept | Meaning |
| --- | --- |
| **Sequence** | One monotonic counter per organization, shared by all product entity types |
| **Path** | Root-first channel ID path of a row. A **subtree**, a channel and everything below it, is a path prefix. |
| **Home** | Deepest non-null channel ancestor of a product row, with organization as fallback |
| **Summary** | Counts and timestamps on a channel row, so one read answers for a subtree. The organization's row also holds the frontiers. |
| **Frontier** | Newest sequence position of a product type in an organization. It only moves forward. |
| **View** | An organization and a product type a client tracks. Catchup authorizes and answers per view. |
| **Cursor** | Latest sequence position a view has ingested |
| **Range fetch** | Ordinary list request for the rows stamped between `afterSeq` and `untilSeq`, deleted rows included |
| **Tombstone** | Soft-deleted row as a range fetch returns it for the deleted-items period: its id, position and place, never its content. Absent clients learn the deletion from it |
| **`stx`** | Envelope on every product write: mutation ID, source ID and per-field HLC timestamps |

## Server

### Ordering

Commit order is sequence order, across product types. A change delivered twice moves nothing. Changes go out per audience: the rows of one type under one path.

### Drafts

Sync sees a draft only once it is published. Publishing arrives as a create, and unpublishing as a delete.

### Moves

When an update moves rows where a subscriber can no longer read them, that subscriber receives one `moveOut` and drops them. No range fetch could return them. Subscribers who read both locations receive a normal update.

## Access

**Row readability** decides whether a user may fetch a row. Every row read, change frames included, asks the permission engine about the full row. A grant reaches down, never up. An elevated role reads the rows below its channel, any other role only the rows homed at it.

**Summary answerability** decides whether a user may see a view's frontier. A frontier reveals that activity exists, so it needs stronger proof. Catchup gives each view one status:

| Status | Meaning | Client behavior |
| --- | --- | --- |
| `ok` | The user reads every row of the type in the organization | Use the frontier and range fetches |
| `opaque` | The user reads some rows: its grants reach part of the organization or carry a row condition | Reveal no numbers. Refetch the cached lists on screen and mark the others to refetch when opened. |
| `forbidden` | User has no readable scope in the organization | Drop the view |

## Client

### Changes

A change frame names each changed row with its sequence position and the write that changed it. The client answers by the row's action:

- **Create or update:** fetch the row and patch it into the caches.
- **Delete:** mark the row's lists for a refetch, since no row is left to fetch.
- **Move-out:** drop the row at once.
- **Own echo:** fetch nothing, since the write's answer brought the stored row.

A frame past a size bound names its rows by id alone, and past a larger bound names none. The client then fetches the range or refetches the lists.

### Catchup

Catchup runs on every connection before the stream goes live. It runs only after the persisted cache is restored, so a gap is fetched into the lists on disk. The client posts a view per product type of each of the user's organizations. The answer holds:

- each view's status
- an `ok` view's frontier
- each organization's signal versions

A view behind its frontier hands the gap to the fetch prioritizer. A view without a cursor, as in a newly joined organization, takes the frontier as its baseline and refetches what it has cached there.

### SSE wire

Beside change and signal frames, the stream sends a periodic `ping` and an `error`. The `ping` says whether a CDC worker is reading. Every proxy on the way must keep an idle stream open longer than the ping interval.

The `error` names why the server ends the stream. A stream ended for good still answers 200 and closes after its `error` frame.

No frame carries an event id. A reconnecting client resumes through catchup from its cursors. Frame shapes: [API reference](/docs/schemas).

### Fetch prioritization

An announced range is queued, not fetched at once. Its channel's tier decides when:

- **Viewed:** at once.
- **Muted or hidden:** when it is opened.
- **Any other:** in the background, spread over a window that grows with the online audience.

Apps derive per-user state from `query/realtime/sync-events.ts`, never from queue logic. It announces each id a change frame names, before any tier decision. It then delivers the rows of each fetched range.

### Freshness

Synced product queries never go stale on their own while the stream is healthy. Catchup owns their freshness, also when the app comes back online. A failed stream or an absent CDC worker lets them go stale with time until the stream delivers again ([REST fallback](#rest-fallback)). Other queries keep the global stale time, infinite while offline.

A list the engine cannot patch whole, such as an overflowed or a filtered list, carries a **refetch mark**. It refetches when it is opened or when the [background fill](./CLIENT.md#cold-start-to-live) reads it. The mark outlives later patches and a reload. Only that refetch clears it.

### Unseen tracking

Unseen badges count delivered rows with the server's own predicate. An exact server recount replaces them after catchup and when they go stale. The client counts only types every channel member may read. Their endpoint counts the others.

## Embeddings

A product can reference other products through an id array column. The **host** row holds the ids, and each referenced row is **embedded**. Declare the relationship in `appConfig.productEmbeddings` and the engine handles the rest.

Host and embedded rows sync independently. An embedded row's change patches its copies inside cached host rows. A host write keeps only the ids of live rows in its organization.

The embedding's `lifecycle` decides what a deletion does:

- `shared`: embedded rows live on their own. The CDC worker strips a deleted one's id from the hosts.
- `owned`: the CDC worker also soft-deletes an embedded row once no live host references it.

The engine keeps no usage counts. Derive one on the client from the synced host rows, such as the tasks with a label. Count on the server when the hosts are not synced. Count there too when a decision must not rest on what this viewer reads, such as deleting an unused label.

A side effect an embedding cannot express, such as seeding rows when a project is created, goes through the mutation bus of `defineBackendModule`.

## Writes

A product mutation patches the cache optimistically and reconciles with the stored row. Offline, an edit pauses in the persisted replay queue.

An HTTP error settles at once. A replay that meets a gateway error, as during a deploy, stays queued until the API answers. A queue restored after a reload or a sign-in replays after the first catchup attempt.

The attachment module sends a tab's writes one at a time and in order. An online write therefore waits behind a queued one.

### Merge metadata

Synced tables store the latest `stx` and a hybrid logical clock (HLC) timestamp per scalar field. The merge is deterministic last-writer-wins, not a causal clock. Array fields merge `{ add, remove }` deltas.

- **Online write:** the server stamps a fresh HLC, so a device clock that runs behind cannot lose an edit.
- **Replayed write:** keeps its intent time, so it loses to an edit made elsewhere while it was queued.
- **No conflict response:** losing fields are skipped, and the server returns the stored row.
- **Future stamp:** one too far ahead of the server's clock loses to the next write of its field.

### Paused writes

Paused mutations persist to IndexedDB and survive a reload. Their variables carry everything a replay needs, including the `stx` minted at intent time. Each tab keeps its own queue. A tab that starts takes over the queue of a closed one. The attachment module is the reference.

A product's create, update and delete each carry one fixed shape, so the queue can reason about pending work:

- **Fold:** an edit of a row whose create was never sent folds into that create.
- **Hold:** while a row has a pending mutation, remote changes and list reads leave it alone.
- **Settle:** when a row's last pending mutation settles, the stored row replaces the cached one.
- **Restore:** a refused delete puts its rows back.
- **Order:** edits and deletes of a row wait for its attempted create, which may have committed.

A paused mutation can outlive the bundle that queued it. A lens converts an entity wire-shape change ([Schema evolution](./SCHEMA_EVOLUTION.md)). A bundle that changes a mutation's own shape declares a version and an upgrade. A mutation no upgrade can read is dropped.

A replay the server refuses with a 4xx rolls back and toasts, as a live edit does. A replay that meets a lost session stays queued for the same user's next sign-in.

A replayed create is idempotent by its row ids, and a replayed delete by its mutation id. Rows an earlier attempt deleted count as deleted, not refused. An update has no such check.

## Resilience

The REST API and the database work whatever the CDC worker does. The worker records each change once, reads again whatever failed, and rebuilds its books when the WAL cannot help ([CDC worker](../cdc/README.md#failure-and-recovery)).

### REST fallback

Losing the stream costs live updates and nothing else. Synced queries go stale with time, so lists refetch when opened. The client reconnects with backoff, and the next catchup fetches what its cursors miss.

### What happens when

The client's own catchup repairs missed frames. Clients refetch everything only when the books themselves were wrong.

| What happened | What a user sees | What repairs it | What is lost |
| --- | --- | --- | --- |
| A client's stream is down | The app works as a REST app. Lists refetch when opened | Reconnect and catchup | Nothing |
| The worker is down or reading again | Other users' changes arrive late and in order. In a longer outage lists refetch when opened | The worker reads on from the slot | Nothing |
| The API restarts, loses a frame or closes a stream its client stopped reading | Streams reconnect | Catchup fetches the gap and compares signal versions | Ephemeral signals, and mentions and push notifications of that moment |
| The books are wrong or emptied | Every client refetches once | A rebuild from the tables | Nothing |
| The slot is lost, or the database restored from a backup | Live updates stop until the worker has a new slot. Then every client refetches once | A new slot and a rebuild | Activities and notifications of rows changed meanwhile. With a restore, everything after the backup |
| One change can never be processed | Live updates pause until a fix ships or the slot is dropped. After a drop every client refetches once | A fix lets the worker read on. A dropped slot is made anew and the books rebuilt | Nothing after a fix. After a drop, activities and notifications of the backlog |
| A device was away longer than the activity window | It refetches what it holds of each organization once | Catchup starts over | Nothing |

A rebuild starts a new sync generation, and the API ends every open stream. Each client refetches its synced cache once, at its own moment within a few seconds. What is on screen refetches then, the rest through its [refetch mark](#freshness).

### Failure modes

Each failure has one answer per level:

- **Core:** the normal path, built to absorb the failure.
- **Mid:** recovers when the core cannot. The client runs catchup, the worker reads again.
- **Lost case:** starts over. A client refetches once, the worker rebuilds its books.

A second answer at one level is marked as an open finding to remove. A failure nothing answers says None. A change that adds an answer edits its row here, in the [CDC worker's table](../cdc/README.md#failure-and-recovery) or in the [notifications table](../backend/src/modules/notification/README.md#failure-modes).

| What fails | Core | Mid | Lost case |
| --- | --- | --- | --- |
| A readable row changes | A `change` frame names it and a range fetch patches the caches (`fetchRangeAndPatch`). The writing tab fetches nothing for its own write (`isOwnEcho`) | | |
| A change commits while catchup reads | The stream opens before catchup and buffers its frames until catchup ends. A full buffer runs catchup once more (`runCatchupCycle`) | | |
| Frames are missed: the stream was down, or the API restarted, lost a frame or closed a client that stopped reading | | Catchup fetches each view's sequence gap (`processAppCatchup`) | |
| A range fetch fails | Retried with a growing delay (`flushGroup`) | The cursor moves past the range and its lists get a refetch mark (`invalidateUndelivered`) | |
| A range returns fewer rows than announced: a row changed again, became unreadable or left with its channel | | Refetch mark (`invalidateUndelivered`) | |
| Unseen counts miss rows: a range that may hold creates was not delivered whole, or the stream reconnected | | An exact recount, asked for by the undelivered range (`invalidateUndelivered`) and at the end of every catchup (`processAppCatchup`) | |
| A change has more rows than a frame names | The `change` frame's `overflow` names their sequence range for a create or update. For a delete or a move-out it names their ids up to the id bound (`maxStreamChangeIds`) | Past the id bound a delete or move-out marks the lists, recounts unseen and drops the type's cached details below the old home (`removeEntityDetailsBelow`). The stored files of those rows stay, an open finding | |
| A row moves where a reader cannot read it | One `change` frame with the `moveOut` action per reader for the rows one message moved removes them from the caches and purges their stored files (`removeEntity`, the download purge on sync-events) | | |
| A row is hard-deleted or unpublished | A `change` frame with the `delete` action marks its detail stale without a refetch, takes it off the unseen counts, marks its lists, refetching those on screen, and applies its propagation hint (`handleProductChange`) | | |
| A channel is deleted and its rows leave by cascade | `channel.deleted` drops what is cached below it (`handleChannelDeleted`) | Missed while away: catchup finds a new signal version and marks the lists (`refetchBelowDeletedChannels`) | |
| A versioned signal is heard live | The frame carries its version. The client records it once its handlers ran, and the next catchup does not run it again (`noteHeardSignal`) | Missed across a stream break, moved by a cascade, sent by a worker of an earlier release, or its handler threw: the catchup runs it once | |
| A frame handler throws, in the leader or a follower | Logged and skipped (`applyChange`, the follower's message handler) | | |
| An embedded row changes while hosts hold copies | The frame's `propagation` hint patches the copies (`propagateEmbeddings`) | Missed while away: the catchup's hints (`buildPropagationHints`). Past a hint's or a frame's cap the host lists refetch (`invalidateEmbeddingHosts`) | |
| A list read overlaps live patches | The canonical read merges the ranges the cursor moved past while it ran (`readAgainstDeltas`) | | |
| A membership changes while the stream connects | The memberships are read again once the stream registers, and a change closes it with `access_changed` (`membershipsChangedSince`) | | |
| A membership changes while the stream is live | The subscriber's memberships update and `membership.changed` tells the user | Missed while away: catchup's signal versions and its read of the memberships, after which it drops the list caches of each organization where a channel membership was lost | |
| A membership is added in an organization the stream never registered on | The user's `membership.changed` reconnects the stream when the sync store lacks the organization, and the new stream registers there (`appStreamManager.reconnect`) | | |
| A session is revoked | `session.revoked` closes its streams | | |
| A session expires or a system role changes | A sweep each minute closes the stream (`ensureAppStreamSessionSweep`) | | |
| The tenant is archived or restored | Its streams close with `access_changed` (`endOrganizationStreams`) | | |
| The stream errors, ends or falls silent | The silence watchdog and a reconnect with backoff, at once when the app is back online or a tab takes over (`handleStreamFailure`) | Repeated failures open the circuit, which a passing health check closes. A session or tenant the server refuses opens it until the next sign-in (`openCircuit`) | |
| A request gets no response: the link drops packets, or the tab reloads while it waits | The connectivity probe runs. Once it finds the API unreachable, the app goes offline and a waiting write pauses in the queue (`apiFetch`). A sync write is stored while it runs, so a reload sends it again as a replay (`shouldDehydrateMutation`) | | |
| A catchup hangs or fails | Bounded, then the stream's failure path (`handleCatchupFailure`). The writes waiting for it go ahead (`waitForActiveCatchup`) | The same circuit | |
| No CDC worker reads | | `worker_away` pings put synced queries back on a stale time (`setSyncWorkerAway`) | |
| Rows are readable but the summary is unproven (`opaque`) | | Each catchup marks the view's cached lists and refetches those on screen (`processAppCatchup`). Its hint names the embedded rows changed since the last one, whose hosts refetch (`settleOpaqueHint`) | |
| The leader tab closes | Web Locks hand the stream to another tab, which reconnects (`initTabCoordinator`) | | |
| Web Locks are missing or the election throws | The tab takes the leader role (`initTabCoordinator`) | | |
| A tab comes back from a public page while another tab leads | | | None, an open finding: as a follower it runs no catchup of its own (`connect`). What it missed arrives only when a later frame of the same scope fetches from its cursor |
| Two tabs of one user write the persisted sync store | | | None, an open finding: the last write of the one record per user wins (`syncStore`). One tab's cursors or cleared refetch can overwrite those of a tab that closed before its refetch ran |
| The books get a new generation | | | The API ends every stream with `resync`. Each client resets its cursors and signal versions, runs each versioned signal's handler once and refetches once at its share of a spread (`adoptGeneration`) |
| A device was away longer than the activity window | | | It resets its cursors and refetches at once (`startOverIfAway`) |
| A create or update reaches the API after its row left the table | The API sends no frame for it (`dispatchChange`) | | |
| A frame or signal of a type the bundle does not know | Skipped (`handleStreamChange`, `handleStreamSignal`) | | |

### Multiple tabs

One leader tab holds the stream, runs catchup and forwards what it receives to the other tabs. Each tab applies it against its own cursors and cache. Another tab takes over when the leader closes.

### Yjs

The template collaborates on attachment descriptions through the Yjs relay. With the relay on, a description saves through it, never as a REST write. It therefore never enters the replay queue.

The cache takes a description and its derived columns only from a server write of that field. A read that lags the relay therefore cannot undo a collaborative patch.
