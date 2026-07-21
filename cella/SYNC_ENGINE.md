# Cella sync engine

Cella keeps product data current in React Query through a notify-then-fetch design:

```text
Postgres commit -> CDC sequence stamp -> SSE notification -> REST range fetch -> cache patch
```

The engine reuses the application's Postgres schema, OpenAPI endpoints, permission checks, and React Query cache. There is no sync-owned schema, parallel authorization layer, or second client store. Developers keep using ordinary REST operations while the sync layer adds ordering, reconnect catchup, live cache updates, and conflict metadata.

This document explains that shared model and its guarantees. For implementation detail, continue with [Permissions](./PERMISSIONS.md), [CDC worker](../cdc/README.md), [Schema evolution](./SCHEMA_EVOLUTION.md), [Yjs relay](../yjs/README.md), or [Add entity](./ADD_ENTITY.md).

## Selective sync

Cella distinguishes two entity kinds:

| Entity kind | Sync behavior | Template example |
| --- | --- | --- |
| `ChannelEntityType` | REST CRUD, memberships, permission boundaries, server IDs | `organization` |
| `ProductEntityType` | Sequence stamps, realtime notifications, range catchup, optimistic merge metadata | `attachment` |

The template ships the minimal hierarchy `organization -> attachment`. Forks can add deeper channel hierarchies, draft lifecycles, embedded entities, and Yjs-backed fields without changing the core flow.

Cached reads can persist for offline use. Offline writes queue as paused mutations: network failures retry briefly and pause once the client reports offline, then persist for replay. Server errors never queue. See [Writes](#writes) for the exact boundary and its edges.

The core concepts are:

| Concept | Meaning |
| --- | --- |
| **Home** | Deepest non-null channel ancestor of a product row, with organization as fallback |
| **Path** | Materialized root-first channel ID path; every subtree is a path prefix |
| **Subtree** | A channel node and every row at or below it; identified by the node's path prefix |
| **Sequence** | One monotonic counter per organization, shared by all product entity types |
| **Summary** | Denormalized aggregate stored on a channel row: frontier, counts, and timestamps |
| **Frontier** | Newest sequence position represented by a channel summary |
| **View** | Prefixes, entity types, depth, and a client cursor |
| **Cursor** | Latest sequence position a view has ingested |
| **Delta fetch** | Ordinary list request bounded by `seqCursor` |
| **Tombstone** | Soft-deleted row that remains fetchable so absent clients learn the deletion |
| **`stx`** | Mutation ID, browser source ID, and per-field HLC timestamps |

Five rules explain most behavior:

1. Every product change takes the next organization sequence position. Commit order is sequence order across product types.
2. A product's location is its materialized path. Subtrees are prefixes, so routing needs no recursive hierarchy query.
3. Channel summaries aggregate the newest sequence and row counts. Frontiers only move forward.
4. Clients compare view cursors with frontiers, fetch missing ranges, and advance only after ingesting the response.
5. The product stream contains fetchable rows only. Publication filters exclude drafts, and SSE dispatch checks row permission for every subscriber.

## Data flow example

Consider renaming attachment `a42` inside `org1`.

1. The browser optimistically patches every cached query containing `a42` and sends the ordinary update request. `ops` contains changed fields; `stx` identifies the attempt and supplies the scalar field timestamps used for merge arbitration.
2. The API drops scalar values with older timestamps, applies the remaining update, and returns the authoritative row. The initiating cache reconciles against that response.
3. Postgres commits the row to the WAL.
4. The CDC worker preserves commit order, records the audit activity, reserves the next organization sequence position, stamps the row, and updates channel summaries.
5. The worker sends the change to the API over the protected internal WebSocket. The API invalidates its detail cache and emits the change to the stream dispatcher.
6. Dispatch checks the full row with the same permission engine used by REST reads. Allowed subscribers receive a lightweight SSE notification containing the entity ID, path, sequence range, and `stx`.
7. The originating browser recognizes its `sourceId` and only refreshes cached `stx`. Other browsers fetch the notified sequence range through the list endpoint and patch their caches.

The same change has four names at four transport layers:

| Term             | Layer                                   |
| ---------------- | --------------------------------------- |
| **Activity**     | Persisted database audit/history record |
| **Message**      | CDC worker payload sent to the API      |
| **Event**        | In-process API emission                 |
| **Notification** | SSE payload sent to browsers            |

Reconnect uses the same fetch path. If a view cursor is `3` and its frontier is `7`, the client requests `?seqCursor=4`; live rows are upserted, tombstones removed, and the cursor advances to `7` only after ingest.

Live delivery and reconnect catchup therefore share one primitive: compare a cursor with a known position, fetch the missing range for each product type, then advance.

## Server

### Ordering

The CDC worker consumes PostgreSQL logical replication. It preserves transaction boundaries so cascaded child deletes can be suppressed, then micro-batches committed events by type and action. Product batches are split by `(path, entityType)` so each notification describes one audience.

All product types share the organization sequence. A batch range can therefore contain positions used by other product types or paths. `count` is the authoritative batch size; never infer it from sequence-range arithmetic.

The API accepts the worker only at `/internal/cdc`. The endpoint requires the shared secret, restricts production sources to loopback or the deployment VPC, permits one connection, and closes idle peers after 90 seconds. The full replication pipeline and delivery semantics live in the [CDC worker README](../cdc/README.md).

### Counters

For each organization batch, the worker reserves a contiguous sequence range and stamps product rows in WAL order. It also updates `channel_counters`:

Key naming follows a uniform grammar: `<domain>:<metric>:[home?:]<type|role>`. The domain is `e` (entity metrics) or `m` (membership metrics); the metric is `f` (frontier), `c` (count), or `li`/`lu` (timestamps); an `h` segment marks a **home-only** (self) summary, and its absence means the **subtree** aggregate (rows at or below this node). `{type}` is the product entity type. Each subtree key is written to the row's home node and every ancestor up to the organization, so a single read at any node answers for its whole subtree; each home-only key is written only to the home node. The two bare singletons `sequence` and `membership` live on the organization row.

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

Frontier and timestamp keys keep their maximum. Count keys sum and are floored at zero. A row's home controls self summaries, audience grouping, activity stamps, and unseen counts. It does not control sequence allocation. `channel_counters` stores current summaries; the activities table stores history.

### Drafts

Product tables that opt into drafts use a PostgreSQL publication row filter:

- Publishing changes an excluded row into an included row, so replication emits an insert. That insert becomes the row's sync birth and receives its first sequence stamp.
- Unpublishing emits a delete containing the old published row. Existing readers receive normal hard-delete invalidation.
- Draft creates, edits, and deletes do not reach the worker.
- Soft-deleting a published row keeps it inside the publication. It flows as an update tombstone.

Channel tables are not filtered. Their `publishedAt` value controls invitees, not replication. A worker entrance check and a dispatch veto reject drafts if a fork adds a draft column without regenerating the publication. API reads continue to apply their published-row predicate because drafts still exist in the table.

### Moves

When an update changes a product path, the worker includes the permission-relevant part of the old row. Dispatch compares readability at the old and new locations:

- Readers of both locations receive a normal update and route the row to its new caches.
- Readers of only the old location receive `moveOut` with the old path. The notification itself removes the row because no later delta fetch can return it to them.

A publish combined with a reparent arrives as an insert without an old row, so it produces no `moveOut`. Readers of the old location never saw the draft.

### Repair

Counter recalculation rebuilds the organization sequence, frontier and count families, activity timestamps, and canonical channel paths from table data. It uses the same live-and-published predicates as CDC. Historical sequence stamps on old drafts are ignored.

Dispatch serializes each notification once and uses indexed membership data for permission checks. An SSE connection covers the organizations visible when it opens, plus a per-user channel that carries self-membership events. A membership in a new organization therefore reaches the user live, and the client reconnects to register that organization's channel and catch up on its history.

## Access

Sync authorization has two layers. **Row readability** decides whether a user may fetch a row: list reads, delta fetches, SSE dispatch, and detail-cache hits all run the same permission engine against full rows, in three directions:

- A membership grant covers rows homed at that channel.
- Only elevated roles reach downstream below their grant level.
- Grants do not reach upstream. Upstream access comes from an ancestor membership of its own.

**Summary answerability** decides whether a user may see aggregate frontiers and counts for a view. Summaries reveal that activity exists even without revealing content, so they need stronger proof. Catchup assigns each view one status:

| Status | Meaning | Client behavior |
| --- | --- | --- |
| `ok` | Every prefix is proven for the requested depth | Use frontiers, counts, and range fetches |
| `opaque` | Rows may be readable, but the summary is not fully proven | Reveal no numbers; refetch cached active lists |
| `forbidden` | User has no readable scope in the organization | Drop the view |

A direct unconditional membership proves a `self` view at that node. A `subtree` view also needs a subtree-scoped grant, such as an elevated role at the node or a grant at the deepest hierarchy level. Prefix sets are proven one prefix at a time.

Canonical ancestry comes from `channel_counters.path`, never from a client claim. A forged or stale prefix returns `opaque`, not `forbidden`, and will self-correct when the client declares its views again. This avoids using the status as an existence oracle.

### Deep example

For depth-sensitive behavior, imagine a fork with `organization -> course -> section -> project`. Its product is an item. Staff roles are elevated; members are not. Ada is an organization admin, Sam is course staff, and Maya is a course member with membership in one project.

| View | Ada | Sam | Section staff | Maya | Course member |
| --- | --- | --- | --- | --- | --- |
| Course self | `ok` | `ok` | `ok` via ancestor membership | `ok` | `ok` |
| Course subtree | `ok` | `ok` | `opaque` | `opaque` | `opaque` |
| Section self | `ok` | `ok` via subtree grant | `ok` | `ok` via membership | `opaque` |
| Section subtree | `ok` | `ok` via subtree grant | `ok` | `opaque` | `opaque` |
| Project | `ok` | `ok` via subtree grant | `ok` via subtree grant | `ok` | `opaque` |

A view over Maya's granted project prefixes can be `ok` even though a view over the whole course subtree remains `opaque`.

Views should be declared where grants live. Organization-wide and elevated grants produce subtree views; home-scoped grants produce self views; a set of granted homes can produce one prefix-set view. Conditional grants do not produce precise summary views. Changing a view's prefixes, entity types, or depth resets its cursor because new coverage may contain history older than the previous cursor.

Membership state and content cursors advance independently. Cella narrows that gap with per-request membership snapshots, a membership refresh before live dispatch, and view answers computed from current grants. It does not provide snapshot consistency tokens. Read [Permissions](./PERMISSIONS.md) for the complete policy model and enforcement paths.

## Client

### Notifications

Clients branch on notification kind first. Membership changes invalidate membership and channel queries. Product notifications enter sequence sync in four shapes:

| Shape | Detection | Behavior |
| --- | --- | --- |
| Single row | `seq` set, no `batchUntilSeq` | Fetch that position and patch caches |
| Batch | `batchUntilSeq` set | Fetch the inclusive range and patch all returned rows |
| Hard delete | `action: 'delete'` | Invalidate the scoped list because there is no row to fetch |
| Move-out | `action: 'moveOut'` | Remove the row from caches and unseen tracking immediately |

A non-delete notification with this tab's `stx.sourceId` is an echo. The tab keeps its optimistic or server response and patches only `stx`. Deletes are not echo-skipped because their `stx` may identify an earlier writer. Echo handling returns before cursor advancement, so later catchup can safely fetch the same position again.

### Catchup

The client opens SSE first and buffers arriving notifications, then posts its cursor and views when the server's `offset` event arrives. The server authorizes each prefix and returns view statuses, permitted frontiers and counts, organization membership signals, and any embedding hints. After processing, the buffered notifications drain in arrival order and the stream goes live — a change committed while catchup reads is either in the answer or in the buffer, never lost in a registration window.

- A first connection stores permitted frontiers as baselines. Route loaders own initial data.
- An `ok` view behind its frontier fetches changed rows once per product type. Child-homed rows are included and routed into matching caches. Full chunks and failed requests fall back to active-list invalidation.
- An `opaque` view invalidates its cached active lists. A `forbidden` view is removed.
- Tombstones remove rows from detail and list caches.
- Membership lists refresh only where the organization membership signal changed.
- Channel lists, `me`, and the current user's memberships refresh when catchup finds any change.
- Embedding propagation runs after the organization's range fetches.

The cursor advances only after successful ingest. Background channels may defer that fetch to the fetch prioritizer and advance when the scheduled work completes.

### Fetch prioritization

Live notifications are fetched according to a delay negotiated by client priority and server load:

```text
delay = clamp(client minimum, deterministic jitter within spreadWindow, client maximum)
```

The client uses three priority tiers:

- A viewed channel fetches immediately.
- A muted or archived channel fetches when opened.
- Other channels fetch in the background between 2 and 30 seconds.

At organization level, route state identifies the viewed channel. Below that level, observed list queries identify it because a page can render channels not named in its route. Prefetches create no observers, and unmounting removes observation.

The server's `spreadWindow` grows with the online audience and database pool pressure, capped at 120 seconds. Deterministic jitter spreads clients across that window. The fetch prioritizer merges contiguous ranges per product type and home channel; new notifications never postpone an earlier deadline. It also flushes when navigation enters a channel, a channel gains its first observer, the tab hides, or the browser returns online.

At flush time, every due channel of one organization and product type shares a single covering fetch: the merged bounded range, narrowed with a `pathPrefix` when a registered channel-path resolver can prove a common true ancestor for all due channels (forks; the template always fetches org-wide). Returned rows route to their home lists during patching, and each covered channel advances to the shared upper bound.

Each channel view records both the newest known position and the successfully ingested position. Fetches start after the ingested cursor, so small live gaps repair themselves. Repeated failures fall back to targeted invalidation and advance, preventing a range from looping forever.

### Freshness

After SSE reaches live state, background fill loads product queries for the current organization. Other organizations are filled only when `offlineAccess` is enabled. If the stream fails, query-level mount behavior, reconnect refetching, and pull-to-refresh remain available.

Synced product queries use infinite stale time while SSE is live and five minutes while disconnected. Other queries keep the global 30-second default. With `offlineAccess`, that global default becomes infinite while the device is offline.

| Concern | `offlineAccess` on | `offlineAccess` off |
| --- | --- | --- |
| Cache persistence | Survives browser restart | Survives refresh; cleared when the tab closes |
| Current organization sync | Yes | Yes |
| Other organization fill | Yes | No |
| Membership live and catchup refresh | Yes | Yes |

### Count checks

Server view counts are shared totals while cached lists can be permission-filtered, so the client never compares those two values. It instead remembers the last server total for this browser session. If a later catchup reports a different total while a matching list is cached, that active list is invalidated. The first observation establishes a baseline, and reload clears it. This also eventually repairs missed hard deletes.

### Unseen tracking

Unseen badges are updated from delivered rows instead of recounting after every event. The client mirrors the server predicate: inside the shared time window, published, not deleted, and not locally seen. New qualifying rows increment, tombstones decrement, and marking a row seen decrements once. ID guards and a reconciliation timestamp prevent double counting.

The exact count endpoint is used for baselines and reconciliation after staleness, focus changes, and catchup. Its result replaces the estimate. Cross-device seen marks are reconciled here because `seen_by` does not enter CDC. Seen-tracked types require unconditional channel read; types with conditional row visibility must keep endpoint counting.

### Embeddings

Products can embed other entities. The server includes changed source IDs in live notifications and catchup responses so the client can patch cached hosts without fetching every host row. The relationship is configured in `appConfig.entityEmbeddings`, and an `updatedAt` guard prevents an older source from replacing a newer embedded copy.

Live propagation runs after the source range fetch; catchup propagation runs after all range fetches for the organization. A same-tab echo returns before propagation, so that mutation must also update embedded hosts or wait for later reconciliation. The template ships with no embedding relationships configured.

## Writes

Product mutations keep form code simple by owning optimistic updates and replay wiring in their query module:

1. `onMutate` optimistically patches matching list and detail caches.
2. The mutation runs with React Query `networkMode: 'offlineFirst'`.
3. Success merges the authoritative server row.
4. Failure follows module and global error handling, including optimistic rollback where configured.

Three boundaries matter:

- Online writes can still race because merge persistence is a read, compute, and update sequence.
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

The server omits scalar values that lose HLC comparison and returns the authoritative entity; it does not return a conflict response. Trusted server updates advance beyond stored scalar clocks and assign one server HLC.

Array deltas remove first and then add missing values. Replaying the same delta is idempotent, but the operation is not a commutative CRDT. Opposite concurrent operations are order-sensitive, and the resolved array is written as a whole value.

Merge resolution is not a SQL compare-and-set and does not lock the read row with `FOR UPDATE`. Overlapping updates can therefore race, especially whole-array writes and `stx` metadata.

### Paused writes

The infrastructure can squash pending updates, coalesce an update into a pending create, persist paused mutations to IndexedDB, and rewrite persisted variables during schema evolution; since hook closures no longer exist after reload, mutation variables must carry all routing data to replay. The attachment module wires this correctly: variables carry routing context, the same mutation functions are registered as replay defaults, and `stx` is minted at intent time and stored in the variables, so a persisted replay reuses the original mutation ID and field timestamps while direct calls without one mint a fresh `stx`. Only mutations already marked `isPaused` are dehydrated, a state reached through the retry pause boundary on connectivity failures. Squash and coalesce run while offline, before a queued mutation has completed a server round trip: cross-update squash folds queued same-entity updates into the outgoing request, so an offline edit A followed by edit B replays as one merged update; an update over a still-queued create coalesces into that create, matching both the top-level `id` and batch `data[]` shapes, and issues no separate update; and deleting a still-queued create cancels it along with its pending updates and finishes the deletion cache-side. Idempotency is operation-specific: attachment create checks its mutation ID against the stored `stx` on the attachments table and can return an existing batch, while update and delete do not.

## Resilience

### Schema changes

Old PWA tabs can retain old cache rows and mutation variables while a new server shape is already deployed. Append-only schema lenses normalize old writes on the server and migrate persisted client state before use. Tabs coordinate migration through a Web Lock and stop persisting when they detect a newer schema version. Lens contraction timing remains policy rather than an automated gate. Read [Schema evolution](./SCHEMA_EVOLUTION.md) for the rollout model, contracts, telemetry, and CI checks.

### Multiple tabs

The first tab to acquire the Web Lock becomes leader, owns SSE, and forwards notifications through BroadcastChannel. A follower is promoted when the leader closes. All tabs can mutate.

With `offlineAccess`, tabs share the durable query scope; session mode uses one scope per tab. Every tab persists its own paused mutations in a per-tab record keyed by its session id, so tab writes never overwrite each other's queues. On restore, a tab unions its own record with records of dead tabs (liveness via a per-tab Web Lock, with an age fallback), absorbing crashed tabs' queued work. Two tabs restoring the same dead record concurrently can double-replay; intent-time `stx` makes that resolve idempotently.

### Detail cache

The server keeps an authenticated TTL cache for enriched product detail responses, keyed by entity type and ID. Cache hits recheck permission and draft visibility. Misses coalesce concurrent requests for the same entity. CDC invalidates changed entries, including batch rows and physical deletes, so the next request re-enriches the response.

Defaults are 5,000 entries, roughly 25 to 50 MB of memory, and a 10-minute TTL. The same cache is not used for list fan-out; client scheduling handles that pressure.

### Yjs

Yjs collaboration is optional and disabled in the template. When enabled, the relay is the single writer for registered rich-text fields during a session and persists through the standard product update path. Clients suppress SSE replacement of fields currently owned by an editor while other fields continue syncing normally. Read the [Yjs worker](../yjs/README.md) document for sessions, materialization, durability, and constraints.

## Reference

### SSE wire

Product and membership notifications use `event: change`, `id: activityId`, and a JSON payload. The server sends `event: offset` as the live barrier, SSE comments as keep-alives, and `event: error` for application failures.

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
  sourceType: string;
  targetType: string;
  field: string;
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

`seqCursor=51,150` means the inclusive bounded range; it is the only form. Delta fetches may also carry `pathPrefix` to narrow the read to one channel subtree.


### Influences

[ElectricSQL](https://electric-sql.com/) influenced shape-based PostgreSQL sync; [LiveStore](https://livestore.io/) event-oriented local state; [Sequin](https://sequinstream.com/) ordered CDC; [TinyBase](https://tinybase.org/) HLC design; [Yjs](https://github.com/yjs/y-protocols) collaborative protocols; and [Teleportal](https://teleportal.tools/) local-first architecture. Browser primitives come from [Hono SSE](https://hono.dev/docs/helpers/streaming#stream-sse) and [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
