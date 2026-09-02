# Sync engine

This document explains how product data stays current across clients and what the sync engine guarantees, online and offline.

### TL;DR

**Notify-then-fetch**: When relevant data changes, the server sends a small notification and the
client fetches the changed rows through the normal API, often served from cache, then patches only
the affected cache entries. The stream carries only rows the recipient may fetch, so a notification
is a pointer rather than data. The sync system reuses the app's existing data model, storage, and
permission checks.

```text
Database change -> live notification -> normal API fetch -> client cache update
```

## Selective sync

Only product entities sync. A **channel** (`ChannelEntityType`) is a container: REST CRUD, memberships, permission boundaries. A **product** (`ProductEntityType`) is synced content: sequence stamps, notifications, range catchup, merge metadata. The template ships `organization -> attachment`; apps add deeper hierarchies, drafts, embeddings, and Yjs fields.

| Concept | Meaning |
| --- | --- |
| **Sequence** | One monotonic counter per organization, shared by all product entity types |
| **Path** | Root-first channel ID path from a row's ancestor ids; every subtree is a path prefix |
| **Subtree** | A channel node and every row at or below it, identified by the node's path prefix |
| **Home** | Deepest non-null channel ancestor of a product row; organization as fallback |
| **Frontier** | Newest sequence position in a channel summary; only moves forward |
| **Summary** | Frontier, counts, and timestamps denormalized onto a channel row, so one read answers for a subtree |
| **View** | The slice of the stream a client tracks (prefixes, entity types, depth, cursor); the unit catchup authorizes and answers |
| **Cursor** | Latest sequence position a view has ingested |
| **Range fetch** | Ordinary list request bounded by `seqCursor` |
| **Tombstone** | Soft-deleted row that remains fetchable so absent clients learn the deletion |
| **`stx`** | Envelope on every product write (mutation ID, source ID, per-field HLC timestamps) for merge arbitration and echo recognition |

## Data flow example

Renaming attachment `a42` inside `org1`:

1. The tab optimistically patches every cached query containing `a42` and sends the update: `ops` carries the changed fields, `stx` the attempt ID and scalar field timestamps.
2. The API drops scalar values with older timestamps, applies the rest, and returns the authoritative row; the initiating cache reconciles against it.
3. Postgres commits to the WAL. The CDC worker, in commit order, records the audit activity, reserves the next organization sequence position, stamps the row, and updates channel summaries.
4. The worker sends the change to the API over the internal WebSocket; the API invalidates its detail cache and hands the change to the stream dispatcher.
5. Dispatch checks the full row with the permission engine used by REST reads; allowed subscribers receive an SSE notification with entity ID, path, sequence range, and `stx`.
6. The originating tab recognizes its `sourceId` and patches only cached `stx`. Other clients fetch the notified range through the list endpoint and patch their caches.

Reconnect uses the same path: cursor `3` and frontier `7` become `?seqCursor=4`, and the cursor advances to `7` only after ingest.

## Server

### Ordering

The CDC worker consumes PostgreSQL logical replication, preserves transaction boundaries so cascaded child deletes can be suppressed, then micro-batches committed events by type and action. Product batches are split by `(path, entityType)`, one audience per notification. Channel paths are generated columns; product paths are computed.

Commit order is sequence order across product types. A batch range can contain positions of other types or paths, so `count` is the authoritative batch size; never infer it from range arithmetic.

The API accepts the worker only at `/internal/cdc`: shared secret, production sources limited to loopback or the deployment VPC, one connection, idle peers closed after 90 seconds. See the [CDC worker](../cdc/README.md).

### Counters

Per organization batch, the worker reserves a contiguous sequence range, stamps product rows in WAL order, and updates `channel_counters`. Keys follow `<domain>:<metric>:[h:]<type|role>`; `h` marks a **home-only** summary, its absence the **subtree** aggregate. Subtree keys are written to the home node and every ancestor up to the organization, home-only keys to the home node, singletons to the organization row. Counter recalculation rebuilds sequence, frontiers, counts, timestamps, and canonical paths from table data with the CDC live-and-published predicates, ignoring historical stamps on old drafts.

| Key | Scope | Meaning |
| --- | --- | --- |
| `sequence` | Org-wide | Sequence reservation counter |
| `membership` | Org-wide | Bump-only membership change signal |
| `e:f:{type}` | Subtree | Frontier of rows at or below the node |
| `e:f:h:{type}` | Home-only | Frontier of rows homed at the node |
| `e:c:{type}` | Subtree | Count of countable rows at or below the node |
| `e:c:h:{type}` | Home-only | Count of countable rows homed at the node |
| `e:li:h:{type}` / `e:lu:h:{type}` | Home-only | Last insert and update timestamps |
| `m:c:{role}` / `m:c:total` / `m:c:pending` | Channel | Membership counts |

### Drafts

Product tables that opt into drafts use a PostgreSQL publication row filter:

- Publishing makes replication emit an insert: the row's sync birth and first sequence stamp.
- Unpublishing keeps the row as a draft, but replication emits a delete carrying the old published row; readers receive delete-style invalidation.
- Draft creates, edits, and deletes never reach the worker.
- Soft-deleting a published row flows as an update tombstone.

Channel tables are not filtered; their `publishedAt` controls invitees. A worker entrance check and a dispatch veto reject drafts if an app adds a draft column without regenerating the publication. API reads still apply their published-row predicate; drafts remain in the table.

### Moves

When an update changes a product path, the worker includes the permission-relevant part of the old row and dispatch compares readability at both locations: readers of both receive a normal update and route the row to its new caches; readers of only the old location receive `moveOut` with the old path, and the notification itself removes the row because no range fetch can return it. A publish plus reparent arrives as an insert without an old row, so no `moveOut`.

## Access

**Row readability** decides whether a user may fetch a row. List reads, range fetches, SSE dispatch, and detail-cache hits all run the permission engine against full rows:

- A membership grant covers rows homed at that channel.
- Only elevated roles reach downstream below their grant level.
- Grants never reach upstream; upstream access needs an ancestor membership.

**Summary answerability** decides whether a user may see aggregate frontiers and counts for a view; summaries reveal that activity exists, so they need stronger proof. Catchup assigns each view one status:

| Status | Meaning | Client behavior |
| --- | --- | --- |
| `ok` | Every prefix is proven for the requested depth | Use frontiers, counts, and range fetches |
| `opaque` | Rows may be readable, but the summary is not fully proven | Reveal no numbers; refetch cached active lists |
| `forbidden` | User has no readable scope in the organization | Drop the view |

A direct unconditional membership proves a `self` view at that node. A `subtree` view also needs a subtree-scoped grant: an elevated role at the node or a grant at the deepest hierarchy level. Prefix sets are proven one prefix at a time. Canonical ancestry comes from `channel_counters.path`, never from a client claim; a forged or stale prefix returns `opaque`, not `forbidden`, so the status is no existence oracle.

Declare views where grants live: organization-wide and elevated grants produce subtree views, home-scoped grants self views, a set of granted homes one prefix-set view; conditional grants produce no precise summary views. Changing a view's prefixes, entity types, or depth resets its cursor. Membership state and content cursors advance independently, with no snapshot consistency tokens. Read [Permissions](./PERMISSIONS.md) for the policy model.

## Client

### Notifications

Membership changes invalidate membership and channel queries. Product notifications have four shapes:

| Shape | Detection | Behavior |
| --- | --- | --- |
| Single row | `seq` set, no `batchUntilSeq` | Fetch that position and patch caches |
| Batch | `batchUntilSeq` set | Fetch the inclusive range and patch all returned rows |
| Delete-style removal | `action: 'delete'` | Mark the detail stale and invalidate scoped lists; no sync-visible row remains to fetch |
| Move-out | `action: 'moveOut'` | Remove the row from caches and unseen tracking immediately |

A non-delete notification carrying this tab's `stx.sourceId` is an echo: the tab patches only `stx`. Deletes are never echo-skipped because their `stx` may identify an earlier writer. Echo handling returns before cursor advancement, so catchup can refetch the position.

### Catchup

The client opens SSE and posts its cursor and views when the server's `offset` event arrives. The server authorizes each prefix and returns view statuses, permitted frontiers and counts, membership signals, and embedding hints; then the stream is live.

- A first connection stores permitted frontiers as baselines; route loaders own initial data.
- An `ok` view behind its frontier fetches changed rows once per product type; child-homed rows route into matching caches. Full chunks and failed requests fall back to active-list invalidation; background channels may defer the fetch to the prioritizer.
- An `opaque` view invalidates its cached active lists. A `forbidden` view is removed.
- Tombstones remove rows from detail and list caches.
- Membership lists refresh only where the organization membership signal changed; channel lists, `me`, and the user's memberships refresh on any change.
- Embedding propagation runs after the organization's range fetches.
- Each view total is compared with the last total seen, never with the permission-filtered cached list; a moved total invalidates the matching list, repairing missed removals such as unpublish or physical delete.

A connection covers the organizations visible when it opens plus a per-user channel for self-membership events; a new organization membership makes the client reconnect to register that channel.

### Fetch prioritization

Fetch delay is set by client priority and server load:

```text
delay = clamp(client minimum, deterministic jitter within spreadWindow, client maximum)
```

Client tiers:

- A viewed channel fetches immediately.
- A muted or archived channel fetches when opened.
- Other channels fetch in the background between 2 and 30 seconds.

Route state identifies the viewed channel at organization level; deeper, observed list queries do (prefetches are not observers).

The server's `spreadWindow` grows with the online audience and database pool pressure, capped at 120 seconds. The prioritizer merges contiguous ranges per product type and home channel; a new notification never postpones an earlier deadline. It flushes when navigation enters a channel, a channel gains its first observer, the tab hides, or the browser returns online. At flush, all due channels of one organization and product type share one covering fetch, narrowed with `pathPrefix` when the channel-path resolver proves a common ancestor (the template fetches org-wide); rows route to their home lists and each covered channel advances to the shared upper bound.

Fetches start after a view's ingested cursor, not its newest known position, so small gaps self-repair; repeated failures fall back to targeted invalidation and advance, so a range never loops.

Apps derive per-user state from the signals in `query/realtime/sync-signals.ts` (`onChangeEvent` per readable notification, `onSyncedRows` once a range settles), never from prioritizer logic.

### Freshness

After SSE goes live, background fill loads product queries for the current organization; other organizations only with `offlineAccess`. That flag also sets cache lifetime and scope (see [Client](./CLIENT.md#the-persister)).

Synced product queries use infinite stale time while the stream is healthy, so catchup owns their freshness and route-loader prefetches reuse synced lists. A failed stream drops them to a five-minute fallback with mount refetching, reconnect refetching, and pull-to-refresh. Other queries keep the global 30-second default, infinite while offline with `offlineAccess`.

### Unseen tracking

Unseen badges update from delivered rows, mirroring the server predicate: inside the shared time window, published, not deleted, not locally seen. Qualifying rows increment, tombstones decrement, marking seen decrements once; ID guards and a reconciliation timestamp prevent double counting. The exact count endpoint replaces the estimate after staleness, focus changes, and catchup; cross-device seen marks reconcile there because `seen_by` does not enter CDC. Seen-tracked types require unconditional channel read; types with conditional row visibility keep endpoint counting.

### Embeddings

A product can reference other products through an id array column: the **host** row holds the ids, each referenced row is **embedded**. Declare the relationship in `appConfig.productEmbeddings` (`hostProduct`, `embeddedProduct`, `hostColumn`); the template configures none. Host and embedded rows sync independently, so patching runs both ways:

- **Embedded row changes.** Notifications and catchup carry the changed embedded ids (`PropagationHint`); the client patches the copies inside cached host rows, guarded by `updatedAt`, after the embedded range fetch (live) or all organization range fetches (catchup). A same-tab echo returns before propagation, so that mutation updates host products itself.
- **Host row changes.** Values derived per embedded row, such as a usage count, get no signal of their own, so ingesting a host range compares each row's embedding columns against the cached copy and refetches the lists of embedded rows whose references were added or removed, narrowed to their home channels; an uncached host row touches every id.

When the client invalidates a host list instead of ingesting rows (first connection, opaque view, nothing cached, delivery failure), it also invalidates the embedded products' lists. Derived counts come from the list endpoint only.

## Writes

Product mutations own optimistic updates and replay registration in their query module: `onMutate` patches matching list and detail caches, the mutation runs with React Query `networkMode: 'offlineFirst'`, success merges the authoritative server row, failure follows module and global error handling, including optimistic rollback where configured.

An edit attempted offline retries network errors only (backoff sized to outlast the connectivity probe), then pauses and enters the persisted replay queue. Server errors, any HTTP status, settle immediately without queueing. Restored paused mutations wait for the first catchup attempt before replay; online writes never wait.

### Merge metadata

Synced tables store the latest `stx` envelope and merged timestamps for scalar fields:

```text
HLC: 1710500000123:0001:abcde
     unix millis : counter : source hash
```

Comparison uses milliseconds, then counter, then source. Each tab advances its own clock; the server advances its clock from received timestamps before generating its own; clients never advance from remote values. This is deterministic last-writer-wins, not a causal clock.

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

Update schemas require `fieldTimestamps` to match the scalar operation keys exactly; missing, unrelated, malformed, and array-delta timestamps are rejected. The server omits scalar values that lose HLC comparison and returns the authoritative row, never a conflict response. Trusted server updates advance beyond stored scalar clocks and assign one server HLC.

Array deltas remove first, then add. Replaying the same delta is idempotent, but the operation is not a commutative CRDT: opposite concurrent operations are order-sensitive, and the resolved array is written whole. Merge resolution is no SQL compare-and-set and takes no `FOR UPDATE` lock, so overlapping updates can race, especially whole-array writes and `stx` metadata.

### Paused writes

Paused mutations persist to IndexedDB and survive a reload, so mutation variables must carry all routing data; hook closures no longer exist at replay. The attachment module is the reference: mutation functions are registered as replay defaults, and `stx` is minted at intent time and stored in the variables so a replay reuses the mutation ID and field timestamps. Only `isPaused` mutations are dehydrated.

While offline, before a queued mutation completes a round trip, the queue is rewritten:

- **Squash** folds queued same-entity updates into one request.
- **Coalesce** absorbs an update over a still-queued create into that create (top-level `id` and batch `data[]` shapes).
- **Cancel** drops a still-queued create and its updates when the entity is deleted, finishing the deletion cache-side.

Persisted variables are also rewritten during schema evolution. Idempotency is operation-specific: attachment create checks its mutation ID against the stored `stx` and can return an existing batch; update and delete do not.

## Resilience

### Schema changes

Old PWA tabs can hold old cache rows and mutation variables after a new server shape deploys; append-only schema lenses normalize old writes on the server and migrate persisted client state before use; tabs coordinate migration through a Web Lock and stop persisting on detecting a newer schema version. Read [Schema evolution](./SCHEMA_EVOLUTION.md).

### Multiple tabs

The first tab to acquire the Web Lock becomes leader, owns SSE, and forwards notifications through BroadcastChannel; a follower is promoted when the leader closes. All tabs can mutate. Each tab keeps its own paused-mutation queue; a restoring tab absorbs the queues of dead tabs, and replay is idempotent, so absorbing a queue twice is safe.

### Detail cache

The server keeps an authenticated TTL cache for enriched product detail responses, keyed by entity type and ID. Hits recheck permission and draft visibility, misses coalesce concurrent requests, and CDC invalidates changed entries, including batch rows and physical deletes. Defaults: 5,000 entries (roughly 25 to 50 MB), 10-minute TTL. List fan-out bypasses it.

### Yjs

Yjs collaboration is disabled in the template. When enabled, the relay is the single writer for registered rich-text fields during a session and persists through the standard product update path; clients suppress SSE replacement of fields owned by an editor while other fields keep syncing. See the [Yjs worker](../yjs/README.md).

## Reference

### SSE wire

```typescript
interface StreamNotification {
  kind: "entity" | "membership";
  action: "create" | "update" | "delete" | "moveOut";
  entityType: string | null;
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

The request carries a stream cursor and views `{ key, organizationId, prefixes, entityTypes, depth?, cursor }` (`depth`: `self` or `subtree`, default `subtree`); the response carries view answers, organization change summaries, and the stream cursor.

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

`seqCursor=51,150` is the inclusive bounded range and the only form. Range fetches may carry `pathPrefix` to narrow the read to one channel subtree. In hierarchies deeper than `organization -> channel`, a read covered by a `channelId` must AND a subtree predicate over the denormalized ancestor id columns on top of the permission-derived scope (`buildSubtreeCoverWhere`, `backend/src/db/utils/subtree-cover.ts`); never fold the covering id into the permission scope, or an intermediate grant widens the read past the subtree.
