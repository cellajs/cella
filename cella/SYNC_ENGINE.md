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

Cella distinguishes two entity kinds. A **channel** (`ChannelEntityType`) is a container: ordinary REST CRUD, memberships, permission boundaries, and server-assigned IDs. A **product** (`ProductEntityType`) is synced content: sequence stamps, realtime notifications, range catchup, and optimistic merge metadata. The template ships the minimal hierarchy `organization -> attachment`; apps can add deeper channel hierarchies, draft lifecycles, embedded entities, and Yjs-backed fields without changing the core flow.

The core concepts are:

| Concept | Meaning |
| --- | --- |
| **Sequence** | One monotonic counter per organization, shared by all product entity types |
| **Path** | Root-first channel ID path computed from a row's ancestor ids; every subtree is a path prefix |
| **Subtree** | A channel node and every row at or below it; identified by the node's path prefix |
| **Home** | Deepest non-null channel ancestor of a product row, with organization as fallback |
| **Frontier** | Newest sequence position represented by a channel summary; frontiers only move forward |
| **Summary** | Frontier, counts, and timestamps denormalized onto a channel row, so one read answers for a whole subtree |
| **View** | The slice of the product stream a client tracks (prefixes, entity types, depth, cursor); the unit catchup authorizes and answers |
| **Cursor** | Latest sequence position a view has ingested |
| **Range fetch** | Ordinary list request bounded by `seqCursor` |
| **Tombstone** | Soft-deleted row that remains fetchable so absent clients learn the deletion |
| **`stx`** | Envelope on every product write (mutation ID, source ID, per-field HLC timestamps) so the server can arbitrate merges and a tab can recognize its own echo |

## Data flow example

Consider renaming attachment `a42` inside `org1`.

1. The tab optimistically patches every cached query containing `a42` and sends the ordinary update request. `ops` contains changed fields; `stx` identifies the attempt and supplies the scalar field timestamps used for merge arbitration.
2. The API drops scalar values with older timestamps, applies the remaining update, and returns the authoritative row. The initiating cache reconciles against that response.
3. Postgres commits the row to the WAL.
4. The CDC worker preserves commit order, records the audit activity, reserves the next organization sequence position, stamps the row, and updates channel summaries.
5. The worker sends the change to the API over the protected internal WebSocket. The API invalidates its detail cache and emits the change to the stream dispatcher.
6. Dispatch checks the full row with the same permission engine used by REST reads. Allowed subscribers receive a lightweight SSE notification containing the entity ID, path, sequence range, and `stx`.
7. The originating tab recognizes its `sourceId` and only patches cached `stx`. Other clients fetch the notified sequence range through the list endpoint and patch their caches.

Reconnect uses the same fetch path. If a view cursor is `3` and its frontier is `7`, the client requests `?seqCursor=4`; live rows are upserted, tombstones removed, and the cursor advances to `7` only after ingest.

## Server

### Ordering

The CDC worker consumes PostgreSQL logical replication. It preserves transaction boundaries so cascaded child deletes can be suppressed, then micro-batches committed events by type and action. Product batches are split by `(path, entityType)` so each notification describes one audience. Channel rows store their path as a generated column; product paths are computed where needed.

Commit order is sequence order across product types. A batch range can still contain positions used by other product types or paths, so `count` is the authoritative batch size; never infer it from sequence-range arithmetic.

The API accepts the worker only at `/internal/cdc`. The endpoint requires the shared secret, restricts production sources to loopback or the deployment VPC, permits one connection, and closes idle peers after 90 seconds. The full replication pipeline and delivery semantics live in the [CDC worker](../cdc/README.md).

### Counters

For each organization batch, the worker reserves a contiguous sequence range and stamps product rows in WAL order. It also updates `channel_counters`:

Key naming follows a uniform grammar: `<domain>:<metric>:[home?:]<type|role>`. The domain is `e` (entity metrics) or `m` (membership metrics); the metric is `f` (frontier), `c` (count), or `li`/`lu` (timestamps); an `h` segment marks a **home-only** (self) summary, and its absence means the **subtree** aggregate (rows at or below this node). `{type}` is the product entity type.

Each subtree key is written to the row's home node and every ancestor up to the organization, so a single read at any node answers for its whole subtree; each home-only key is written only to the home node. Singletons `sequence` and `membership` live on the organization row.

| Key | Scope | Meaning |
| --- | --- | --- |
| `sequence` | Org-wide | Sequence reservation counter |
| `membership` | Org-wide | Bump-only membership change signal |
| `e:f:{type}` | Subtree | Frontier sequence of rows at or below the node |
| `e:f:h:{type}` | Home-only | Frontier sequence of rows homed exactly at the node |
| `e:c:{type}` | Subtree | Count of countable rows at or below the node |
| `e:c:h:{type}` | Home-only | Count of countable rows homed exactly at the node |
| `e:li:h:{type}` / `e:lu:h:{type}` | Home-only | Last insert and update timestamps |
| `m:c:{role}` / `m:c:total` / `m:c:pending` | Channel | Membership counts |

### Drafts

Product tables that opt into drafts use a PostgreSQL publication row filter:

- Publishing changes an excluded row into an included row, so replication emits an insert. That insert becomes the row's sync birth and receives its first sequence stamp.
- Unpublishing keeps the database row as a draft, but replication emits a delete containing the old published row because it left the filtered publication. Existing readers receive delete-style cache invalidation.
- Draft creates, edits, and deletes do not reach the worker.
- Soft-deleting a published row keeps it inside the publication. It flows as an update tombstone.

Channel tables are not filtered. Their `publishedAt` value controls invitees, not replication. A worker entrance check and a dispatch veto reject drafts if an app adds a draft column without regenerating the publication. API reads continue to apply their published-row predicate because drafts still exist in the table.

### Moves

When an update changes a product path, the worker includes the permission-relevant part of the old row. Dispatch compares readability at the old and new locations:

- Readers of both locations receive a normal update and route the row to its new caches.
- Readers of only the old location receive `moveOut` with the old path. The notification itself removes the row because no later range fetch can return it to them.

A publish combined with a reparent arrives as an insert without an old row, so it produces no `moveOut`. Readers of the old location never saw the draft.

### Repair

Counter recalculation rebuilds the organization sequence, frontier and count families, activity timestamps, and canonical channel paths from table data. It uses the same live-and-published predicates as CDC. Historical sequence stamps on old drafts are ignored.

## Access

Sync authorization has two layers. **Row readability** decides whether a user may fetch a row: list reads, range fetches, SSE dispatch, and detail-cache hits all run the same permission engine against full rows, in three directions:

- A membership grant covers rows homed at that channel.
- Only elevated roles reach downstream below their grant level.
- Grants do not reach upstream. Upstream access comes from an ancestor membership of its own.

Dispatch serializes each notification once and evaluates it against indexed membership data.

**Summary answerability** decides whether a user may see aggregate frontiers and counts for a view. Summaries reveal that activity exists even without revealing content, so they need stronger proof. Catchup assigns each view one status:

| Status | Meaning | Client behavior |
| --- | --- | --- |
| `ok` | Every prefix is proven for the requested depth | Use frontiers, counts, and range fetches |
| `opaque` | Rows may be readable, but the summary is not fully proven | Reveal no numbers; refetch cached active lists |
| `forbidden` | User has no readable scope in the organization | Drop the view |

A direct unconditional membership proves a `self` view at that node. A `subtree` view also needs a subtree-scoped grant, such as an elevated role at the node or a grant at the deepest hierarchy level. Prefix sets are proven one prefix at a time.

Canonical ancestry comes from `channel_counters.path`, never from a client claim. A forged or stale prefix returns `opaque`, not `forbidden`, and will self-correct when the client declares its views again. This avoids using the status as an existence oracle.

### Deep example

For depth-sensitive behavior, imagine an app with `organization -> course -> section -> project`. Its product is an item. Staff roles are elevated; members are not. Ada is an organization admin, Sam is course staff, and Maya is a course member with membership in one project.

| View | Ada | Sam | Section staff | Maya | Course member |
| --- | --- | --- | --- | --- | --- |
| Course self | `ok` | `ok` | `ok` via ancestor membership | `ok` | `ok` |
| Course subtree | `ok` | `ok` | `opaque` | `opaque` | `opaque` |
| Section self | `ok` | `ok` via subtree grant | `ok` | `ok` via membership | `opaque` |
| Section subtree | `ok` | `ok` via subtree grant | `ok` | `opaque` | `opaque` |
| Project | `ok` | `ok` via subtree grant | `ok` via subtree grant | `ok` | `opaque` |

Views should be declared where grants live. Organization-wide and elevated grants produce subtree views; home-scoped grants produce self views; a set of granted homes can produce one prefix-set view. Conditional grants do not produce precise summary views. Changing a view's prefixes, entity types, or depth resets its cursor because new coverage may contain history older than the previous cursor.

Membership state and content cursors advance independently. Cella narrows that gap with per-request membership snapshots, a membership refresh before live dispatch, and view answers computed from current grants, but provides no snapshot consistency tokens. Read [Permissions](./PERMISSIONS.md) for the complete policy model and enforcement paths.

## Client

### Notifications

Membership changes invalidate membership and channel queries. Product notifications enter sequence sync in four shapes:

| Shape | Detection | Behavior |
| --- | --- | --- |
| Single row | `seq` set, no `batchUntilSeq` | Fetch that position and patch caches |
| Batch | `batchUntilSeq` set | Fetch the inclusive range and patch all returned rows |
| Delete-style removal | `action: 'delete'` | Mark the detail stale and invalidate scoped lists because no sync-visible row remains to fetch |
| Move-out | `action: 'moveOut'` | Remove the row from caches and unseen tracking immediately |

A non-delete notification with this tab's `stx.sourceId` is an echo. The tab keeps its optimistic or server response and patches only `stx`. Deletes are not echo-skipped because their `stx` may identify an earlier writer. Echo handling returns before cursor advancement, so later catchup can safely fetch the same position again.

### Catchup

The client opens SSE and posts its cursor and views when the server's `offset` event arrives. The server authorizes each prefix and returns view statuses, permitted frontiers and counts, organization membership signals, and any embedding hints. Once catchup is processed, the stream goes live.

- A first connection stores permitted frontiers as baselines. Route loaders own initial data.
- An `ok` view behind its frontier fetches changed rows once per product type. Child-homed rows are included and routed into matching caches. Full chunks and failed requests fall back to active-list invalidation.
- An `opaque` view invalidates its cached active lists. A `forbidden` view is removed.
- Tombstones remove rows from detail and list caches.
- Membership lists refresh only where the organization membership signal changed.
- Channel lists, `me`, and the current user's memberships refresh when catchup finds any change.
- Embedding propagation runs after the organization's range fetches.

Background channels may defer their range fetch to the fetch prioritizer and advance when the scheduled work completes.

A connection covers the organizations visible when it opens, plus a per-user channel that carries self-membership events. A membership in a new organization therefore reaches the user live, and the client reconnects to register that organization's channel and catch up on its history.

### Fetch prioritization

Live notifications are fetched according to a delay negotiated by client priority and server load:

```text
delay = clamp(client minimum, deterministic jitter within spreadWindow, client maximum)
```

The client uses three priority tiers:

- A viewed channel fetches immediately.
- A muted or archived channel fetches when opened.
- Other channels fetch in the background between 2 and 30 seconds.

At organization level, route state identifies the viewed channel; deeper, observed list queries do, because a page can render channels its route does not name. Prefetches create no observers, and unmounting removes observation.

The server's `spreadWindow` grows with the online audience and database pool pressure, capped at 120 seconds. Deterministic jitter spreads clients across that window. The fetch prioritizer merges contiguous ranges per product type and home channel; new notifications never postpone an earlier deadline. It also flushes when navigation enters a channel, a channel gains its first observer, the tab hides, or the browser returns online.

At flush time, every due channel of one organization and product type shares a single covering fetch: the merged bounded range, narrowed with a `pathPrefix` when a registered channel-path resolver can prove a common true ancestor for all due channels (apps; the template always fetches org-wide). Returned rows route to their home lists during patching, and each covered channel advances to the shared upper bound.

Each channel view records both the newest known position and the successfully ingested position. Fetches start after the ingested cursor, so small live gaps repair themselves. Repeated failures fall back to targeted invalidation and advance, preventing a range from looping forever.

Apps derive per-user state by subscribing to the two signals in `query/realtime/sync-signals.ts`, `onChangeEvent` on every readable notification and `onSyncedRows` once a range settles, rather than adding logic to the prioritizer. Unseen tracking is one such subscriber.

### Freshness

After SSE reaches live state, background fill loads product queries for the current organization. Other organizations are filled only when `offlineAccess` is enabled. That flag also decides cache lifetime: on, the cache survives a browser restart; off, it survives a refresh but clears when the tab closes. If the stream fails, query-level mount behavior, reconnect refetching, and pull-to-refresh remain available.

Synced product queries use infinite stale time while the stream is healthy, so catchup owns their freshness and route-loader prefetches reuse already-synced lists instead of refetching them. Only a failed stream drops those queries to a five minute fallback. Other queries keep the global 30-second default. With `offlineAccess`, that global default becomes infinite while the device is offline.

### Count checks

Server view counts are shared totals while cached lists can be permission-filtered, so the client never compares those two values. It compares each catchup's total against the last one it saw, and invalidates a matching cached list when that total moved. This is the safety net that eventually repairs a missed removal, such as an unpublish or a physical delete. Normal deletion stays soft, so its sequence-stamped tombstone catches clients up directly.

### Unseen tracking

Unseen badges are updated from delivered rows instead of recounting after every notification. The client mirrors the server predicate: inside the shared time window, published, not deleted, and not locally seen. New qualifying rows increment, tombstones decrement, and marking a row seen decrements once. ID guards and a reconciliation timestamp prevent double counting.

The exact count endpoint is used for baselines and reconciliation after staleness, focus changes, and catchup. Its result replaces the estimate. Cross-device seen marks are reconciled here because `seen_by` does not enter CDC. Seen-tracked types require unconditional channel read; types with conditional row visibility must keep endpoint counting.

### Embeddings

A product can reference other products by holding their ids in an array column. Imagine a `post` product whose rows carry an `attachmentIds` column: the post is the **host**, each attachment is **embedded**. The relationship is declared in `appConfig.productEmbeddings` as `hostProduct`, `embeddedProduct`, and `hostColumn`. The template configures none, so nothing below applies until an app adds one.

Host and embedded rows sync independently, each on its own sequence and frontier, so a change to one never carries the other along. Cache patching therefore runs in two directions.

**An embedded row changes.** The server includes the changed embedded-product ids in live notifications and catchup responses, so the client can patch the copies held inside cached host products without refetching every host row. An `updatedAt` guard prevents an older embedded copy from replacing a newer one. Live propagation runs after the embedded-product range fetch; catchup propagation runs after all range fetches for the organization. A same-tab echo returns before propagation, so that mutation must update host products itself or wait for later reconciliation.

**A host row changes.** The host is the only writer of the reference, so anything an app derives per embedded row, such as a usage count, goes stale invisibly: the embedded row never changed, so no range fetch returns the new value. Ingesting a host range therefore compares each fetched row's embedding columns against the cached copy and refetches the lists holding the embedded rows whose references changed, narrowed to their home channels. Only added and removed ids matter, so an edit that leaves the column alone costs nothing, and a host row the client never cached counts as touching every id it carries.

Sometimes the client invalidates a host list rather than ingesting its rows. With no rows to compare, it cannot tell which references changed, so it invalidates the embedded products' lists alongside the host list. That happens on a first connection, on an opaque view, when nothing is cached to patch, or when delivery fails.

Either way, the client never derives the count itself; the authoritative number always comes back from the list endpoint.

## Writes

Product mutations keep form code simple by owning optimistic updates and replay wiring in their query module:

1. `onMutate` optimistically patches matching list and detail caches.
2. The mutation runs with React Query `networkMode: 'offlineFirst'`.
3. Success merges the authoritative server row.
4. Failure follows module and global error handling, including optimistic rollback where configured.

Two boundaries matter:

- An edit attempted offline retries network errors only (backoff sized to outlast the connectivity probe), then pauses at a retry boundary and enters the persisted replay queue. Server errors, any HTTP status, settle immediately without queueing.
- Mutations restored in a paused state wait for the first catchup attempt before replay. Ordinary online writes do not wait for stream state.

### Merge metadata

Synced tables store the latest `stx` envelope and merged timestamps for scalar fields:

```text
HLC: 1710500000123:0001:abcde
     unix millis : counter : source hash
```

Comparison uses milliseconds, then counter, then the five-character source tie-breaker. Each tab advances its own clock. The server advances its module clock from received timestamps before generating server timestamps. Clients do not advance their clocks from remote values, so this is deterministic last-writer-wins ordering rather than a full causal clock.

Update operations use value shape to select merge behavior:

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

Update schemas require `fieldTimestamps` to match the scalar operation keys exactly. Missing, unrelated, malformed, and array-delta timestamps are rejected.

The server omits scalar values that lose HLC comparison and returns the authoritative row; it does not return a conflict response. Trusted server updates advance beyond stored scalar clocks and assign one server HLC.

Array deltas remove first and then add missing values. Replaying the same delta is idempotent, but the operation is not a commutative CRDT. Opposite concurrent operations are order-sensitive, and the resolved array is written as a whole value.

Merge resolution is not a SQL compare-and-set and does not lock the read row with `FOR UPDATE`. Overlapping updates can therefore race, especially whole-array writes and `stx` metadata.

### Paused writes

Paused mutations are persisted to IndexedDB and survive a reload, so mutation variables must carry all routing data to replay: hook closures no longer exist afterwards. The attachment module wires this correctly. Variables carry routing context, the same mutation functions are registered as replay defaults, and `stx` is minted at intent time and stored in the variables, so a persisted replay reuses the original mutation ID and field timestamps while direct calls without one mint a fresh `stx`. Only mutations already marked `isPaused` are dehydrated, a state reached through the retry pause boundary on connectivity failures.

While offline, before a queued mutation has completed a server round trip, the queue itself is rewritten:

- **Squash** folds queued same-entity updates into the outgoing request, so an offline edit A followed by edit B replays as one merged update.
- **Coalesce** absorbs an update over a still-queued create into that create, matching both the top-level `id` and batch `data[]` shapes, and issues no separate update.
- **Cancel** drops a still-queued create along with its pending updates when the entity is deleted, and finishes the deletion cache-side.

Persisted variables are also rewritten during schema evolution. Idempotency is operation-specific: attachment create checks its mutation ID against the stored `stx` on the attachments table and can return an existing batch, while update and delete do not.

## Resilience

### Schema changes

Old PWA tabs can retain old cache rows and mutation variables while a new server shape is already deployed. Append-only schema lenses normalize old writes on the server and migrate persisted client state before use. Tabs coordinate migration through a Web Lock and stop persisting when they detect a newer schema version. Lens contraction timing remains policy rather than an automated gate. Read [Schema evolution](./SCHEMA_EVOLUTION.md) for the rollout model, contracts, telemetry, and CI checks.

### Multiple tabs

The first tab to acquire the Web Lock becomes leader, owns SSE, and forwards notifications through BroadcastChannel. A follower is promoted when the leader closes. All tabs can mutate.

With `offlineAccess`, tabs share the durable query scope; session mode uses one scope per tab. Each tab keeps its own paused-mutation queue, so tabs never overwrite each other's writes, and a restoring tab also absorbs the queues of tabs that died. Replay is idempotent, so absorbing the same queue twice is safe.

### Detail cache

The server keeps an authenticated TTL cache for enriched product detail responses, keyed by entity type and ID. Cache hits recheck permission and draft visibility. Misses coalesce concurrent requests for the same entity. CDC invalidates changed entries, including batch rows and physical deletes, so the next request re-enriches the response.

Defaults are 5,000 entries, roughly 25 to 50 MB of memory, and a 10-minute TTL. The same cache is not used for list fan-out; client scheduling handles that pressure.

### Yjs

Yjs collaboration is optional and disabled in the template. When enabled, the relay is the single writer for registered rich-text fields during a session and persists through the standard product update path. Clients suppress SSE replacement of fields currently owned by an editor while other fields continue syncing normally. Read the [Yjs worker](../yjs/README.md) document for sessions, materialization, durability, and constraints.

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

The request contains a stream cursor and views shaped as `{ key, organizationId, prefixes, entityTypes, depth?, cursor }`. `depth` is `self` or `subtree` and defaults to `subtree`. The response contains view answers, organization change summaries, and the stream cursor.

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

`seqCursor=51,150` means the inclusive bounded range; it is the only form. Range fetches may also carry `pathPrefix` to narrow the read to one channel subtree.

In hierarchies deeper than `organization -> channel`, a read covered by a `channelId` must AND a subtree predicate over the denormalized ancestor id columns on top of the permission-derived read scope; `buildSubtreeCoverWhere` in `backend/src/db/utils/subtree-cover.ts` builds it. Never fold the covering id into the permission scope itself: an intermediate grant would then widen the read past the requested subtree.

### Influences

[ElectricSQL](https://electric-sql.com/) influenced shape-based PostgreSQL sync; [LiveStore](https://livestore.io/) event-oriented local state; [Sequin](https://sequinstream.com/) ordered CDC; [TinyBase](https://tinybase.org/) HLC design; [Yjs](https://github.com/yjs/y-protocols) collaborative protocols; and [Teleportal](https://teleportal.tools/) local-first architecture. Browser primitives come from [Hono SSE](https://hono.dev/docs/helpers/streaming#stream-sse) and [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
