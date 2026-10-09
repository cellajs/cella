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
| **Stream cursor** | ID of the last activity a connection received. Sent back in the catchup request; the server's `offset` event tells the client to start catchup. |
| **Range fetch** | Ordinary list request bounded by `seqCursor` |
| **Tombstone** | Soft-deleted row that remains fetchable so absent clients learn the deletion |
| **`stx`** | Envelope on every product write (mutation ID, source ID, per-field HLC timestamps) for merge arbitration and echo recognition |

## Data flow example

Renaming attachment `a42` inside `org1`:

1. The tab optimistically patches every cached query containing `a42` and sends the update: `ops` carries the changed fields, `stx` the attempt ID and scalar field timestamps.
2. The API stamps every changed scalar with a fresh server timestamp, applies the write, drops its cached detail of the row and returns the authoritative row. Only a replayed offline write is arbitrated by its own timestamps ([Merge metadata](#merge-metadata)). The initiating cache reconciles against the row.
3. Postgres commits to the WAL. The CDC worker, in commit order, records the audit activity, reserves the next organization sequence position, stamps the row, and updates channel summaries.
4. The worker sends the change to the API over the internal WebSocket. The API invalidates its detail cache and hands the change to the stream dispatcher.
5. Dispatch checks the full row with the permission engine used by REST reads. Allowed subscribers receive an SSE notification with entity ID, path, sequence range, and `stx`.
6. The originating tab recognizes its `sourceId` in a single-row notification and patches only cached `stx`. Other clients, and a tab whose own edit arrived in a batch, fetch the notified range through the list endpoint and patch their caches.

Reconnect uses the same path: cursor `3` and frontier `7` become `seqCursor=4,7`, and the cursor advances to `7` only after ingest.

## Server

### Ordering

The CDC worker consumes PostgreSQL logical replication, preserves transaction boundaries so cascaded child deletes can be suppressed, then records committed transactions in commit order, several per database transaction, and notifies per type and action. Product batches are split by `(path, entityType)`, one audience per notification. A row that is no product (a membership, a channel) goes to the API alone and first, in commit order. A flush waits for the API, and a send that fails is delivered again.

Commit order is sequence order across product types.

### Counters

In the same database transaction that records a batch of changes, the worker reserves a contiguous sequence range per organization, stamps product rows in commit order, and updates `channel_counters`. A change that is delivered again changes none of them. Keys are `sequence`, `membership`, or `<e|m>:<metric>:[h:]<type|role>`, where `e` holds entity metrics keyed by product or channel type, `m` holds membership metrics keyed by role, and `h` marks a home-only summary rather than the subtree aggregate.

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
| `e:c:{host type}` | Embedded row | Live host rows that reference the embedded row. The key is the embedded row's id, not a channel |

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

Only the user's own membership changes are streamed: a create or delete invalidates the channel list of that type and the user's memberships, an update invalidates the organization's member lists and refreshes the user. Other members' changes reach a client through the catchup signal. Product notifications have four shapes:

| Shape | Detection | Behavior |
| --- | --- | --- |
| Single row | `seq` set, no `batchUntilSeq` | Fetch that position and patch caches |
| Batch | `batchUntilSeq` set | Fetch the inclusive range and patch all returned rows |
| Delete-style removal | `action: 'delete'` | Mark the detail stale and invalidate scoped lists. No sync-visible row remains to fetch. |
| Move-out | `action: 'moveOut'` | Remove the row from caches and unseen tracking immediately |

A single-row, non-delete notification carrying this tab's `stx.sourceId` is an echo: the tab patches only `stx`. A batch is fetched whoever wrote it. The worker batches per audience and sends an audience's single row as a single-row notification, so an edit stays an echo when other organizations' edits share its flush.

### Catchup

Catchup runs on every connection before the stream goes live: the client opens SSE, waits for the server's `offset` marker, then posts its cursor and declared views. The server answers each view with a status, and for `ok` views the newest frontier and count. The client declares a view for every organization the user is a member of. A view without a cursor (a first connection, an organization joined since) stores the frontier as its baseline and refetches what it has cached of that organization: rows read before the stream was live are not vouched for by the frontier. Route loaders own initial data. A view behind its frontier hands the gap to the fetch prioritizer; its cursor advances when the gap is ingested, when nothing of it is cached, or when the fetch gives up to an invalidation.

### Fetch prioritization

A notified range is queued, not fetched at once. The delay depends on how urgent the scope is for this client and how loaded the server is:

```text
delay = clamp(tier minimum, this client's fixed slot within the server's spreadWindow, tier maximum)
```

- A viewed channel fetches immediately: at organization level the route decides, below it a mounted list query carrying the channel id.
- A muted or archived channel fetches when opened; a catchup gap in it fetches in the background.
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

Only a replayed offline write (`stx.replayed`) is arbitrated by its client timestamps: they are its intent time, which lets it lose to an edit made elsewhere while it was queued. The query client sets the flag on the stx in the variables of every mutation that pauses, so a module's `mutationFn` sends the stx it was given and sets nothing. An online write is ordered by server arrival: the server replaces its field timestamps with one fresh server HLC, so a device clock behind the stored value cannot get its edit silently dropped.

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

`fieldTimestamps` must name exactly the scalar operation keys. For a replay, the server omits scalar values that lose HLC comparison and returns the authoritative row, never a conflict response. An update reads its row with `FOR NO KEY UPDATE` (`getValidProduct` with `forUpdate`) before it merges, so overlapping updates of one row are resolved one after the other and each keeps the other's field timestamps. An app's own update operation has to pass `forUpdate` as well.

Columns the server derives from a write stay outside the merge: the attachment `keywords`, re-derived from the description in `update-attachment.ts`, and an app's own audit stamps. They are written in the same transaction as the resolved values but never enter `stx.fieldTimestamps` or `stx.changedFields`, the columns the CDC worker reports as changed: they are not operations and carry no HLC. Only `updatedAt` joins `changedFields`, which is how the CDC worker tells a user edit from its own writes. The client runs the same description derivation in its collaborative cache patches, registered per type with `registerDescriptionDerivation`. A column the client does not derive stays out of that registration and reaches the cache with the server's rows: an app's own keyword index, when its search needs more than the 900 characters `deriveDocument` keeps in `keywords`.

### Paused writes

Paused mutations persist to IndexedDB and survive a reload, so mutation variables must carry all routing data. Hook closures no longer exist at replay. The attachment module is the reference: mutation functions are registered as replay defaults, and `stx` is minted at intent time and stored in the variables so a replay reuses the mutation ID and field timestamps.

Idempotency is operation-specific: a product create runs `checkIdempotency(ctx, table, mutationId)`, which returns the batch the caller created under that id in the request scope (known once the CDC worker has recorded that create), so another actor reusing the id creates its own rows. Update and delete do not.

## Resilience

The REST API and the database work whatever the CDC worker does: a write commits and a read answers while the worker is down, reading again or rebuilding. The failure handling behind the sync engine has three levels and no more ([CDC worker](../cdc/README.md#failure-and-recovery)): the core records a change once, whatever fails is read again from the replication slot, and when the WAL cannot help the worker rebuilds its books and every client refetches.

### What happens when

A client that missed notifications while the books stayed right is repaired by its own catchup, its cursors against the frontiers. A client is made to refetch only when the books themselves were wrong. Nothing in this table needs a fourth mechanism.

| What happened | What a user sees | What repairs it | What is lost |
| --- | --- | --- | --- |
| The worker is down, or reading again after a failure | Own writes work; other users' changes arrive late and in order | The worker reads on from the slot | Nothing |
| The API restarts, or dies after taking a message from the worker | Streams drop and reconnect | The client's catchup compares its cursors with the frontiers and fetches the gap | Nothing durable. Mentions and push notifications of that moment |
| A deploy overlap (`singleVM`) | Clients on the new API hear nothing until the slot moves | Their next notification or reconnect fetches the gap | Nothing |
| A notification is lost inside the API while the stream stays open | That client lags until its next reconnect | The next catchup | Nothing durable |
| The replication slot is gone or invalidated | Live updates stop until the worker restarts; then every client refetches once | A new slot and a rebuild; the generation moves | Activities and notifications of the rows changed while the slot was gone |
| `channel_counters` is emptied (a truncate, a partial restore) | Every client refetches once | A rebuild from the tables | Nothing |
| One change can never be processed (a parse error, a transaction over 100,000 changes) | Live updates pause about a minute; then every client refetches once | After five reads the slot moves past the backlog and the books are rebuilt | Activities and notifications of that backlog |
| The database is restored from a backup | As a lost slot | A new slot and a rebuild | Everything after the backup, as with any restore |

### Rebuilt books

The counters, the sequence counter and the frontiers are the CDC worker's books. It checks them against the tables once a day and rebuilds them when the replication stream cannot bring them back: [CDC worker](../cdc/README.md#verify-and-rebuild). Whenever it corrected or rebuilt them it moves a generation on: a number that grows and is never below the clock in minutes, so a database restored from a backup cannot hand out one a client already holds. The catchup answer carries that generation. A client that holds another one puts its view cursors back at 0 (the stream cursor stays), takes the frontiers of that catchup as new baselines, refetches the lists on screen at once and, after a random delay of up to ten seconds, everything else it has cached of the synced types; member queries of every organization are invalidated as well. Open streams hear of it through the worker's health push: the API ends them with `resync`, and each leader tab reconnects after its backoff of a few seconds. The leader tells its follower tabs, which run no catchup: each puts its cursors back and refetches the same way.

### One API process

The worker hands every change to one API process, and that process holds every stream, drops its caches and ends the streams on a new generation. The sync engine is built for one API process per deployment: [Scaling](./ARCHITECTURE.md#scaling).

### Schema changes

Old tabs and old queued writes survive a wire-shape deploy through lenses: [Schema evolution](./SCHEMA_EVOLUTION.md).

### Multiple tabs

The first tab to acquire the Web Lock becomes leader, owns SSE, and forwards notifications and a new generation of the sync books through BroadcastChannel. A follower is promoted when the leader closes. All tabs can mutate. Each tab keeps its own paused-mutation queue.

### Yjs

The template collaborates on attachment descriptions through the Yjs relay (`services.yjs.enabled`); an app adds a product by registering a `yjsMaterializer`. Relay, update log, compaction and materialization semantics: [Yjs worker](../yjs/README.md).

With Yjs on, a description saves through the relay only, never as a REST write, so it never enters the replay queue. A description written through the API (REST, MCP, an import) reaches open editors as an update in place, and deleting the entity ends its editing sessions, which then show it as deleted. A document the user opened for editing is stored per user ([Client](./CLIENT.md#the-per-user-database)), so it opens from storage and stays editable offline. When the relay is out of reach but the API answers, the editor syncs over HTTP (pull and push through the API) and switches back once the socket syncs; a document never opened stays read-only offline. An edit no server has confirmed stays stored until one does, and an edit that can no longer be saved (access lost, entity deleted) is offered to copy before it is discarded.

The cache takes a Yjs-owned field, the description or a column derived from it (`registerYjsOwnedFields`), only from a server write of it. When a synced row carries the cached copy's `stx.fieldTimestamps` stamp for the field, the cached value stays, so a read that lags the relay cannot undo a collaborative patch. A create stamps no field, so a field neither row stamps counts as unwritten as well. A derived column has no stamp of its own and follows the description's.

An app that shows a description in place, a static view that turns into the editor, builds it on `useDescriptionSlot` and `<DescriptionLayers>` (`frontend/src/modules/common/blocknote/`). One editor instance is warmed behind the static and handed back to it without a blink, a checklist toggle on the static commits like an edit, and the hook cools warm editors the app forgets. The `common/blocknote/DescriptionSlot` story runs it.

## Reference

### SSE wire

Events: `offset` (the server's newest activity id, once after connect: the signal to post the catchup), `change` (one `StreamNotification`), `error` (typed payload). The server ends a stream with `unauthorized` when the session behind it ended for good (sign-out, revoked from another session, evicted, expired, MFA turned on elsewhere, the account deleted, an impersonation that ended); the client then opens a 60-second circuit and reconnects after a visibility change that finds the API healthy (`forbidden` and `tenant_revoked` are reserved codes it treats the same way). `session_replaced` means the browser holds a newer session (a sign-in from the same browser, turning MFA on, stopping an impersonation), `access_changed` that the stream's system-admin reads changed, and `resync` that the server's sync books moved to another generation (a correction or a rebuild); the client reconnects on all three. The server checks every open stream's session again once a minute, which also catches endings on another instance.

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

A stream subscription covers the organizations the user belongs to when it opens plus a per-user subscription for self-membership events. A membership in a new organization reaches the user there, and the client reconnects to subscribe to that organization and take its baselines.

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

`signals.membership` is the organization's bump-only membership signal: every membership and invitation change in the organization moves it, and a client whose stored value differs invalidates its member queries.

`seqCursor=51,150` is the inclusive bounded range and the only form. Range fetches may carry `channelId` to narrow the read to one channel subtree. In hierarchies deeper than `organization -> channel`, a read covered by a `channelId` must AND a subtree predicate over the denormalized ancestor id columns on top of the permission-derived scope (`buildSubtreeCoverWhere`, `backend/src/db/utils/subtree-cover.ts`). Never fold the covering id into the permission scope, or an intermediate grant widens the read past the subtree.

### Detail cache

The server keeps a TTL cache of enriched product detail responses (5,000 entries, 10 minutes). An entry is dropped by the API's own update or delete of the row (through the mutation bus, with a five-second hold on storing a read that started before it) and by every CDC message for the row; a read that started before a drop is never stored. Hits recheck permission, draft visibility, tenant and organization. Concurrent misses are fetched once. List fan-out bypasses it. A write outside the API process (the relay, a job) reaches the cache through its CDC message only.
