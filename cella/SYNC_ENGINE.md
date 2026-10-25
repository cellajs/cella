# Sync engine

This document explains how product data stays current across clients and what the sync engine guarantees, online and offline.

### TL;DR

**Notify-then-fetch**: When relevant data changes, the server sends a small notification and the
client fetches the changed rows through the normal API, often served from cache, then patches only
the affected cached client entries. This way, the sync engine reuses the app's existing data model, storage, and permission checks.

```text
Database change -> live notification -> normal API fetch -> client cache update
```

## Selective sync

Only product entities sync. A **channel** (`ChannelEntityType`) is a container: REST CRUD, memberships, permission boundaries. A **product** (`ProductEntityType`) is synced content: beyond REST CRUD it carries sequence stamps, notifications, range catchup, and merge metadata. The template ships `organization -> attachment`. Apps can add deeper hierarchies, drafts, embeddings, and Yjs fields.

| Concept | Meaning |
| --- | --- |
| **Sequence** | One monotonic counter per organization, shared by all product entity types |
| **Path** | Root-first channel ID path of a row. A **subtree** (a channel and everything below it) is a path prefix. |
| **Home** | Deepest non-null channel ancestor of a product row, with organization as fallback |
| **Summary** | Frontier, counts, and timestamps on a channel row, so one read answers for a subtree |
| **Frontier** | Newest sequence position in a summary. It only moves forward. |
| **View** | The slice of the stream a client tracks (prefixes, entity types, depth, cursor). The unit catchup authorizes and answers. |
| **Cursor** | Latest sequence position a view has ingested. The **stream cursor** is the last activity a connection received. |
| **Range fetch** | Ordinary list request bounded by `afterSeq` and `untilSeq` |
| **Tombstone** | Soft-deleted row that remains fetchable for the deleted-items period, so absent clients learn the deletion ([Data lifecycle](./ARCHITECTURE.md#data-lifecycle)) |
| **`stx`** | Envelope on every product write (mutation ID, source ID, per-field HLC timestamps) for merge arbitration and echo recognition |

## Data flow example

Renaming attachment `a42` inside `org1`:

1. The tab optimistically patches every cached query containing `a42` and sends the update: `ops` carries the changed fields, `stx` the attempt ID and field timestamps.
2. The API stamps the changed fields with a server timestamp, applies the write and returns the stored row, which the tab's cache reconciles against.
3. Postgres commits to the WAL. The CDC worker, in commit order, records the audit activity, stamps the row with the next organization sequence position and updates channel summaries.
4. The worker sends the change to the API over the internal WebSocket. The API drops its cached detail and dispatches the change.
5. Dispatch checks the full row with the permission engine used by REST reads. Allowed subscribers receive an SSE notification with entity ID, path, sequence range, and `stx`.
6. The originating tab recognizes its own echo and patches only `stx`. Other clients fetch the notified range through the list endpoint and patch their caches.

Reconnect uses the same path: cursor `3` and frontier `7` become `afterSeq=3&untilSeq=7`, and the cursor advances to `7` only after ingest.

## Server

### Ordering

The CDC worker records changes in commit order, which is sequence order across product types. In one transaction it stamps rows with their organization's next sequence positions and updates the channel summaries; a change delivered again changes none of them. Notifications go out per audience: the rows of one type under one path ([CDC worker](../cdc/README.md#normal-flow)).

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

**Row readability** decides whether a user may fetch a row. List reads, range fetches, SSE dispatch, and detail-cache hits all run the permission engine against full rows:

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

### Notifications

Only the user's own membership changes are streamed, and they invalidate that user's channel lists and memberships. Other members' changes arrive through catchup. Product notifications have four shapes:

| Shape | Detection | Behavior |
| --- | --- | --- |
| Single row | `seq` set, no `batchUntilSeq` | Fetch that position and patch caches |
| Batch | `batchUntilSeq` set | Fetch the inclusive range and patch all returned rows |
| Delete-style removal | `action: 'delete'` | Mark the detail stale and invalidate scoped lists. No sync-visible row remains to fetch. |
| Move-out | `action: 'moveOut'` | Remove the row from caches and unseen tracking immediately |

A single-row notification carrying this tab's `stx.sourceId` is an echo: the tab patches only `stx`. A batch is fetched whoever wrote it, so the worker sends an audience's lone row as a single-row notification even when other edits share its flush.

### Catchup

Catchup runs on every connection before the stream goes live: the client opens SSE, waits for the server's `offset` marker, then posts its stream cursor and a view per organization the user belongs to. Each view gets a status, and an `ok` view its frontier and count. A view without a cursor (a first connection, a newly joined organization) takes the frontier as its baseline and refetches what it has cached of that organization, since rows read before the stream was live are not covered by it. A view behind its frontier hands the gap to the fetch prioritizer, and its cursor advances once the gap is ingested or invalidated.

### Fetch prioritization

A notified range is queued, not fetched at once. Its delay is this client's fixed slot within the server's `spreadWindow`, clamped to the range of the scope's tier:

- A viewed channel fetches immediately.
- A muted or archived channel fetches when opened; a catchup gap in it fetches in the background.
- Every other channel fetches in the background between 2 and 30 seconds.

Apps derive per-user state from `query/realtime/sync-signals.ts`, never from queue logic: `onChangeEvent` announces every readable notification before any tier decision, with ids only. `onSyncedRows` delivers a settled range's rows, or an empty `degraded` batch that means invalidate instead of derive.

### Freshness

Synced product queries never go stale on their own while the stream is healthy: catchup owns their freshness. A failed stream, a delivery shortfall or an absent CDC worker drops them to a five-minute stale time until a clean catchup or the worker's return ([REST fallback](#rest-fallback)). Other queries keep the global 30-second default, infinite while offline with `offlineAccess`.

### Unseen tracking

Unseen badges count delivered rows with the server's own predicate and are replaced by an exact server recount on staleness and after catchup, because seen marks from other devices never enter CDC. Only types every channel member may read are counted on the client; the others are counted by their endpoint.

### Embeddings

A product can reference other products through an id array column: the **host** row holds the ids, each referenced row is **embedded**. Declare the relationship in `appConfig.productEmbeddings`. Host and embedded rows sync independently, and an embedded row change carries a `PropagationHint` that patches the copies inside cached host rows.

The engine keeps no reference counts. A count such as the tasks with a label is derived on the client from the synced host rows, so it follows every change with no refetch. Where the hosts are not synced, or a decision must not rest on what this viewer can read (deleting an unused label), count on the server.

## Writes

Product mutations own optimistic updates and replay registration in their query module: `onMutate` patches matching caches, success merges the row the server stored, failure rolls back where configured. Mutations run with React Query `networkMode: 'offlineFirst'`.

An edit attempted offline retries network errors only, then pauses and enters the persisted replay queue. An HTTP error response settles at once. Restored paused mutations replay after the first catchup attempt, or once the stream stops reconnecting ([REST fallback](#rest-fallback)). Online writes never wait.

### Merge metadata

Synced tables store the latest `stx` envelope and merged timestamps for scalar fields:

```text
HLC: 1710500000123:0001:abcde
     unix millis : counter : source hash
```

Comparison uses milliseconds, then counter, then source. Each tab advances its own clock, and the server advances its clock from received timestamps. This is deterministic last-writer-wins, not a causal clock.

An online write is ordered by arrival: the server replaces its field timestamps with a fresh server HLC, so a device clock that runs behind cannot lose an edit. Only a replayed offline write (`stx.replayed`, set by the query client when a mutation pauses) is arbitrated by its client timestamps, its intent time, so it loses to an edit made elsewhere while it was queued.

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

`fieldTimestamps` names exactly the scalar operation keys. A replay's losing scalars are skipped and the server returns the stored row, never a conflict response. An update locks its row before it merges (`getValidProduct` with `forUpdate`), so overlapping updates resolve in turn; an app's own update operation passes `forUpdate` as well.

Columns the server derives from a write, such as the attachment `keywords` and audit stamps, are written in the same transaction but carry no HLC and stay out of `fieldTimestamps` and `changedFields`. Only `updatedAt` joins `changedFields`, which is how the CDC worker tells a user edit from its own writes.

### Paused writes

Paused mutations persist to IndexedDB and survive a reload, so their variables carry everything a replay needs: hook closures are gone by then. `stx` is minted at intent time and stored with them, so a replay reuses its mutation ID and field timestamps. The attachment module is the reference.

A product's create, update and delete each carry one shape (rows under `data`, an `id` with `ops`, rows under `rows`), so the queue can reason about pending work: an edit of a row whose create is still queued folds into that create, a remote change of a row with a pending mutation is kept from the cache until it settles, and a delete the server refuses puts its rows back.

A paused mutation can outlive the bundle that queued it. A bundle that changes a mutation's shape declares a version and an upgrade; an older stored mutation is upgraded on restore, and one no upgrade can read is quarantined and never replayed. Mutation defaults must exist before restore, so a product's module file imports its query module; a mutation restored without them fails with a console warning.

A replayed create is idempotent by its row ids: the server returns the caller's own rows already committed under those ids and inserts the rest. Update and delete have no such check.

## Resilience

The REST API and the database work whatever the CDC worker does, and a client without live sync is a REST client. Failure handling has three levels and no more: the core records a change once, whatever fails is read again from the replication slot, and when the WAL cannot help the worker rebuilds its books and every client refetches ([CDC worker](../cdc/README.md#failure-and-recovery)).

### REST fallback

Losing the stream costs live updates and nothing else: every read and write goes through the API either way. A stream counts as down when it errors, when the server ends it, or after 75 seconds without a `ping` (sent every 30). While it is down, a client:

1. Gives its synced queries a five-minute stale time, so lists refetch when opened ([Freshness](#freshness)).
2. Reconnects with backoff from 5 to 30 seconds. After three failures it waits a minute, then reconnects once the tab is visible and the API is healthy.
3. Runs catchup on the new connection, fetches what its cursors miss and trusts its queries again ([Catchup](#catchup)).

A range fetch that fails three times, or returns fewer rows than announced, is given up: its lists are invalidated and synced queries keep the stale time until a clean catchup. An open stream also falls back when no CDC worker has read for a minute, with step 1 only. Restarts and deploys take less than that minute, and what was missed arrives late and in order.

### What happens when

Missed notifications are repaired by the client's own catchup. Clients refetch everything only when the books themselves were wrong.

| What happened | What a user sees | What repairs it | What is lost |
| --- | --- | --- | --- |
| A client's stream is down | The app works as a REST app; lists refetch when opened once five minutes old | Reconnect and catchup | Nothing |
| The worker is down or reading again | Other users' changes arrive late and in order; after a minute lists refetch as above | The worker reads on from the slot | Nothing |
| The API restarts or loses a notification | Streams reconnect, at the latest after 75 seconds of silence | Catchup fetches the gap | Mentions and push notifications of that moment |
| A deploy overlap (`singleVM`) | Clients on the new API hear nothing until the slot moves | The next notification or reconnect | Nothing |
| The books are wrong (counters emptied, the daily check finds a difference, a rebuild interrupted) | Every client refetches once | A rebuild from the tables | Nothing |
| The slot is lost or invalidated, or the database is restored from a backup | Live updates stop until the worker restarts; then every client refetches once | A new slot and a rebuild | Activities and notifications of rows changed meanwhile; with a restore, everything after the backup |
| One change can never be processed | Live updates pause about a minute; then every client refetches once | The slot moves past the backlog and the books are rebuilt | Activities and notifications of that backlog |
| A device was away longer than the activity window | It refetches what it holds of each organization once | Catchup starts over: missed tombstones may be gone | Nothing |

### Rebuilt books

The counters, the sequence counter and the frontiers are the CDC worker's books. Every rebuild moves the sync generation on ([CDC worker](../cdc/README.md#verify-and-rebuild)), and the API ends open streams with `resync`. A client whose catchup answer carries a new generation resets its view cursors, takes the new frontiers as baselines, refetches the lists on screen at once and the rest of its synced cache after a random delay of up to ten seconds.

### One API process

The worker hands every change to one API process, and that process holds every stream. The sync engine is built for one API process per deployment: [Scaling](./ARCHITECTURE.md#scaling).

### Schema changes

Old tabs and old queued writes survive a wire-shape deploy through lenses: [Schema evolution](./SCHEMA_EVOLUTION.md).

### Multiple tabs

The first tab to acquire the Web Lock becomes leader: it owns SSE, runs catchup, and forwards each notification, each catchup answer and the health of its stream and the worker through BroadcastChannel. Followers apply them against their own cursors and cache, so they fill the same gaps. A follower is promoted when the leader closes. Every tab can mutate and keeps its own paused-mutation queue.

### Yjs

The template collaborates on attachment descriptions through the Yjs relay (`services.yjs.enabled`); an app adds a product by registering a `yjsMaterializer`. With Yjs on, a description saves through the relay only, never as a REST write, so it never enters the replay queue ([Yjs worker](../yjs/README.md)).

The cache takes a Yjs-owned field (the description and columns derived from it, `registerYjsOwnedFields`) only from a server write of that field. A synced row that carries the cached copy's field stamp leaves the cached value in place, so a read that lags the relay cannot undo a collaborative patch.

## Reference

### SSE wire

| Event | Meaning |
| --- | --- |
| `offset` | The server's newest activity id, once after connect: the signal to post the catchup |
| `change` | One `StreamNotification` |
| `ping` | Every 30 seconds. Its data is `worker_away` while no CDC worker has read for a minute |
| `error` | Typed payload |

The server ends a stream with `unauthorized` when its session ended for good (sign-out, revocation, expiry, MFA turned on elsewhere, account deletion, an ended impersonation); the client then waits until a visible tab finds the API healthy (`forbidden` and `tenant_revoked` are reserved and treated the same). `session_replaced` (the browser holds a newer session), `access_changed` (system-admin reads changed) and `resync` (a new generation) make the client reconnect. The server rechecks every open stream's session once a minute.

```typescript
interface StreamNotification {
  kind: "product" | "membership";
  action: "create" | "update" | "delete" | "moveOut";
  productType: string | null;
  resourceType: string | null;
  subjectId: string | null;
  organizationId: string | null;
  tenantId: string | null;
  channelType: string | null;
  path: string | null; // old path for moveOut
  channelId: string | null; // home channel
  seq: number | null;
  stx: StxBase | null;
  batchUntilSeq: number | null;
  count: number | null;
  spreadWindow: number | null;
  propagation: PropagationHint | null;
}

interface StxBase {
  mutationId: string;
  sourceId: string;
  fieldTimestamps: Record<string, string>;
  replayed?: boolean; // a paused offline write at replay
}

interface PropagationHint {
  embeddedProduct: string;
  hostProduct: string;
  hostColumn: string;
  update: string[];
  remove: string[];
}
```

### Catchup wire

The request carries a stream cursor and views `{ key, organizationId, prefixes, entityTypes, depth?, cursor }` (`depth`: `self` or `subtree`, default `subtree`). The response carries view answers, organization change summaries, the stream cursor, and the generation of the sync books.

A stream subscribes to the organizations the user belongs to when it opens, plus the user's own membership events. A membership in a new organization makes the client reconnect to subscribe to it and take its baselines.

```typescript
interface CatchupViewAnswer {
  key: string;
  status: "ok" | "opaque" | "forbidden";
  frontiers?: Record<string, number>;
  counts?: Record<string, number>;
}

interface CatchupChangeSummary {
  signals?: { membership?: number };
  propagation?: PropagationHint[];
}
```

`signals.membership` moves with every membership and invitation change in the organization; a client whose stored value differs invalidates its member queries.

`afterSeq=50&untilSeq=150` reads the rows stamped after position 50 up to and including 150, deleted rows included, in sequence order. Both bounds are required, and a range read takes no search and no offset: a response capped by `limit` is a prefix of the range, and the next request starts after the last position received. A row returned outside the range means the server ignored it, and the client invalidates its lists. `channelId` narrows a range read to one subtree on top of the permission scope, never folded into it ([New entity](./ADD_ENTITY.md)).

### Detail cache

The server keeps a TTL cache of enriched product detail responses. The API's own write of a row and every CDC message for it drop its entry, and a read that started before a drop is never stored. A hit rechecks permission, draft visibility, tenant and organization. Concurrent misses fetch once, and lists bypass it.
