# Sync engine

This document explains how product data and the facts around it stay current across clients, online and offline, in the [TanStack Query](https://tanstack.com/query/latest) cache.

### TL;DR

The server announces each data change on a live stream: product rows as **changes**, anything else as **signals**. The client fetches the data through the normal API. This 'announce-then-fetch' design keeps things simpler at the cost of seeming like a redundant round-trip (which it is not :D).

## Selective sync

Only `product` rows sync. A `channel` is a containers for products, the synced content. The template ships organizations and attachments. Your app can add deeper hierarchies and options such as drafts and embeddings.

| Concept | Meaning |
| --- | --- |
| **Sequence** | One monotonic counter per organization, shared by all product entity types |
| **Summary** | Counts and timestamps per channel. One read answers for a channel and everything below it. The organization's row also holds the frontiers. |
| **Frontier** | Newest sequence position of a product type in an organization. It only moves forward. |
| **Books** | The sequences, counts and frontiers CDC keeps. A rebuild recounts them from the tables. |
| **Cursor** | Newest sequence position the client has fetched, per product type and organization |
| **View** | An organization and a product type a client tracks. Catchup authorizes and answers per view. |
| **Range fetch** | Ordinary list request for the rows stamped between `afterSeq` and `untilSeq`, deleted rows included |
| **Tombstone** | Soft-deleted row as a range fetch returns it for the deleted-items period: its id, position and place, never its content. Absent clients learn the deletion from it |
| **`stx`** | Envelope on every product write: mutation ID, source ID and per-field HLC timestamps |

## One edit, end to end

Renaming attachment `a42` in organization `org1`, with two tabs open:

```text
tab A ──PATCH──▶ API ──UPDATE──▶ Postgres
  ▲               │                 │ WAL ............... a change
  └── stored row ─┘                 ▼
                               CDC ...................... records an activity,
                                    │                     a sequence position, counters
                                    │ socket ............ a message per type and channel
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
3. CDC reads the commit from the WAL, records an activity and stamps a sequence position.
4. CDC hands the API one message per product type and channel.
5. The API asks the permission engine which subscribers of `org1` may read the rows, as for a REST read.
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

The stream carries two kinds of frame ('announcements'): `change` or `signal`. 

| | Change | Signal |
| --- | --- | --- |
| About | A `product` row | A fact of a registered type, such as `membership.changed` or `channel.deleted` |
| Made by | CDC, from a committed row | API code after its commit, or CDC from a tracked table |
| Sent to | Subscribers who may read the row | One user, or the readers of a subject |
| Missed while away | Catchup fetches the sequence gap | Catchup compares a **versioned** signal's version and runs its handler once. An **ephemeral** one is gone |

A signal is versioned when a client that was away must still hear it. A committed row then makes it. A module declares the signals it sends and the handlers that answer them.

The rows below a deleted channel leave by cascade and get no change of their own. In their place, the delete sends one `channel.deleted` to the readers of the deleted channel. It covers the channels inside it too.

## Server

### Ordering

Changes of all product types share one sequence, numbered in commit order. A change delivered twice moves nothing.

Changes go out per product type and channel. After a moment without changes there, the next few go out at once: a person's quick edits reach the other readers without a wait. When changes keep coming, the API bundles the rest into one frame per action and interval, each row once with its latest change.

### Drafts

Sync sees a draft only once it is published. Publishing arrives as a create.

### Moves

When an update moves rows where a subscriber can no longer read them, that subscriber receives one `moveOut` and drops them. No range fetch could return them. Subscribers who read both locations receive a normal update.

## Access

**Row readability** decides whether a user may fetch a row. Every row read, change frames included, asks the permission engine about the full row. A grant reaches down, never up. An elevated role reads the rows below its channel, any other role only the rows directly in it.

**Summary answerability** decides whether a user may see a view's frontier. A frontier needs stronger proof, since it reveals that activity exists. Catchup gives each view one status:

| Status | Meaning | Client behavior |
| --- | --- | --- |
| `ok` | The user reads every row of the type in the organization | Use the frontier and range fetches |
| `opaque` | The user reads some rows: its grants reach part of the organization or carry a row condition | Reveal no numbers. Refetch the cached lists on screen and mark the others to refetch when opened. |
| `forbidden` | User has no readable scope in the organization | Drop the view |

### Shared answers

Shared answers keep a `change` from costing one database read per reader. Say 50 members have an organization's attachments open when a colleague renames one. All 50 receive the change frame and fetch the same range at once. Without shared answers, the API runs its guards and reads the same rows 50 times.

With shared answers, the frame carries a **range key** for the readers to fetch with. The first fetch runs as any request does. The other 49 take its answer without passing the guards or reading the database. Three rules keep that safe:

- A key is a read scope and lasts seconds. Readers whose scopes differ get different keys.
- A kept answer serves only the URL it was read under and never outlives a write of its tenant: the writer's next fetch reads the database.
- A product list route opts in with `xCache` only when its answer to a range fetch depends on the read scope and the URL alone.

## Client

### Changes

A change frame names each changed row with its sequence position and the write that changed it. The client answers by the row's action:

- **Create or update:** fetch the row and patch it into the caches.
- **Delete:** fetch its tombstone, or mark its lists when no row is left.
- **Move-out:** drop the row at once.
- **Own echo:** fetch nothing, since the write's answer brought the stored row.

A frame for a write of many rows names them by id alone; for a very large write it fetches the range or refetches the lists.

### Catchup

Catchup fetches what the cached lists missed. It runs on every connection before the stream goes live, once the persisted cache is restored. A tab killed meanwhile fetches the gap again at its next catchup. The client posts a view per product type of each of the user's organizations. The answer holds:

- each view's status
- an `ok` view's frontier
- each organization's signal versions

A view behind its frontier hands the gap to the fetch prioritizer. A view without a cursor takes the frontier as its baseline and refetches what it has cached there. The views of a newly joined organization have none.

### SSE wire

The stream also sends an `offset`, a periodic `ping` and an `error` ([API reference](/docs/schemas)). The `offset` comes once after connecting and is empty: it cues the client to post its catchup. The `ping` says whether CDC is reading. Every proxy on the way must keep an idle stream open longer than the ping interval.

The `error` names why the server ends the stream. A stream ended for good still answers 200 and closes after its `error` frame.

### Fetch prioritization

The client queues each range fetch. The fetch's channel tier decides when they go out:

- **Viewed:** at once.
- **Muted or hidden:** when it is opened.
- **Any other:** in the background.

One range fetch per product type and organization runs at a time. Changes announced meanwhile join the next one. After a [rebuild of the books](#what-happens-when), the client refetches through the same tiers.

### Freshness

Synced product queries never go stale on their own while the stream is healthy. A failed stream or a stopped CDC lets them go stale with time until the stream delivers again ([REST fallback](#rest-fallback)).

A list the sync engine cannot patch whole, such as an overflowed or a filtered list, carries a **refetch mark**. It refetches when it is opened or when the [background fill](./CLIENT.md#cold-start-to-live) reads it. Only that refetch clears the mark.

### Unseen tracking

Unseen tracks counts of rows that are recent, published and not yet seen. An exact server recount replaces them after catchup and when they go stale. A tab sends the rows it saw at intervals and when it hides. A tab killed while in view loses the marks since its last send, and the next recount counts those rows as unseen again.

## Embeddings

A product can reference other products through an id array column. The **host** row holds the ids and each referenced row is **embedded**. Declare the relationship in `appConfig.productEmbeddings` and the sync engine handles the rest.

Host and embedded rows sync independently. An embedded row's change patches its copies inside cached host rows. A host write keeps only the ids of live rows in its organization.

The embedding's `lifecycle` decides what a deletion does:

- `shared`: embedded rows live on their own. CDC strips a deleted one's id from the hosts.
- `owned`: an embedded row is bound to a host. The nightly retention run soft-deletes one that no live host references.

The sync engine keeps no usage counts. Derive one on the client from the synced host rows, such as the tasks with a label. When a list holds only some of the hosts, such as a board that leaves out tasks accepted long ago, the server counts the rest.

A side effect an embedding cannot express, such as seeding rows when a project is created, goes through the mutation bus of `defineBackendModule`.

## Writes

A product mutation patches the cache optimistically and reconciles with the stored row. Offline, an edit pauses in the persisted replay queue.

An HTTP error settles at once. A replay that meets a gateway error stays queued until the API answers. A queue restored after a reload or a sign-in replays after the first catchup attempt.

The attachment module sends a tab's writes in order. Updates queued one behind another go as one batch, and an online write waits behind a queued one. A row the server refuses fails its own update alone.

### Merge metadata

Synced tables store the latest `stx` and a hybrid logical clock (HLC) timestamp per scalar field. The merge is deterministic last-writer-wins, not a causal clock. Array fields merge `{ add, remove }` deltas.

- **Online write:** a device clock that runs behind cannot lose an edit, since the server stamps a fresh HLC.
- **Replayed write:** loses to an edit made elsewhere while it was queued, since it keeps its intent time. 
- **No conflict response:** losing fields are skipped. A write that loses every field writes nothing.
- **Future stamp:** one too far ahead of the server's clock loses to the next write of its field.

### Paused writes

Paused mutations persist to IndexedDB as they queue and survive a reload or a crash. Their variables carry everything a replay needs, including the `stx` minted at intent time. Each tab keeps its own queue. A tab that starts takes over the queue of a closed one. The attachment module is the reference.

The queue can reason about pending work, since a product's create, update and delete each carry one fixed shape:

- **Fold:** an edit of a row whose create was never sent folds into that create.
- **Hold:** while a row has a pending mutation, remote changes and list reads leave it alone.
- **Settle:** when a row's last pending mutation settles, the stored row replaces the cached one.
- **Restore:** a refused delete puts its rows back.
- **Order:** edits and deletes of a row wait for its attempted create, which may have committed.

A paused mutation can outlive the bundle that queued it. A lens converts an entity wire-shape change ([Schema evolution](./SCHEMA_EVOLUTION.md)). A bundle that changes a mutation's own shape declares a version and an upgrade. A mutation no upgrade can read is dropped.

A replay the server refuses with a 4xx rolls back and toasts, as a live edit does. A replay that meets a lost session stays queued for the same user's next sign-in.

A replayed create is idempotent by its row ids, and a replayed delete by its mutation id. Rows an earlier attempt deleted count as deleted, not refused. An update has no such check.

## Resilience

Reads and writes never wait for CDC. When CDC is down or behind, the API still answers. CDC records each change once, reads again whatever failed and rebuilds its books when the WAL cannot help ([CDC](../../cdc/README.md#failure-and-recovery)).

### REST fallback

Losing the stream costs live updates and nothing else. Lists refetch when opened, since synced queries go stale with time. The client reconnects with backoff. The next catchup fetches what its cursors miss.

### What happens when

The client's own catchup repairs missed frames ([Failure modes](./sync-engine/FAILURE_MODES.md)). Every client refetches everything only after a rebuild of the books.

| What happened | What a user sees | What repairs it | What is lost |
| --- | --- | --- | --- |
| A client's stream is down | The app works as a REST app. Lists refetch when opened | Reconnect and catchup | Nothing |
| CDC is down or reading again | Other users' changes arrive late and in order. In a longer outage lists refetch when opened | CDC reads on from the slot | Nothing |
| The API restarts or closes a stream its client stopped reading | Streams reconnect | Catchup fetches the gap and compares signal versions | Ephemeral signals, and mentions and push notifications of that moment |
| The books are wrong or emptied | Every client refetches once | A rebuild from the tables | Nothing |
| The slot is lost, or the database restored from a backup | Live updates stop until CDC has a new slot. Then every client refetches once | A new slot and a rebuild | Activities and notifications of rows changed meanwhile. With a restore, everything after the backup |
| One change can never be processed | Live updates pause until a fix ships or the slot is dropped. After a drop every client refetches once | A fix lets CDC read on. A dropped slot is made anew and the books rebuilt | Nothing after a fix. After a drop, activities and notifications of the backlog |
| A bulk transaction: a migration's writes, or one transaction past CDC's size limit | Every client refetches once, the lists on screen first | CDC discards it and rebuilds the books at its commit | Its activities and notifications |
| A device was away longer than the activity window | It refetches what it holds of each organization once | Catchup starts over | Nothing |
| A user's read budget is spent: a busy board, a large import or replay, several tabs | Live updates pause until the budget's wait ends. A page the user opens meanwhile answers with a warning and the wait | The queued range fetches run once the wait ends, and the refused lists on screen refetch | Nothing |

After a rebuild, the API ends every open stream. Each client refetches its synced cache once, at its own moment within a few seconds. What is on screen refetches then, the rest through its [refetch mark](#freshness).

### Multiple tabs

One leader tab holds the stream, runs catchup and forwards what it receives to the other tabs. Each tab applies it against its own cursors and cache. A tab that joins as a follower runs one catchup of its own. Another tab takes over when the leader closes.

### Yjs

In the template, people edit attachment descriptions together through the Yjs relay. With the relay on, a description saves through it, never as a REST write. It never enters the replay queue.

A read that lags the relay cannot undo a collaborative patch. The cache takes a description and its derived columns only from a server write of that field.
