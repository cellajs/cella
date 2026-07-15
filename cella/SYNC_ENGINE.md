# Cella sync engine

> The [Architecture](/docs/page/architecture) document explains why Cella uses notify-then-fetch. This document explains the reasoning behind the sync engine. It also provides more details on how a mutation travels through the sync pipeline and how clients stay consistent while online and offline.

## TL;DR

```text
User edits Attachment.name
        ▼
Optimistic state applied
        ▼
PUT /attachments/123
        ▼
Postgres commits
        ▼
CDC Worker observes WAL
        ▼
Assign seq = 42
        ▼
Emit notification
        ▼
SSE reaches browsers
        ▼
React Query fetches the changed seq range
        ▼
UI updates
```

## Foundations

Postgres + OpenAPI + React Query are the foundational primitives. Standard OpenAPI endpoints remain the default, while product entities add transaction metadata, offline queuing, and realtime streaming. It is a _notify-then-fetch_ sync: a worker notifies the client, which fetches the changed rows through the same list/detail endpoints used by the rest of the application.

| Entity type | Features | Example |
|------|--------------|---------|
| `ChannelEntityType` | Standard REST CRUD, server-generated IDs | `organization` |
| `ProductEntityType` | HLC scalar merge, set-like array deltas, paused-mutation persistence infrastructure, app SSE, live cache updates, multi-tab leader election; optional Yjs integration | `attachment` |

---

## Why built-in?

External sync solutions typically have their own patterns for operations, authorization, and caching. This creates either an all-or-nothing approach or the DX of having dual patterns. Especially if you **do not want** to push all your app data through a sync engine.

Hidden opportunities! We found out that internalizing the sync engine means you can make amazing combos: think audit trail, API event bus, unified count logic, schema evolution tolerance and unified tracing.

| Concern | External services | Built-in approach |
|---------|-------------------|-------------------|
| **OpenAPI contract** | Bypassed | Extends existing endpoints with `stx` object in entity |
| **Authorization** | Requires re-implementing | Reuses `checkPermission()` and existing guards |
| **Schema ownership** | Sync layer dictates patterns | Drizzle/Zod schemas remain authoritative |
| **Opt-in complexity** | All-or-nothing-or-double | Progressive: REST → Tracked → Offline → Realtime |
| **React Query** | New reactive layer | Builds on existing TanStack Query cache & hooks |

---

## Terminology

The sync engine uses distinct terms for data at each layer:

| Term | Layer | Description |
|------|-------|-------------|
| **Activity** | Database | Persisted record in `activitiesTable`. Source of truth for audit log. |
| **Message** | CDC Worker | JSON payload sent from CDC Worker to API via WebSocket. |
| **Event** | ActivityBus | In-memory event emitted to internal handlers (Node.js EventEmitter). |
| **Notification** | SSE Stream | Lightweight payload sent to clients via Server-Sent Events. |

```
Postgres → CDC Worker → API Server → SSE → Client
          (message)     (event)     (notification)
                ↓
         activitiesTable
            (activity)
```

---

## Core concepts

### Architecture overview
- **Logical replication** - CDC Worker receives WAL changes, activities to `activitiesTable`, sends to API
- **ActivityBus** - Receives CDC messages via WebSocket, emits events to internal handlers
- **Catchup via POST + delta fetch** - Client POSTs `{ cursor, seqs }` to the stream endpoint; server compares per-scope seqs and returns a gap summary. Client calls registered REST list endpoints with an open-ended `?seqCursor=min` and patches cached rows, including soft-delete tombstones.
- **Live stream** - One authenticated SSE stream sends lightweight product-entity and membership notifications. Product notifications include a cache token.
- **Notify + fetch pattern** - SSE product notifications trigger seq-range fetches. The app entity cache can coalesce token-backed detail fetches.
- **React Query as merge point** - Initial/prefetch load and notification-triggered fetches enter same cache

### Realtime mechanics
- **Gap detection** - Entity-type sequence numbers (`seq`) detect missed product entity changes
- **Leader-tab SSE** - One leader tab owns the SSE connection and broadcasts notifications to followers
- **TTL app entity cache** - Server-side cache with request coalescing for token-backed detail fetches
- **Fetch prioritizer** - Client distinguishes the currently viewed organization (`high`) from others (`low`)

### Sync mechanics
- **Catchup before persisted replay** - On startup, restored paused mutations wait for the first catchup attempt before replay. Ordinary online mutations are not gated on stream state.
- **Per-field merge strategies** - Scalars use HLC-based LWW (latest timestamp wins); array fields can use remove-then-add deltas (`{ add, remove }`); configured descriptions can use Yjs via a dedicated worker
- **Paused-mutation persistence** - React Query can dehydrate paused mutations to IndexedDB and restore them, provided the entity module registers a replay function and serializes complete variables
- **Conflict strategy** - Scalars with timestamps use HLC comparison. Array deltas are idempotent for repeated application but are not a commutative CRDT. Configured descriptions use Yjs character-level merge.
- **Optional Yjs collaborative editing** - A standalone WebSocket relay can co-edit and materialize registered fields. It is disabled and has no registered product materializer in the template config.
- **Smart mutations** - Entity `query.ts` modules own optimistic updates and offline replay wiring so forms remain simple.

## Architecture

> **SERVER:** CDC Worker → WebSocket → API → SSE fan-out

This architecture uses a persistent WebSocket connection from the CDC worker to the API server and channel-indexed SSE subscribers. Channel lookup is constant-time; broadcasting still scales with the number of matching subscribers. Existing permission logic filters each notification before delivery.

**CDC buffering and batching:** `TransactionBuffer` retains transaction boundaries to suppress cascaded child deletes. After commit, `FlushBuffer` can micro-batch surviving events across transactions and groups them by `(type, action)`. Product groups are split again by their effective seq context (the deepest non-null ancestor), so every notification describes one contiguous seq range.

```
Postgres WAL
    │
    ▼
CDC worker
    ├── persist activity
    ├── update counters and stamp product seq
    └── WebSocket { activity, rowData, cacheToken, batchRows? }
            │
            ▼
API /internal/cdc → ActivityBus
            │
            ▼
StreamSubscriberManager
    ├── lookup organization channels
    ├── filter each subscriber by permissions
    └── SSE event: change
        data: { kind, action, entityType, subjectId, seq, stx, ... }
            │
            ▼
Leader tab ── BroadcastChannel ──► follower tabs
```

> **CLIENT**: Two-phase sync cycle → SSE/live → priority-based fetch updates

### Notification shapes

Clients first branch on `kind`. Membership notifications invalidate membership/context queries; entity notifications use the seq/cache-token path. Entity notifications then have three shapes:

| Shape | Detection | Client behavior |
|-------|-----------|----------------|
| **Single entity** | `seq` set, `batchUntilSeq` null | Range fetch that seq and patch caches; tombstones remove cached entities |
| **Create/update batch** | `batchUntilSeq` set | Range fetch via `seqCursor=seq,batchUntilSeq`; live rows upsert, tombstones remove |
| **Hard delete** | `action: 'delete'` | Physical delete (rare, e.g. DB admin); invalidate the scoped list to reconcile; soft deletes arrive as `update` tombstones instead |

Batch notifications carry a `cacheToken` and the backend reserves its entity keys. The batch-resolve middleware is currently marked TODO and is not attached to a list route, so current range fetches still execute the list endpoint normally.


## Notification format
Synced entity tables have an `stx` JSONB column for transaction metadata. It is sent on product-entity notifications. A later mutation overwrites the envelope, but the merged `fieldTimestamps` inside it remain part of conflict resolution. Entity `seq` values and `channel_counters` are the current gap-detection state; `activitiesTable` is the append-only audit/cursor history.


```typescript
interface StreamNotification {
  kind: 'entity' | 'membership';
  action: 'create' | 'update' | 'delete';
  entityType: string | null;                    // Product entity type (null for membership events)
  resourceType: string | null;                  // 'membership' for membership notifications
  subjectId: string | null;
  organizationId: string | null;
  tenantId: string | null;
  channelType: string | null;                   // Channel entity type for membership (e.g., 'project')
  channelId: string | null;                     // Parent entity ID for unseen count grouping
  seq: number | null;                           // Per-entityType sequence stamped by CDC worker (entities only)
  stx: StxBase | null;                          // Sync transaction metadata (entities only)
  cacheToken: string | null;                    // Session-signed app entity-cache token (entities only)
  batchUntilSeq: number | null;                 // Last seq in batch (null = single entity notification)
  propagation: PropagationHint | null;          // Embedded entity propagation hint (null = no propagation)
}

interface PropagationHint {
  sourceType: string;                           // Source entity type (e.g., 'label')
  targetType: string;                           // Target entity type that embeds the source (e.g., 'task')
  field: string;                                // Field name in target (e.g., 'labels')
  update: string[];                             // Source IDs that were created/updated
  remove: string[];                             // Source IDs that were deleted
}

interface StxBase {
  mutationId: string;                           // UUIDv7 generated for the mutation attempt
  sourceId: string;                             // Instance ID (browser UUIDv7; 'server' for server writes)
  fieldTimestamps: Record<string, string>;      // Per-field HLC timestamps (scalars only)
}
```

Product-entity and membership notifications are both transported as `event: change`, `id: activityId`, and `data: JSON(StreamNotification)`. The payload's `kind: 'entity' | 'membership'` discriminator selects either the seq/cache-token path or the membership-invalidation path. When a GET connection opens, the server sends `event: offset` with its current cursor; the client treats that as the live barrier. Keep-alives are SSE comments (`: ping`), not named events. Application failures use `event: error`.

---

## App stream

Cella currently exposes one realtime stream: the authenticated app stream. It carries product entities that pass the subscriber's permission check and membership changes for the user's organizations. One connection is registered against all organization channels visible when it opens; gaining access to a new organization requires a reconnect.

| Aspect | Implementation |
|--------|----------------|
| **Auth** | Requires authentication (session cookie) |
| **Scope** | Permitted product entities + membership changes in the user's organizations |
| **Cursor storage** | Persisted in sync store (survives refresh) |

**How catchup works:**

Before opening SSE, the client POSTs its cursor and flattened seq watermarks to the same endpoint. The backend returns `{ changes, cursor }`, where `changes` is keyed by `organizationId`:
```typescript
interface CatchupChangeSummary {
  entitySeqs?: Record<string, number>;
  entityCounts?: Record<string, number>;
  childChannelChanges?: Record<string, {
    entitySeqs?: Record<string, number>;
    entityCounts?: Record<string, number>;
  }>;
  propagation?: PropagationHint[];
}
```

The client processes catchup in a two-phase sync cycle:

**Phase A (catchup, before SSE opens):**
- On the first connection (`cursor` absent), stores org and child-context seq baselines and returns. Route loaders are responsible for initial data.
- On later connections, compares server and stored seqs. For cached scopes with a positive delta, it fetches from `clientSeq + 1` using open-ended `seqCursor`; a full chunk or failed fetch falls back to active-list invalidation.
- Soft-delete tombstones returned by the delta endpoint remove rows from detail/list caches.
- Membership member-list invalidation is scoped to organizations whose `s:membership` counter changed. If the response contains any changed scope, context lists, `me`, and the user's memberships are refreshed.
- `entityCounts` are compared with the previous server counts seen in this browser session. They are deliberately not compared with permission-filtered cached totals.
- Embedded propagation runs after all delta fetches.

**Phase B (background sync service, after SSE reaches `live`):**
- Runs `ensureQueryData` / `ensureInfiniteQueryData` for entity queries
- High priority (current org): resolves staleness immediately; React Query sees stale data and refetches
- Low priority (other orgs): only when `offlineAccess` is on; fills offline cache
- Without `offlineAccess`, non-current orgs rely on their module's query behavior when mounted. `refetchOnMount` is globally `false`; modules opt in where needed.

Fallback chain if Phase B doesn't run (SSE fails):
- Module-level `refetchOnMount: true`, where configured, refreshes on navigation
- Global `refetchOnReconnect: true` refetches stale queries when network returns
- Pull-to-refresh → `invalidateQueries()` forces full active refetch


## Conflict handling

### Three layers

#### 1. Catchup before restored replay
Restored paused mutations wait for the initial catchup attempt before `resumePausedMutations()` runs. This reduces stale offline replay, but it is not a per-request gate: normal online mutations can run while the stream is connecting or unavailable.

**When online:** The stream normally keeps cached product data up to date. HLC arbitration is per scalar field, but the non-atomic read/compute/update persistence path described below still permits overlapping writes to race.

**When offline:** the current defaults do not reliably queue the edit. TanStack Query's `offlineFirst` mode allows the first mutation attempt to run even when offline, and this repository sets mutation `retry: 0`; a network failure therefore normally settles as an error and the module rolls back its optimistic state instead of leaving an `isPaused` mutation. The persistence/replay path applies only when a mutation is paused for another reason. There is no client-side side-by-side conflict detector.

#### 2. Per-field merge strategies
Each field type has its own merge strategy:
- **Scalars** (name, status, points, etc.): HLC-based LWW via `stx.fieldTimestamps`. An older timestamp is omitted from the write. Different scalar fields carry independent timestamps.
- **Set-like arrays** (labels, assignedTo in forks): `{ add, remove }` deltas are resolved against the row read by the handler, removing first and then adding missing IDs. They do not use field timestamps.
- **Configured descriptions**: Yjs can provide character-level merge through the optional relay. The template does not enable Yjs or register a product materializer by default.

The merge strategy is implicit from the value shape in the `ops` key: bare value → LWW scalar, `{ add, remove }` object → array delta.

#### 3. Conflict resolution
The server does not return a 409 for an HLC loss: losing scalar values are omitted from the write, and the returned entity carries the authoritative values. Client update schemas require one valid HLC per scalar op; array deltas carry none. Trusted server updates use a separate resolver that generates their timestamps internally.

Resolution is performed in JavaScript after reading the entity, followed by an ordinary `UPDATE` inside the transaction. It is not a SQL `CASE` compare-and-set and the read is not locked with `FOR UPDATE`, so overlapping writes can still race (especially whole-array delta writes and `stx` metadata).

### Mutation flow

```
┌───────────────────────────────────────────────────────────────────────────┐
│                            Mutation Flow                                  │
├───────────────────────────────────────────────────────────────────────────┤
│  User triggers mutation                                                   │
│     │                                                                     │
│     ▼                                                                     │
│  1. onMutate: Apply optimistic update + squash pending same-entity        │
│     │                                                                     │
│     ▼                                                                     │
│  2. mutationFn runs under React Query networkMode: offlineFirst           │
│     │                                                                     │
│     ├── OK ──► onSuccess merges the server row into list/detail caches    │
│     │                                                                     │
│     ├── SERVER ERROR ──► module/global error handling                     │
│     │                                                                     │
│     └── OFFLINE/NETWORK ──► normally settles as error (retry: 0)           │
│                                                                           │
│  Restored mutation already marked isPaused                                │
│     └── initial catchup gate, then resumePausedMutations()                 │
└───────────────────────────────────────────────────────────────────────────┘
```

| Scenario | Behavior | Result |
|----------|----------|--------|
| User types rapidly (online) | Form/module debounce, when implemented | Only the final debounced value is sent |
| React Query restores an already-paused mutation | Waits for the first catchup attempt | Replay starts with fresher cached data |
| Multiple pending updates | `squashPendingMutation()` can merge scalar and array-delta ops | The entity module must place the returned ops in the new mutation variables |

### Idempotency

Idempotency is operation-specific, not a global mutation guarantee. The default attachment create operation checks `stx.mutationId` against activities and can return the already-created batch. Attachment update and delete do not perform that check. The frontend also generates `stx` inside `mutationFn`; the stable queued variables do not themselves contain a mutation ID, so a re-executed mutation function can generate a new UUIDv7.

---

## Offline sync

### Gap detection (seq + tombstones)

Uses entity-type sequence numbers (`seq`) for **create/update/soft-delete/restore detection**. A soft delete sets `deleted_at`; a restore clears it. Both are updates, so CDC stamps them and delta reads can reconcile the cached row.

**Sequence architecture:**
- **`seq`**: Per-row sequence stamped by the CDC worker after each product-entity create/update. The worker reserves a range in `channel_counters.counts['s:{entityType}']` and writes assigned values back to the rows. New rows have their schema default until CDC stamps them.
- **Hierarchy-aware scoping**: The CDC worker uses the row's deepest non-null ancestor ID as the context key. This equals the declared parent for ordinary hierarchies and supports variable-depth entities whose nearer ancestor can be null.
- **Membership detection**: Membership changes are detected via the org-level `s:membership` counter and standard membership invalidation.
- **Delete detection**: Soft deletes are seq-stamped tombstone rows (`deletedAt != null`) returned by `seqCursor` reads. A physical hard delete has no row to fetch; the live handler invalidates the list, while the in-session server-count signal may detect a missed create/delete. No automatic hard-purge horizon is implemented in this repository.
- **`seqCursor`**: List query parameter with two forms: `seqCursor=51` means `seq >= 51` and is used by catchup; `seqCursor=51,150` means the inclusive bounded range and is used by live batch notifications.

**Two modes of gap detection:**

1. **Catchup (offline/reconnect):** Client compares stored org/child-context `clientEntitySeq` values with `serverEntitySeq` values from `channel_counters`. For a cached changed scope it reads from `clientEntitySeq + 1` without an upper bound. Tombstones remove entities from cache. The first connection only records a baseline.

2. **Live (SSE):** Product create/update notifications include `seq`, scoped to entity type + effective context (e.g., tasks within a project in a fork). The single-notification path advances its watermark before starting the range fetch; the batch path advances to `batchUntilSeq` only after a successful range fetch. An own create/update echo returns before either update after patching cached `stx`, so catchup may safely see that seq again.

**How it works (scenario):**

An organization has attachments. `seq` is stamped by the CDC worker on product INSERT/UPDATE, including soft-delete updates.

```
Server timeline (org-123, attachments):      seq
  Attachment A created                        1
  Attachment B created                        2
  Attachment C created                        3
  ── client goes offline (clientSeq = 3) ──
  Attachment D created                        4
  Attachment B soft-deleted                   5
  Attachment A updated                        6
  Attachment E created                        7
  ── client reconnects ──
```

Catchup POST returns for this scope:
```
serverSeq: 7
```

Client logic:
```
start       = clientSeq + 1 = 4
serverSeq > clientSeq → delta fetch with seqCursor=4
```

The delta fetch (`GET /attachments?seqCursor=4`) returns attachments D, B, A, E. Attachment B has `deletedAt` set, so the client removes it from detail and list caches. After ingestion succeeds (or recovery is handed to list invalidation), the client stores `clientSeq = 7`.

**Why tombstones remain:** a reconnecting client can only learn a soft delete from the row returned by its open-ended seq read. Any future hard-purge policy must therefore account for the maximum supported offline/catchup window.


### Cache freshness strategy (staleTime)

Registered product entity queries can opt into `syncStaleTime`, which returns **Infinity** while the app stream is live and **5 minutes** while it is disconnected. While live, freshness is driven by notification/catchup processing instead of time alone.

| staleTime | When | Effect |
|-----------|------|--------|
| 30s (global default) | Non-synced queries (users, tenants, requests), while online or without offline access | Standard React Query behavior |
| Infinity (`syncStaleTime`) | Product entity queries, stream live | Catchup + count integrity handle freshness exclusively |
| 5 min (`syncStaleTime`) | Product entity queries, stream disconnected | Fallback so queries refresh on navigation |
| Infinity (global default) | `offlineAccess` enabled and device offline, for queries without their own `staleTime` | Serve those cached queries without time-based staleness until back online |

Only product entity queries opt in to `syncStaleTime`: they are the only entities covered by the CDC → catchup pipeline. Channel entities (organizations, memberships) and non-synced queries normally use the global 30s default; with `offlineAccess` enabled, that global default becomes Infinity while the browser is offline. A query-level `syncStaleTime` still takes precedence and returns 5 minutes whenever the stream is disconnected, including offline.

### Cache integrity check (entityCounts)

After seq-based processing, catchup uses `entityCounts` as an additional in-session change signal. These counts are shared server totals, while cached lists can be permission-filtered, so the client **never compares them directly with a cached list total**.

Instead it remembers the last server count seen for each org/entity/context in this browser session. If a later catchup reports a different server count and a corresponding list is cached, the active list is invalidated. First sight has no comparison and a page reload clears this memory; seq watermarks remain the primary cross-session mechanism.

**How it works:**
```typescript
const previous = lastSeenServerCounts.get(countKey);
lastSeenServerCounts.set(countKey, serverCount);
if (previous !== undefined && previous !== serverCount && hasCachedList) {
  invalidateEntityListForOrg(keys, organizationId, 'active');
}
```

`entityCounts` comes from the same `counts` JSONB records fetched for `entitySeqs`, so the check adds no database query.

### Merge resolution (HLC + array deltas)

Uses per-field merge strategies instead of version-based conflict detection. The merge strategy is implicit from the value shape in the `ops` key.

#### Wire format

All updatable fields, both scalars and set-like arrays, go in a single `ops` key. The merge strategy is detected at runtime:
- Bare value (`string | number | boolean | null`) → scalar → LWW with HLC
- Object with `{ add, remove }` → array delta

```typescript
// Update request body
{
  ops: {
    name?: string;                                      // scalar → LWW
    status?: number;                                     // scalar → LWW
    labels?: { add?: string[]; remove?: string[] };      // remove, then add missing IDs
    assignedTo?: { add?: string[]; remove?: string[] };
  };
  stx: StxBase;
}
```

#### HLC (Hybrid Logical Clock)

Combines the local physical clock, a logical counter, and a source hash:

```
Format: "1710500000123:0001:abcde" (unix millis + zero-padded counter + sourceId hash)
Compare: parsed millis, then counter, then source hash
```

The 5-character `sourceId` hash breaks ties when timestamps and counters match. Each tab advances its own clock, and the server advances its module clock from received timestamps before generating server timestamps. Clients do not advance their clocks from remote HLCs, so this is deterministic LWW ordering rather than a full cross-client causal clock.

**Client-side (mutation creation):**
```typescript
// Entity modules choose the scalar field names that need an HLC.
function createStxForUpdate(scalarFieldNames: string[]): StxBase {
  return {
    mutationId: uuidv7(),
    sourceId,
    fieldTimestamps: createFieldTimestamps(scalarFieldNames),
  };
}
```

**Server-side (merge resolution in handlers):**
```typescript
import { resolveServerUpdateOps, resolveUpdateOps } from '#/core/stx/resolve-update';

// Client path: validates timestamps at the wire schema, then normalizes lens keys,
// filters scalar no-ops, applies HLC comparison, and resolves array deltas.
const resolved = resolveUpdateOps(entityType, entity, ops, stx);

// Trusted-server path: advances past stored scalar clocks and assigns one server HLC.
const serverResolved = resolveServerUpdateOps(entityType, entity, ops);
```

#### Array-delta properties

Array fields can use set-like delta operations:
- **Remove then add**: IDs in `remove` are filtered out, then IDs in `add` that are not present are appended
- **Idempotent replay**: applying the same delta again to its result is a no-op
- **Order-sensitive concurrency**: add/remove operations do not carry causal tags, so opposite concurrent operations are not commutative or guaranteed add-wins
- **Whole-array write**: the resolved array is written as a value, so concurrent read-modify-write transactions can overwrite one another

#### Key features
- `stx.fieldTimestamps` tracks per-scalar-field HLC timestamps (replaces `recordVersion` + `fieldVersions`)
- Client update schemas require exactly the scalar op keys in `fieldTimestamps`; malformed, missing, unrelated, and array-delta timestamps are rejected
- Server accepts a client scalar when no stored HLC exists or its valid incoming HLC is newer
- Trusted server writes use `resolveServerUpdateOps()`, which generates one HLC causally after the affected fields' stored clocks
- Losing scalar names are not returned separately; the mutation response entity contains the authoritative values
- Resolution and persistence are separate read/compute/update steps; they do not eliminate concurrent write races

### Echo prevention (sourceId)

Uses `stx.sourceId` to avoid refetching an own create/update echo.

```typescript
// In handleEntityNotification():
if (action !== 'delete' && stx?.sourceId === sourceId) {
  patchEntityStxInCache(entityType, entityId, stx, organizationId);
  return; // Keep the optimistic/server response and only refresh cached stx.
}
```

Each browser tab generates a UUIDv7 `sourceId` on load. Deletes are deliberately not echo-skipped because a deleted row's `stx` may identify an earlier writer. The own-echo return happens before the live seq watermark update; a later catchup can therefore observe that seq again, which is safe but redundant.

### Paused mutation persistence and squashing

Uses React Query's mutation cache. `squashPendingMutation()` and `coalescePendingCreate()` are helpers that entity modules may integrate. The IndexedDB persister only dehydrates mutations whose state is already `isPaused`; with the current `offlineFirst`/`retry: 0` defaults, loss of connectivity alone does not reliably produce that state.

**Scope strategy:**
- The default attachment create/delete hooks use `scope: { id: 'attachment' }`, serializing those operations with the same scope.
- Attachment updates have no scope and can run concurrently.

**Squashing behavior:**
- `squashPendingMutation()` removes pending same-entity updates and returns merged ops: newer scalar values win and array deltas are combined.
- The caller must put those returned ops into the incoming mutation's variables; using them only for optimistic cache state loses the earlier ops when the request executes.
- Restored mutation replay waits for the first app-stream catchup attempt.
- Queued mutation variables are rewritten at boot when the persisted schema ordinal is behind the bundle (see "Schema evolution" below); replay always happens in current shape

**Current attachment limitations:** the update hook invokes `squashPendingMutation()` from `onMutate`, where the new mutation is already pending; the helper does not exclude the caller and removes every matching pending mutation. It then uses the returned merged ops only for the optimistic cache write, leaving the request variables unchanged. Create variables are an array while `coalescePendingCreate()` expects a top-level `{ id, ... }`, and delete only removes pending updates. Finally, the hook variables close over `tenantId`/`organizationId`, while restored mutation defaults expect those IDs in serialized variables. Create/edit, create/delete, cross-update squash, and reload replay are therefore infrastructure intentions, not working guarantees of the default attachment module.

### Create + edit coalescing

For entity modules whose create variables contain a top-level entity `id`, `coalescePendingCreate()` can merge update `ops` into the pending create mutation.

The helper scans pending mutations under the create key, matches `variables.id`, mutates those variables with `Object.assign()`, and tells the update hook to return early. It does not apply array deltas against a full array; it assigns the delta object like any other value.

Entity modules must test their exact variable shapes and replay defaults before relying on coalescing. Persisted mutation defaults also need all routing context (`tenantId`, `organizationId`, etc.) in serializable variables; closure-only context is unavailable after reload.

---

## Schema evolution

Deploys change entity schemas; clients don't update in lockstep. A PWA tab can run last week's bundle with a persisted cache and any already-paused mutations in last week's shape. Breaking changes ship as **append-only lens modules** in `shared/src/schema-evolution/` that declare the change once; the sync engine derives everything else. See [Schema evolution](/docs/page/architecture/schema-evolution) for the module format and the shipping playbook.

There are two runtime seams; the rest is derived schema/configuration:

**1. Server seam: entity evolution contracts.** During a lens's *expand window*, generated schemas accept both old and new field names. Product creates/updates pass through `normalizeCreateItem`/`resolveUpdateOps`; context creates/updates pass through `normalizeBody`. Product normalization canonicalizes `ops` keys **and their `stx.fieldTimestamps` keys** (a renamed scalar must keep its HLC history, or an older offline edit could wrongly win). The normalizers mirror-write the expand-window twin so persisted rows can carry both columns, and product HLC/array-delta resolution sees the normalized keys.

**2. Client seam: boot cache migration in the persister.** The persisted meta record carries a `schemaVersion` ordinal (the lens count baked into the bundle). When it's behind, cached product rows, bundled context queries, and queued mutation variables are rewritten in place: chunked Dexie transactions, pointer advanced atomically in the final write, Web Lock so only one tab runs the pass. Migrations are idempotent, so an interrupted pass safely re-runs. No network involved: a fleet of clients migrating costs the server nothing.

**Multi-tab safety**: tabs announce their schema version on the BroadcastChannel; a tab that sees a higher version (or a newer pointer on disk) marks itself **stale** via `schema-version-guard` and stops persisting: a stale bundle must never write old-shape data over a migrated store. A pointer *ahead* of the bundle on restore means the same thing: restore nothing, never write, let the PWA reload prompt replace the bundle.

**Telemetry and contraction policy**: the configured frontend API client attaches `X-Client-Version`, and backend middleware records its distribution through OTel; Doba lens transforms also report duration/warning metrics. This supplies the intended fleet-floor signal, but the repository does not currently consume that telemetry to enforce contraction timing. `lens:check` enforces append-only modules, collisions, purity, registered entity contracts, and that a contract lens has a preceding expand lens; the configured minimum expand/stale-bundle windows are policy constants, not an automated gate yet.

With an empty lens list (the current state) every seam is a passthrough no-op. The interim escape hatch for breaking changes remains `appConfig.clientCacheVersion` (bump → cache wipe keeping queued mutations), enforced by the `schema-bust-gate` CI job.

---

## Multi-tab coordination

**Architecture**: leader-elected SSE with shared cache persistence.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Tab 1 (Leader)                    Tab 2 (Follower)    Tab 3 (Follower)     │
│  ┌─────────────────┐               ┌─────────────┐     ┌─────────────┐      │
│  │ SSE Connection  │               │  No SSE     │     │  No SSE     │      │
│  └────────┬────────┘               └──────▲──────┘     └──────▲──────┘      │
│           │                               │                   │             │
│           ▼                               │                   │             │
│  ┌─────────────────┐                      │                   │             │
│  │ BroadcastChannel│──────────────────────┴───────────────────┘             │
│  └─────────────────┘                                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key features:**
- Only leader tab opens SSE connection (prevents redundant server connections)
- Leader broadcasts SSE notifications to followers via BroadcastChannel
- All tabs can mutate. During app routes, only the leader's paused mutations pass `shouldDehydrateMutation`; followers keep their paused mutations in memory.
- First tab to acquire Web Lock becomes leader
- Automatic failover: when leader closes, a waiting follower is promoted
- Tabs announce their **schema version** on the channel; a tab running an older bundle marks itself stale and stops persisting (see "Schema evolution" above)

All tabs for a user open `${appConfig.slug}:${userId}`. With `offlineAccess=true` they share the `rq` persistence scope; session mode uses a separate `s-<tab>` scope. Persistence uses a hybrid layout: product queries are individual `queries` records, while context queries and the dehydrated mutation array share one `meta` record per scope. Every tab may persist query changes.

Leader-only mutation dehydration reduces duplicate persisted queues but does not make the shared offline persister a general single-writer system. In the shared `rq` scope, a follower query write can still replace the meta record with its own (usually empty) dehydrated mutation array, and a follower's paused mutation is lost on refresh. This cross-tab mutation/meta overwrite remains a current implementation limitation; schema-version guards protect shape compatibility, not mutation ownership.

---

## TTL cache

The API has one authenticated, token-gated entity cache for detail endpoints. It provides:
- **Request coalescing**: concurrent detail misses for one entity share work
- **Token-gated reuse**: the token is signed for the subscriber's session
- **Short-lived enriched responses**: cached values are endpoint responses, not raw CDC rows

### App cache design

Values are entity-keyed (`entityType:entityId` → enriched response). Tokens are a forward-only index for access control, not cache keys.

| Cache | Key | Token role | TTL | Current route use |
|-------|-----|------------|-----|-------------------|
| **App entity cache** | `{entityType}:{entityId}` | Session-signed access token | 10 min | Attachment detail (`GET .../attachment/{id}`) |

**Forward-only token design (app cache):** Multiple unexpired tokens can point to the same entity key. When an entity changes, the old cache value is replaced with a reserved marker but old tokens still resolve to that key. The first valid request repopulates the latest value; later requests using any still-indexed token can reuse it. No duplicate data entries are created per entity.

### Token flow (app stream only)

When a realtime entity changes, the SSE stream notification includes a `cacheToken`:

```
1. CDC sends message → ActivityBus emits event
   └── reserve(token, entityType, entityId): maps token → entity key, invalidates stale data

2. SSE broadcasts notification with cacheToken to subscribers
   └── Notification: { kind, action, entityType, subjectId, stx, cacheToken }

3. Client receives notification
   └── Stores cacheToken in cache-token-store (entityType:entityId → token)
   └── The handler normally performs a seq-range fetch; a later detail fetch can use the token

4. React Query fetches entity data
   └── GET /attachment/{id} with X-Cache-Token header
   └── Middleware: validate signature → resolve token → entity key → cache lookup
   └── First client to fetch populates entity cache (X-Cache: MISS)
   └── Subsequent clients (any token for same entity) get cache hit (X-Cache: HIT)
```

**Token signing:** Session-signed HMAC. CDC provides base token (nanoid), SSE signs per-subscriber with session token. Server validates signature and extracts base token for resolution.

**Frontend flow:**
- Stream handler stores tokens on notification receive
- Query options check store and add X-Cache-Token header
- Tombstones processed by `cacheOps.removeEntity()` remove the token; the rare hard-delete invalidation path currently leaves its in-memory token to expire server-side

### Request coalescing (singleflight)

N concurrent detail misses for the same entity → 1 handler execution → N responses. Coalescing is by **entity key**, so different valid tokens for the same entity share one in-flight fetch.


### Cache invalidation via ActivityBus

Cache lifecycle follows CDC/ActivityBus events:
- **Create/update (including soft delete):** the CDC WebSocket handler calls `reserve(token, entityType, subjectId)`, mapping the token and replacing any cached value with a reserved marker.
- **Physical delete:** the ActivityBus cache hook calls `invalidateByEntity(entityType, subjectId)`.

The normal live create/update path fetches the notified seq range from the list endpoint and patches React Query. Detail cache reuse occurs when a consumer subsequently requests that entity with `X-Cache-Token`. Batch tokens and reservations exist, but the `batchCache()` middleware is currently unused, so list-range fan-out is not coalesced by this cache.

### Endpoint-first caching

Cache enriched API responses (with signed URLs, relations), not raw CDC rows:

```
Client request → Cache miss → Full handler (enrichment) → Cache response → Return
Subsequent requests → Cache hit → Return cached enriched data
```

### Race condition handling

| Race condition | Mitigation |
|----------------|------------|
| Thundering herd | Request coalescing by entity key (singleflight) |
| Stale tokens after rapid edits | Forward-only: old indexed tokens resolve to the same key; first miss repopulates, later requests reuse the latest value |
| Rapid sequential updates | Each CDC reservation replaces cached data with a reserved marker |
| Read-your-writes | Cache miss falls through to DB |

### Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| App entity cache max size | 5000 entries | ~25-50MB RAM |
| Token index max size | 10000 entries | Lightweight string→string mappings |
| Batch token index max size | 1000 entries | Reserved infrastructure; no route currently consumes it |
| App cache TTL | 10 min | Entity data + token index auto-expire |
| Token signing | Session-signed HMAC | Base token from CDC, signed per subscriber |

---

### Sync priority

Priority routing compares the current route organization with the notification/sync target. The type includes `medium`, but `getSyncPriority()` currently returns only `high` or `low`. It applies in two places:

1. **Live SSE handler**: when a product notification has a seq (the normal create/update path), both priorities run the range fetch. Priority only changes fallback invalidation/refetch behavior. Batch notifications also always range-fetch.
2. **Sync service (Phase B)**: processes current org first, other orgs after (or not at all without `offlineAccess`)

| Priority | Condition | Live SSE behavior | Sync service behavior |
|----------|-----------|--------------------|-----------------------|
| **high** | User is viewing the org that scopes this entity | Seq range fetch; active fallback invalidation | Process first after the service's initial 1s delay |
| **low** | User is elsewhere (different org, not in org route) | Seq range fetch; inactive fallback invalidation. Without seq, mark stale only | Only process if `offlineAccess` (500ms stagger) |

---

### offlineAccess role

The `offlineAccess` toggle controls persistence lifetime, offline stale defaults, and background cache filling. It does not disable live membership handling or reconnect catchup.

| Concern | offlineAccess ON | offlineAccess OFF |
|---------|-----------------|-------------------|
| Cache persistence | `appdb` `rq` scope (survives restart) | `appdb` `s-<tab>` scope (survives refresh, cleared on tab close) |
| Global default staleTime while device is offline | Infinity | 30s |
| Product `syncStaleTime` | Infinity while stream is live; 5 min otherwise (including offline) | Infinity while stream is live; 5 min otherwise (including offline) |
| Product entity sync (current org) | Yes | Yes |
| Phase B product cache fill (other orgs) | Yes | No; module mount/refetch policy applies |
| Membership live/catchup refresh | Yes | Yes |
| Other-org member queries in Phase B | Included | Not included |

---

## Embedded entities

Product entities can embed references to other entities (e.g., tasks embed label objects in their `labels` array). When a source entity changes, these embedded copies go stale. Propagation sends source IDs so the client can patch cached hosts without querying every host row. Live hints need no extra lookup; catchup uses a delta-ID query to construct its hints.

### How it works

A shared config (`appConfig.entityEmbeddings`, defined by the fork's config) declares embedding relationships:

```typescript
entityEmbeddings: [
  { embeddedEntity: 'label', hostEntity: 'task', hostColumn: 'labels' },
];
```

The server attaches a `propagation` hint to SSE notifications and catchup responses for source entity types. The hint contains only source entity IDs that changed, split into `update` (created/updated) and `remove` (deleted); no target entity queries needed.

The client scans cached host list/detail queries using `Set` lookups, replacing or removing embedded objects whose IDs appear in the hint. The template config leaves `entityEmbeddings` empty, so this path is inactive until a fork configures it.

### Integration points

| Flow | When propagation runs | Ordering guarantee |
|------|----------------------|--------------------|
| **Live SSE** | After a non-echo single/batch source range fetch; hard deletes propagate directly | Fresh source data is normally available before update propagation |
| **Catchup** | After all delta-fetches for the org complete | Fresh changed sources are normally cached before update hints patch cached hosts |

An `updatedAt` guard prevents replacing a fresher embedding with an older one. An own create/update echo returns before the propagation branch, so a source edit from the same tab currently needs its mutation cache update to handle embedded hosts or must wait for later reconciliation.


## Yjs editing

Cella includes an optional Yjs CRDT relay for product fields such as a rich-text `description`. The template sets `appConfig.services.yjs.enabled` to `false` and registers no product materializer, so no default entity uses this path.

### Architecture

The Yjs worker is a standalone `yjs/` workspace package (like `cdc/`). During editing it is a **binary relay**: it stores and forwards raw `Uint8Array` updates without parsing each update's document content. Parsing happens for **seeding** (fresh session → `entity.description` → Y.Doc via `@blocknote/server-util` `blocksToYDoc`) and **materialization** (the debounced/final Y.Doc state → description via a secret-gated internal backend endpoint). The relay is the **single writer** for descriptions during collaboration: clients never seed and never persist.

> **Authorization.** The relay authorizes each connection **locally** rather than calling back to the backend. On WS upgrade it verifies the HMAC token, then runs the shared permission engine (the same engine the backend uses) against an RLS-scoped read of the entity scope + the user's memberships; see `yjs/src/data/permissions.ts` (`canEditEntity`). Denied → close `4003`, missing ancestor scope → `4400`, DB/resolver error → `4503`. Sharing the engine keeps the core decision logic aligned; the relay still owns its input loading and transport checks.

> **Schema parity.** The relay builds its BlockNote schema from the same React-free configs the frontend editor uses, in `shared/src/utils/blocknote-schema-configs.ts`, so the ProseMirror node specs are identical on both sides: a doc seeded server-side round-trips through the client editor without loss.

```
Online editing:
  Browser → y-websocket provider → Yjs worker (standalone service, own port)
  Fresh session: relay seeds Y.Doc from entity.description (server-side)
  Relay (debounced 3s, one call per doc regardless of editor count):
    → Save binary state, diff materialized blocks vs last materialization
    → Changed? POST /yjs/materialize (secret-gated, on behalf of the window's
      last editor) → backend re-checks permission, sanitizes media URLs,
      derives fields, stamps server HLC, writes the row
    → CDC detects row change → SSE → non-editing clients update

Offline/solo editing:
  Browser → BlockNote (standalone mode) → JSON save on blur → REST mutation → entity.description
  With the current mutation defaults, a network failure is not guaranteed to remain queued;
  durable offline replay requires the product module to produce a paused mutation
  Next collaborative session re-seeds from the durable entity.description

Other users (non-editing, online):
  CDC detects materialized row change → SSE → TanStack Query cache update
  Non-editing users never connect to Yjs worker
```

### Ephemeral lifecycle

1. First WS connect → relay creates the `yjs_documents` row, seeded server-side from `entity.description` (empty when there is none). Concurrent first-connectors converge on one canonical seed: the insert is `ON CONFLICT DO NOTHING` and every connector re-loads the row afterwards. The seed initializes the materialization diff baseline, so seed-only sessions never write back.
2. During editing → relay stores raw binary state (debounced 3s) and materializes changed content into the entity row in the same window.
3. Last WS disconnect → 5 min grace timer → **final materialization gates row deletion**: backend unreachable keeps the row and reschedules; entity-deleted/permission-revoked (permanent) proceeds. A boot-time sweep recovers rows orphaned by a relay crash (`last_edited_by` carries attribution).
4. On editor close → the client writes a cache-only optimistic summary for instant card updates; the relay's authoritative materialization arrives via SSE moments later.

### SSE suppression while editing

While a Yjs editor is active, the SSE handler skips Yjs-owned fields (description + its derived fields, registered per entity type via `registerYjsOwnedFields`) for that entity: a slightly stale server snapshot must not overwrite the fresher local Y.Doc state. Non-description fields (`labels`, `status`, etc.) still flow through normally. Registration is the client's only collab-mode responsibility besides rendering; unregister happens on editor unmount.

### Derived fields

An opted-in entity registers a materializer with `registerYjsMaterializer`; that operation is responsible for computing derived fields and writing through the entity's standard update path. It uses `resolveServerUpdateOps()`, which advances the server clock past the affected fields' stored timestamps and assigns one new HLC to the materialized scalar update. The template does not register a product materializer by default.

---

## Offline testing

Testing PWA and offline capabilities locally requires a production-style frontend build with the custom Workbox service worker generated through VitePWA's `injectManifest` strategy.

### How it works

1. Backend + CDC start in development mode (`pnpm dev`)
2. Frontend builds the custom Workbox service worker and injects its precache manifest
3. Vite preview uses the port from `appConfig.frontendUrl` (`http://localhost:3000` in development config)
4. Service worker registers on `localhost` (no HTTPS required)

### Quick start

```bash
# Build + preview; the root command also starts backend + CDC in parallel
pnpm offline
```

There is currently no `offline:watch` script.

---

## References

- [TanStack DB Persistence Plan](https://github.com/TanStack/db/issues/865#issuecomment-3699913289) - Multi-tab coordination patterns
- [Hono SSE Streaming](https://hono.dev/docs/helpers/streaming#stream-sse) - SSE helper docs
- [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) - Browser leader election

**Influences:**
- [ElectricSQL](https://electric-sql.com/) - Shape-based sync, PostgreSQL logical replication
- [LiveStore](https://livestore.io/) - SQLite-based sync with event sourcing
- [Sequin](https://sequinstream.com/) - Postgres change data capture with strict ordering, backfills, and exactly-once delivery
- [TinyBase](https://tinybase.org/) - Reactive data store with CRDT support, HLC design influence
- [y-protocols](https://github.com/yjs/y-protocols) - Yjs sync/awareness protocol primitives
- [Teleportal](https://teleportal.tools/) - Local-first sync engine with CRDTs and end-to-end encryption
