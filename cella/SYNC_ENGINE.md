# Sync engine

This document explains how product data, and the facts around it, stay current across clients online and offline.

### TL;DR

**Announce-then-fetch**: when data changes, the server announces it on a live stream and the client fetches it through the normal API, often from cache, then patches only the affected cached entries. The sync engine adds no second data model, storage or permission check. Product rows travel as **changes**; anything else a client must hear about, such as a new membership or an inbox item, travels as a **signal**.

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

The edit has one name per place it is in: a **change** in the WAL and on the stream, an **activity** once recorded, a **message** between two processes, an **event** inside one. Reconnecting takes the same path: cursor `3` and frontier `7` become `afterSeq=3&untilSeq=7`.

## Changes and signals

The stream carries two kinds of frame. Both are announcements: what a frame points at, the client reads through REST.

| | Change | Signal |
| --- | --- | --- |
| About | A product row | A fact of a registered type, such as `membership.changed` |
| Made by | The CDC worker, from a committed row | API code after its commit, or the CDC worker from a tracked table |
| Sent to | Subscribers who may read the row | One user, or the readers of a subject |
| Missed while away | Catchup fetches the sequence gap | Catchup compares a **versioned** signal's version and runs its handler once; an **ephemeral** one is gone |

A signal is versioned when a client that was away must still find out, and then a committed row makes it. A module declares the signals it sends and the handlers that answer them, and the stream stays as it is. The template sends `membership.changed` to the member and, versioned, to the organization's readers, and `notification.created` and `notification.read` to the owner of the inbox.

## Selective sync

Only product rows sync. A **channel** (`ChannelEntityType`) is a container: REST CRUD, memberships, permission boundaries. A **product** (`ProductEntityType`) is synced content: it carries sequence stamps, change frames, range catchup and merge metadata. The template ships `organization -> attachment`. Apps add deeper hierarchies, drafts, embeddings and Yjs fields.

| Concept | Meaning |
| --- | --- |
| **Sequence** | One monotonic counter per organization, shared by all product entity types |
| **Path** | Root-first channel ID path of a row. A **subtree** (a channel and everything below it) is a path prefix. |
| **Home** | Deepest non-null channel ancestor of a product row, with organization as fallback |
| **Summary** | Frontier, counts and timestamps on a channel row, so one read answers for a subtree |
| **Frontier** | Newest sequence position in a summary. It only moves forward. |
| **View** | The slice of the stream a client tracks (prefixes, entity types, depth, cursor). The unit catchup authorizes and answers. |
| **Cursor** | Latest sequence position a view has ingested. The **stream cursor** is the last activity a connection received. |
| **Range fetch** | Ordinary list request bounded by `afterSeq` and `untilSeq` |
| **Tombstone** | Soft-deleted row that remains fetchable for the deleted-items period, so absent clients learn the deletion ([Data lifecycle](./ARCHITECTURE.md#data-lifecycle)) |
| **`stx`** | Envelope on every product write (mutation ID, source ID, per-field HLC timestamps) for merge arbitration and echo recognition |

## Server

### Ordering

Commit order is sequence order, across product types. The worker stamps the positions in the same transaction as the summaries, so a change delivered again moves neither ([CDC worker](../cdc/README.md#normal-flow)). Changes go out per audience: the rows of one type under one path.

### Drafts

Product tables that opt into drafts use a PostgreSQL publication row filter:

- Publishing makes replication emit an insert: the row's sync birth and first sequence stamp.
- Unpublishing keeps the row as a draft, but replication emits a delete carrying the old published row. Readers receive delete-style invalidation.
- Draft creates, edits, and deletes never reach the worker.
- Soft-deleting a published row flows as an update tombstone.

Channels have `publishedAt` with the same meaning and no publication filter: a draft channel shows only to its members and to those who manage it from above ([Permissions](./PERMISSIONS.md#enforcement-paths)).

### Moves

When an update moves a product to a path a subscriber can no longer read, that subscriber receives `moveOut` with the old path and drops the row, because no range fetch could return it. Subscribers who can read both locations receive a normal update.

## Access

**Row readability** decides whether a user may fetch a row. List reads, range fetches, change frames and detail-cache hits all run the permission engine against full rows:

- A membership grant covers rows homed at that channel.
- Only elevated roles reach downstream below their grant level.
- Grants never reach upstream. Upstream access needs an ancestor membership.

**Summary answerability** decides whether a user may see aggregate frontiers and counts for a view. Summaries reveal that activity exists, so they need stronger proof. Catchup assigns each view one status:

| Status | Meaning | Client behavior |
| --- | --- | --- |
| `ok` | Every prefix is proven for the requested depth | Use frontiers, counts, and range fetches |
| `opaque` | Rows may be readable, but the summary is not fully proven | Reveal no numbers. Refetch cached active lists. |
| `forbidden` | User has no readable scope in the organization | Drop the view |

The client derives its views from the user's memberships and the policy matrix before every catchup. Apps declare none by hand. Read [Permissions](./PERMISSIONS.md) for the policy model.

## Client

### Changes

A change frame takes one of four shapes:

| Shape | Detection | Behavior |
| --- | --- | --- |
| Single row | `seq` set, no `batchUntilSeq` | Fetch that position and patch caches |
| Batch | `batchUntilSeq` set | Fetch the inclusive range and patch all returned rows |
| Delete-style removal | `action: 'delete'` | Mark the detail stale and invalidate scoped lists. No sync-visible row remains to fetch. |
| Move-out | `action: 'moveOut'` | Remove the row from caches and unseen tracking immediately |

A single-row change carrying this tab's `stx.sourceId` is an echo: the tab patches only `stx`.

### Catchup

Catchup runs on every connection before the stream goes live: the client opens SSE, waits for the server's `offset` marker, then posts its stream cursor and a view per organization the user belongs to. Each view gets a status, an `ok` view its frontier and count, and each organization the versions of its signals. A view without a cursor (a first connection, a newly joined organization) takes the frontier as its baseline and refetches what it has cached of that organization, since rows read before the stream was live are not covered by it. A view behind its frontier hands the gap to the fetch prioritizer, and its cursor advances once the gap is ingested or invalidated.

### Fetch prioritization

An announced range is queued, not fetched at once. A viewed channel fetches immediately, a muted or archived one when it is opened, and any other in the background, each client at its own slot in the server's `spreadWindow`, which grows with the organization's online audience so its clients do not all fetch at once.

Apps derive per-user state from `query/realtime/sync-events.ts`, never from queue logic: `onChangeEvent` announces every readable change before any tier decision, with ids only. `onSyncedRows` delivers a settled range's rows, or an empty `degraded` batch that means invalidate, not derive.

### Freshness

Synced product queries never go stale on their own while the stream is healthy: catchup owns their freshness. A failed stream, a delivery shortfall or an absent CDC worker drops them to a five-minute stale time until a clean catchup or the worker's return ([REST fallback](#rest-fallback)). Other queries keep the global 30-second default, infinite while offline.

### Unseen tracking

Unseen badges count delivered rows with the server's own predicate and are replaced by an exact server recount on staleness and after catchup, because seen marks from other devices never enter CDC. Only types every channel member may read are counted on the client; the others are counted by their endpoint.

### Embeddings

A product can reference other products through an id array column: the **host** row holds the ids, each referenced row is **embedded**. Declare the relationship in `appConfig.productEmbeddings`. Host and embedded rows sync independently, and an embedded row's change carries a `PropagationHint` that patches the copies inside cached host rows.

The engine keeps no reference counts. A count such as the tasks with a label is derived on the client from the synced host rows, so it follows every change with no refetch. Where the hosts are not synced, or a decision must not rest on what this viewer can read (deleting an unused label), count on the server.

## Writes

Product mutations own optimistic updates and replay registration in their query module: `onMutate` patches matching caches, success merges the row the server stored, failure rolls back where configured.

An edit attempted offline retries network errors only, then pauses and enters the persisted replay queue. An HTTP error response settles at once. Restored paused mutations replay after the first catchup attempt, or once the stream stops reconnecting ([REST fallback](#rest-fallback)). A lost session holds them until the user signs in again: without one, every replay would be refused. Online writes never wait.

### Merge metadata

Synced tables store the latest `stx` envelope and merged timestamps for scalar fields:

```text
HLC: 1710500000123:0001:abcde
     unix millis : counter : source hash
```

Each tab advances its own clock, and the server advances its clock from received timestamps. This is deterministic last-writer-wins, not a causal clock.

An online write is ordered by arrival: the server replaces its field timestamps with a fresh server HLC, so a device clock that runs behind cannot lose an edit. Only a replayed offline write (`stx.replayed`) is arbitrated by its client timestamps, its intent time, so it loses to an edit made elsewhere while it was queued.

Value shape selects merge behavior:

```typescript
{
  ops: {
    name?: string;                                  // scalar, HLC last-writer-wins
    status?: number;                                // scalar, HLC last-writer-wins
    labels?: { add?: string[]; remove?: string[] }; // array delta
  };
  stx: StxBase;
}
```

A replay's losing scalars are skipped and the server returns the stored row, never a conflict response. An update locks its row before it merges, so overlapping updates resolve in turn.

Columns the server derives from a write, such as the attachment `keywords`, carry no HLC. Of those only `updatedAt` joins `changedFields`, which is how the CDC worker tells a user edit from its own writes.

### Paused writes

Paused mutations persist to IndexedDB and survive a reload, so their variables carry everything a replay needs: hook closures are gone by then. `stx` is minted at intent time and stored with them, so a replay reuses its mutation ID and field timestamps. The attachment module is the reference.

A product's create, update and delete each carry one shape (rows under `data`, an `id` with `ops`, rows under `rows`), so the queue can reason about pending work: an edit of a row whose create is still queued folds into that create, a remote change of a row with a pending mutation is kept from the cache until it settles, and a delete the server refuses puts its rows back.

A paused mutation can outlive the bundle that queued it. A bundle that changes a mutation's shape declares a version and an upgrade; an older stored mutation is upgraded on restore, and one no upgrade can read is quarantined and never replayed.

A replayed create is idempotent by its row ids: the server returns the caller's own rows already committed under those ids and inserts the rest. Update and delete have no such check.

## Resilience

The REST API and the database work whatever the CDC worker does. Failure handling has three levels and no more: the core records a change once, whatever fails is read again from the replication slot, and when the WAL cannot help the worker rebuilds its books and every client refetches ([CDC worker](../cdc/README.md#failure-and-recovery)).

### REST fallback

Losing the stream costs live updates and nothing else. A stream counts as down when it errors, when the server ends it, or when its 30-second `ping` stops. While it is down, synced queries take the five-minute stale time, so lists refetch when opened; the client reconnects with backoff, waiting for a visible tab and a healthy API after a few failures; and the new connection's catchup fetches what its cursors miss and trusts its queries again.

A range fetch that keeps failing, or returns fewer rows than announced, is given up and its lists invalidated. An open stream falls back too when no CDC worker has read for a minute; restarts and deploys take less, and what was missed arrives late and in order.

### What happens when

Missed frames are repaired by the client's own catchup. Clients refetch everything only when the books themselves were wrong.

| What happened | What a user sees | What repairs it | What is lost |
| --- | --- | --- | --- |
| A client's stream is down | The app works as a REST app; lists refetch when opened once five minutes old | Reconnect and catchup | Nothing |
| The worker is down or reading again | Other users' changes arrive late and in order; after a minute lists refetch as above | The worker reads on from the slot | Nothing |
| The API restarts or loses a frame | Streams reconnect, at the latest after 75 seconds of silence | Catchup fetches the gap and compares signal versions | Ephemeral signals, and mentions and push notifications of that moment |
| A deploy overlap (`singleVM`) | Clients on the new API hear nothing until the slot moves | The next change or reconnect | Nothing |
| The books are wrong (counters emptied, the daily check finds a difference, a rebuild interrupted) | Every client refetches once | A rebuild from the tables | Nothing |
| The slot is lost or invalidated, or the database is restored from a backup | Live updates stop until the worker restarts; then every client refetches once | A new slot and a rebuild | Activities and notifications of rows changed meanwhile; with a restore, everything after the backup |
| One change can never be processed | Live updates pause about a minute; then every client refetches once | The slot moves past the backlog and the books are rebuilt | Activities and notifications of that backlog |
| A device was away longer than the activity window | It refetches what it holds of each organization once | Catchup starts over: missed tombstones may be gone | Nothing |

### Rebuilt books

The counters, the sequence counter and the frontiers are the CDC worker's books. Every rebuild moves the sync generation on ([CDC worker](../cdc/README.md#verify-and-rebuild)), and the API ends open streams with `resync`. A client whose catchup answer carries a new generation resets its view cursors, takes the new frontiers as baselines, refetches the lists on screen at once and the rest of its synced cache after a random delay.

### One API process

The worker hands every change to one API process, and that process holds every stream. The sync engine is built for one API process per deployment: [Scaling](./ARCHITECTURE.md#scaling).

### Schema changes

Old tabs and old queued writes survive a wire-shape deploy through lenses: [Schema evolution](./SCHEMA_EVOLUTION.md).

### Multiple tabs

The first tab to acquire the Web Lock becomes leader: it owns SSE, runs catchup, and forwards each change, each signal, each catchup answer and the health of its stream and the worker through BroadcastChannel. Followers apply them against their own cursors and cache, so they fill the same gaps. A follower is promoted when the leader closes. Every tab can mutate and keeps its own paused-mutation queue.

### Yjs

The template collaborates on attachment descriptions through the Yjs relay (`services.yjs.enabled`); an app adds a product by registering a `yjsMaterializer`. With Yjs on, a description saves through the relay only, never as a REST write, so it never enters the replay queue ([Yjs worker](../yjs/README.md)).

The cache takes a Yjs-owned field (the description and columns derived from it, `registerYjsOwnedFields`) only from a server write of that field. A synced row that carries the cached copy's field stamp leaves the cached value in place, so a read that lags the relay cannot undo a collaborative patch.

## Reference

### SSE wire

| Event | Meaning |
| --- | --- |
| `offset` | The server's newest activity id, once after connect: the cue to post the catchup |
| `change` | One `StreamChange`. Its SSE id is the activity id, which becomes the stream cursor. |
| `signal` | One `StreamSignal`, with no SSE id: it never moves the cursor |
| `ping` | Every 30 seconds. Its data is `worker_away` while no CDC worker has read for a minute |
| `error` | Why the server ends the stream |

`unauthorized` ends a stream whose session ended for good ([Sessions](./authentication/SESSIONS.md)), and the client waits until a visible tab finds the API healthy; `forbidden` and `tenant_revoked` are reserved and treated the same. After `session_replaced` (the browser holds a newer session), `access_changed` (system-admin reads changed) or `resync` (a new generation) the client reconnects. The server rechecks every open stream's session once a minute. Frame shapes: `StreamChange` and `StreamSignal` in the [API reference](/docs/schemas).

### Catchup wire

A view is `{ key, organizationId, prefixes, entityTypes, depth?, cursor }` (`depth`: `self` or `subtree`, the default). Beside the answers of [Catchup](#catchup) the response carries embedding propagation hints, the new stream cursor and the generation of the sync books.

A stream subscribes to the organizations the user belongs to when it opens, plus the user's own signals. A membership in a new organization makes the client reconnect to subscribe to it and take its baselines.

`afterSeq=50&untilSeq=150` reads the rows stamped after position 50 up to and including 150, deleted rows included, in sequence order. Both bounds are required, and a range read takes no search and no offset: a response capped by `limit` is a prefix of the range, and the next request starts after the last position received. A row returned outside the range means the server ignored it, and the client invalidates its lists. `channelId` narrows a range read to one subtree on top of the permission scope, never folded into it ([add-entity skill](./skills/add-entity/SKILL.md)).

### Detail cache

The server keeps a TTL cache of enriched product detail responses. The API's own write of a row and every CDC message for it drop its entry. A hit rechecks permission, draft visibility, tenant and organization. Lists bypass it.
