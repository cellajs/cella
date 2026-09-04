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
| **Path** | Root-first channel ID path from a row's ancestor ids. Every subtree is a path prefix. |
| **Subtree** | A channel node and every row at or below it, identified by the node's path prefix |
| **Home** | Deepest non-null channel ancestor of a product row, with organization as fallback |
| **Frontier** | Newest sequence position in a channel summary. It only moves forward. |
| **Summary** | Frontier, counts, and timestamps denormalized onto a channel row, so one read answers for a subtree |
| **View** | The slice of the stream a client tracks (prefixes, entity types, depth, cursor). The unit catchup authorizes and answers. |
| **Cursor** | Latest sequence position a view has ingested |
| **Stream cursor** | ID of the last activity a connection received. Sent as `offset`, returned on reconnect. |
| **Range fetch** | Ordinary list request bounded by `seqCursor` |
| **Tombstone** | Soft-deleted row that remains fetchable so absent clients learn the deletion |
| **`stx`** | Envelope on every product write (mutation ID, source ID, per-field HLC timestamps) for merge arbitration and echo recognition |

## Data flow example

Renaming attachment `a42` inside `org1`:

1. The tab optimistically patches every cached query containing `a42` and sends the update: `ops` carries the changed fields, `stx` the attempt ID and scalar field timestamps.
2. The API drops scalar values with older timestamps, applies the rest, and returns the authoritative row. The initiating cache reconciles against it.
3. Postgres commits to the WAL. The CDC worker, in commit order, records the audit activity, reserves the next organization sequence position, stamps the row, and updates channel summaries.
4. The worker sends the change to the API over the internal WebSocket. The API invalidates its detail cache and hands the change to the stream dispatcher.
5. Dispatch checks the full row with the permission engine used by REST reads. Allowed subscribers receive an SSE notification with entity ID, path, sequence range, and `stx`.
6. The originating tab recognizes its `sourceId` and patches only cached `stx`. Other clients fetch the notified range through the list endpoint and patch their caches.

Reconnect uses the same path: cursor `3` and frontier `7` become `seqCursor=4,7`, and the cursor advances to `7` only after ingest.

## Server

### Ordering

The CDC worker consumes PostgreSQL logical replication, preserves transaction boundaries so cascaded child deletes can be suppressed, then micro-batches committed events by type and action. Product batches are split by `(path, entityType)`, one audience per notification.

Commit order is sequence order across product types.

### Counters

Per organization batch, the worker reserves a contiguous sequence range, stamps product rows in WAL order, and updates `channel_counters`. Keys are `sequence`, `membership`, or `<e|m>:<metric>:[h:]<type|role>`, where `e` holds entity metrics keyed by product or channel type, `m` holds membership metrics keyed by role, and `h` marks a home-only summary rather than the subtree aggregate.

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
- Unpublishing keeps the row as a draft, but replication emits a delete carrying the old published row. Readers receive delete-style invalidation.
- Draft creates, edits, and deletes never reach the worker.
- Soft-deleting a published row flows as an update tombstone.

Channels tables also have a `publishedAt` but it means something else entirely: it marks a channel to indicate invites are recorded but held until publish. So it doesn't have the filtering that product tables have.

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

Membership changes invalidate membership and channel queries. Product notifications have four shapes:

| Shape | Detection | Behavior |
| --- | --- | --- |
| Single row | `seq` set, no `batchUntilSeq` | Fetch that position and patch caches |
| Batch | `batchUntilSeq` set | Fetch the inclusive range and patch all returned rows |
| Delete-style removal | `action: 'delete'` | Mark the detail stale and invalidate scoped lists. No sync-visible row remains to fetch. |
| Move-out | `action: 'moveOut'` | Remove the row from caches and unseen tracking immediately |

A non-delete notification carrying this tab's `stx.sourceId` is an echo: the tab patches only `stx`.

### Catchup

Catchup runs on every connection before the stream goes live: the client opens SSE, waits for the server's `offset` marker, then posts its cursor and declared views. The server answers each view with a status, and for `ok` views the newest frontier and count. A first connection stores frontiers as baselines and fetches nothing. Route loaders own initial data. On later connections a view behind its frontier hands the gap to the fetch prioritizer, and the cursor advances only after ingest.

### Fetch prioritization

A notified range is queued, not fetched at once. The delay depends on how urgent the scope is for this client and how loaded the server is:

```text
delay = clamp(tier minimum, this client's fixed slot within the server's spreadWindow, tier maximum)
```

- A viewed channel fetches immediately: at organization level the route decides, below it a mounted list query carrying the channel id.
- A muted or archived channel fetches when opened.
- Every other channel fetches in the background between 2 and 30 seconds.

Apps derive per-user state from `query/realtime/sync-signals.ts`, never from queue logic: `onChangeEvent` announces every readable notification before any tier decision, with ids only. `onSyncedRows` delivers a settled range's rows, or an empty `degraded` batch that means invalidate instead of derive.

### Freshness

Synced product queries never go stale on their own while the stream is healthy: catchup owns their freshness. A failed stream or a delivery shortfall drops them to a five-minute stale time until a clean catchup restores trust. Other queries keep the global 30-second default, infinite while offline with `offlineAccess`.

### Unseen tracking

Unseen badges update from delivered rows with the server's own predicate (inside `seenWindowMs`, published, not deleted, not locally seen). An exact server recount replaces the estimate on staleness and after catchup, because cross-device seen marks never enter CDC. Seen-tracked types require unconditional channel read. Types with conditional row visibility keep endpoint counting.

### Embeddings

A product can reference other products through an id array column: the **host** row holds the ids, each referenced row is **embedded**. Declare the relationship in `appConfig.productEmbeddings` (`hostProduct`, `embeddedProduct`, `hostColumn`). The template configures none. Host and embedded rows sync independently, so patching runs both ways: an embedded row change carries a `PropagationHint` that patches the copies inside cached host rows, and a host row change refetches the lists of embedded rows whose references it added or removed, because derived values such as a usage count come from the list endpoint only.

## Writes

Product mutations own optimistic updates and replay registration in their query module: `onMutate` patches matching caches, success merges the authoritative server row, failure rolls back where configured. Mutations run with React Query `networkMode: 'offlineFirst'`.

An edit attempted offline retries network errors only, then pauses and enters the persisted replay queue. Server errors, any HTTP status, settle immediately without queueing. Restored paused mutations wait for the first catchup attempt before replay. Online writes never wait.

### Merge metadata

Synced tables store the latest `stx` envelope and merged timestamps for scalar fields:

```text
HLC: 1710500000123:0001:abcde
     unix millis : counter : source hash
```

Comparison uses milliseconds, then counter, then source. Each tab advances its own clock. The server advances its clock from received timestamps before generating its own. This is deterministic last-writer-wins, not a causal clock.

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

`fieldTimestamps` must name exactly the scalar operation keys. The server omits scalar values that lose HLC comparison and returns the authoritative row, never a conflict response. Merge resolution takes no `FOR UPDATE` lock, so overlapping updates can race.

### Paused writes

Paused mutations persist to IndexedDB and survive a reload, so mutation variables must carry all routing data. Hook closures no longer exist at replay. The attachment module is the reference: mutation functions are registered as replay defaults, and `stx` is minted at intent time and stored in the variables so a replay reuses the mutation ID and field timestamps.

Idempotency is operation-specific: attachment create checks its mutation ID against the stored `stx` and can return an existing batch. Update and delete do not.

## Resilience

### Schema changes

Old tabs and old queued writes survive a wire-shape deploy through lenses: [Schema evolution](./SCHEMA_EVOLUTION.md).

### Multiple tabs

The first tab to acquire the Web Lock becomes leader, owns SSE, and forwards notifications through BroadcastChannel. A follower is promoted when the leader closes. All tabs can mutate. Each tab keeps its own paused-mutation queue.

### Yjs

Yjs collaboration is disabled in the template. Relay, single-writer, and materialization semantics: [Yjs worker](../yjs/README.md).

## Reference

### SSE wire

Events: `offset` (stream cursor, once after connect), `change` (one `StreamNotification`), `error` (typed payload). An `unauthorized`, `forbidden`, or `tenant_revoked` error stops reconnecting.

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

The request carries a stream cursor and views `{ key, organizationId, prefixes, entityTypes, depth?, cursor }` (`depth`: `self` or `subtree`, default `subtree`). The response carries view answers, organization change summaries, and the stream cursor.

A stream subscription covers the organizations the user belongs to when it opens plus a per-user subscription for self-membership events. A membership in a new organization reaches the user there, and the client reconnects to subscribe to that organization and catch up on its history.

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

`seqCursor=51,150` is the inclusive bounded range and the only form. Range fetches may carry `channelId` to narrow the read to one channel subtree. In hierarchies deeper than `organization -> channel`, a read covered by a `channelId` must AND a subtree predicate over the denormalized ancestor id columns on top of the permission-derived scope (`buildSubtreeCoverWhere`, `backend/src/db/utils/subtree-cover.ts`). Never fold the covering id into the permission scope, or an intermediate grant widens the read past the subtree.

### Detail cache

The server keeps a TTL cache of enriched product detail responses (5,000 entries, 10 minutes) that CDC invalidates. Hits recheck permission and draft visibility. List fan-out bypasses it.
