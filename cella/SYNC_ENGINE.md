# Cella sync engine

> The [ARCHITECTURE.md](./ARCHITECTURE.md) document explains why Cella uses notify-then-fetch. This document explains the reasoning behind the sync engine. It also provides more details on how a mutation travels through the sync pipeline and how clients stay consistent while online and offline.

## TL;DR

```text
User edits Task.title 
        ▼
Optimistic state applied
        ▼
PATCH /tasks/123
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
React Query fetches task
        ▼
UI updates
```

## Postgres, OpenAPI & React Query

Postgres + OpenAPI + React Query are the foundational primitives. This means standard OpenAPI endpoints remain the default, while product entities are 'upgraded' with transaction tracking, offline support, and realtime streaming. It is a _notify-then-fetch_ sync: A worker notifies the client, which then fetches the new data using an endpoint that is not much diferent in shape compared to the rest of your codebase.

| Entity type | Features | Example |
|------|--------------|---------|
| `ContextEntityType` | Standard REST CRUD, server-generated IDs | `organization` |
| `ProductEntityType` | + Per-field merge strategies (HLC LWW, AWSet), offline queue, Yjs collaborative editing, Live stream (SSE), live cache updates, multi-tab leader election | `page`, `attachment` |

---

## Why a built-in sync engine?

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
- **Logical replication** - CDC Worker receives WAL changes, persists activities to `activitiesTable`, sends messages to API
- **ActivityBus** - Receives CDC messages via WebSocket, emits events to internal handlers
- **Catchup via POST + delta fetch** - Client POSTs `{ cursor, seqs }` to the stream endpoint; server compares per-scope seqs and returns a gap summary. Client then calls REST list endpoints with `?seqCursor=min,max` to fetch changed entities in the known seq range, including soft-delete tombstones.
- **Live stream** - SSE sends lightweight notifications - with cache token - to clients
- **Notify + fetch pattern** - SSE notifications trigger priority-based entity fetches; TTL cache enables efficient fan-out
- **React Query as merge point** - Initial/prefetch load and notification-triggered fetches feed into the same cache

### Realtime mechanics
- **Gap detection** - Entity-type sequence numbers (`seq`) detect missed product entity changes, including soft deletes
- **Single-writer multi-tab** - One leader tab owns SSE connection and mutations, broadcast for follower
- **TTL entity cache** - Server-side cache with request coalescing for efficient notification-triggered fetches
- **Fetch prioritizer** - Client schedules fetches based on user's current view (high/medium/low priority)

### Sync mechanics
- **Upstream-first sync** - Pull before push prevents most conflicts
- **Per-field merge strategies** - Scalars use HLC-based LWW (latest timestamp wins); sets use commutative AWSet deltas (`{ add, remove }`); descriptions use Yjs CRDT via dedicated worker
- **Offline mutation queue** - Persist pending mutations to IndexedDB, replay on reconnect
- **Conflict strategy** - Scalars: latest HLC wins silently (no 409). Sets: commutative, conflict-free. Descriptions: character-level Yjs CRDT merge
- **Yjs collaborative editing** - Standalone WebSocket relay worker for real-time description co-editing; the relay is the single writer — it seeds fresh sessions and materializes descriptions + derived fields server-side
- **Smart mutations** The mutation layer (`query.ts`) encapsulates all sync logic so forms remain simple:

## Architecture

> **SERVER:** CDC Worker → WebSocket → API → SSE fan-out

This architecture uses a persistent WebSocket connection from CDC Worker to API server, provides instant delivery with no poll delay, scales with orgs not with subscribers (multi-tenant security through existing middleware), and reduces round-trips through the database since the CDC Worker already has most of the data.

**CDC transaction batching:** The CDC Worker's `TransactionBuffer` groups WAL events by database transaction and emits batch notifications for same-type, same-context events — reducing N individual messages to 1 per (entityType, action, contextId). A single-context constraint ensures each batch targets one parent context (e.g., one project), so `contextId` and `seqCursor` ranges are correct for all entities in the batch. 

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Push-based stream architecture                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────┐                                       │
│  │ Postgres Logical Replication     │                                       │
│  │ (`entity` + `resource` changes)  │                                       │
│  └──────────┬───────────────────────┘                                       │
│             ▼                                                               │
│  ┌─────────────────────┐     ┌─────────────────────┐                        │
│  │    CDC Worker       │────>│  activitiesTable    │                        │
│  │                     │     │  (INSERT)           │                        │
│  │  After INSERT:      │     └─────────────────────┘                        │
│  │  ws.send(message)   │   // CDC sends message to API                      │
│  │  {activity, entity} │                                                    │
│  │                     │                                                    │
│  └──────────┬──────────┘                                                    │
│             │ WebSocket (persistent, replication backpressure)              │
│             ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    API Server (Hono)                            │        │
│  │                                                                 │        │
│  │  ┌─────────────────────┐                                        │        │
│  │  │ /internal/cdc       │                                        │        │
│  │  │ (WebSocket)         │                                        │        │
│  │  └──────────┬──────────┘                                        │        │
│  │             ▼                                                   │        │
│  │  ┌─────────────────────┐                                        │        │
│  │  │ ActivityBus         │ ───> Emits events for internal use     │        │
│  │  │ (message → event)   │                                        │        │
│  │  └──────────┬──────────┘                                        │        │
│  │             ▼                                                   │        │
│  │  ┌─────────────────────┐                                        │        │
│  │  │ StreamSubscriber    │ Map<channel, Set<BaseStreamSubscriber>>│        │
│  │  │ Manager             │                                        │        │
│  │  │ org:abc [sub1,sub2] │ Fan-out: O(1) lookup + O(subscribers)  │        │
│  │  │ org:xyz [sub3]      │ broadcast per channel                  │        │
│  │  └──────────┬──────────┘                                        │        │
│  │             ▼                                                   │        │
│  │  ┌─────────────────────────────────────────────────────┐        │        │
│  │  │ SSE Stream 1 │ SSE Stream 2 │ SSE Stream 3 │ ...    │        │        │
│  │  │ (org-123)    │ (org-123)    │ (org-456)    │        │        │        │
│  │  └──────┬───────┴──────────────┴──────────────┴────────┘        │        │
│  │         │  event: change                                        │        │
│  │         │  data: { action, entityType, entityId, seq, stx }     │        │
│  │         ▼                                                       │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **CLIENT**: Two-phase sync cycle → SSE/live → priority-based fetch updates

### Notification shapes

Clients handle three notification shapes from the live SSE stream:

| Shape | Detection | Client behavior |
|-------|-----------|----------------|
| **Single entity** | `seq` set, `batchUntilSeq` null | Range fetch that seq and patch caches; tombstones remove cached entities |
| **Create/update batch** | `batchUntilSeq` set | Range fetch via `seqCursor=seq,batchUntilSeq`; live rows upsert, tombstones remove |
| **Hard delete** | `action: 'delete'` | Physical delete (rare, e.g. DB admin); invalidate the scoped list to reconcile — soft deletes arrive as `update` tombstones instead |

Batch notifications carry a `cacheToken` that maps to all entities in the batch, enabling the server's TTL entity cache to serve all subscribers from a single DB query.


## Stream notification format
Synced entity tables have a single transient JSONB column for transaction metadata. It is sent in the SSE notification.

**Why "transient"?** Written by handler during mutation, read by CDC Worker to populate activitiesTable, then overwritten on next mutation. The entity table is NOT the source of truth for sync state—`activitiesTable` is.


```typescript
interface StreamNotification {
  action: 'create' | 'update' | 'delete';
  entityType: string | null;                    // Product entity type (null for membership events)
  resourceType: string | null;                  // 'membership' | 'request' | ... (null for entity events)
  entityId: string;
  organizationId: string | null;
  tenantId: string | null;
  contextType: string | null;                   // Context entity type for membership (e.g., 'project')
  contextId: string | null;                     // Parent entity ID for unseen count grouping
  seq: number | null;                           // Per-entityType sequence stamped by CDC worker (entities only)
  stx: StxBase | null;                          // Sync transaction metadata (entities only)
  cacheToken: string | null;                    // HMAC-signed token for LRU cache access (entities only)
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
  mutationId: string;                           // Unique mutation ID (nanoid)
  sourceId: string;                             // Tab/instance ID for echo prevention
  fieldTimestamps: Record<string, string>;      // Per-field HLC timestamps (scalars only)
}
```

SSE transport wraps this as `event: change`, `id: activityId`, `data: JSON(StreamNotification)`. Other SSE events: `offset` (catchup-complete marker with cursor) and `ping` (keep-alive).

---

## Stream types

Cella has two stream types with different characteristics:

### App stream (`/entities/app/stream`)


Authenticated stream for all user-scoped entities and memberships.

| Aspect | Implementation |
|--------|----------------|
| **Auth** | Requires authentication (session cookie) |
| **Scope** | All contexts user belongs to + memberships |
| **Cursor storage** | Persisted in sync store (survives refresh) |

### Public stream (`/entities/public/stream`)


Unauthenticated stream for public entities (e.g., pages).

| Aspect | Implementation |
|--------|----------------|
| **Auth** | No authentication required |
| **Scope** | All public entity types (from `hierarchy.publicStreamTypes`) |
| **Cursor storage** | In-memory only (module-level variable) |

**How catchup works:**

The backend returns `{ changes, cursor }` where `changes` is keyed by organizationId (app) or entityType (public). Each value is a shared summary shape:
```typescript
interface CatchupChangeSummary {
  entitySeqs?: Record<string, number>;     // Entity-type seqs from context_counters counts JSONB (managed by CDC worker)
  entityCounts?: Record<string, number>;   // Live entity totals (e:{type} keys) for cache integrity
}
```

The client processes catchup in a two-phase sync cycle:

**Phase A (catchup — fast, in connect flow before SSE opens):**
- Compares entity-type `serverEntitySeq` (from `context_counters.counts['s:{type}']`, managed by CDC worker) with stored `clientEntitySeq`; product soft deletes arrive as tombstone rows in seq delta fetches
- If creates/updates detected for an entity type → invalidates active list queries (`invalidateEntityList(keys, 'active')`) so mounted queries refetch immediately
- **Cache integrity check**: Compares server `entityCounts` (from `context_counters.counts['e:{type}']`) with cached list totals — if counts diverge despite matching seqs, invalidates the affected list queries
- Updates stored entity-type seqs
- Always invalidates membership queries (lightweight, deduplicated by React Query)

**Phase B (sync service — background, after SSE reaches `live`):**
- Runs `ensureQueryData` / `ensureInfiniteQueryData` for entity queries
- High priority (current org): resolves staleness immediately — React Query sees stale data and refetches
- Low priority (other orgs): only when `offlineAccess` is on — fills offline cache
- Without `offlineAccess`, non-current orgs refetch naturally via React Query hooks on navigation (`refetchOnMount: true`)

Fallback chain if Phase B doesn't run (SSE fails):
- `refetchOnMount: true` → fresh data when user navigates to a view
- `refetchOnReconnect: true` → refetches stale queries when network returns
- Pull-to-refresh → `invalidateQueries()` forces full active refetch


## Conflict handling

### Three-layer conflict prevention

#### 1. Upstream-first
"Pull before push" - client must be caught up before sending mutations.

**When online:** Stream keeps client continuously up-to-date. Conflicts are rare — only truly concurrent edits to the same field can conflict.

**When offline:** Mutations queue locally, split/squashed by field. On reconnect, catch-up first, THEN replay pending mutations. Client detects conflicts before pushing, enabling side-by-side comparison and per-field resolution.

#### 2. Per-field merge strategies
Each field type has its own merge strategy — no single conflict model for all fields:
- **Scalars** (name, status, points, etc.): HLC-based LWW via `stx.fieldTimestamps`. Latest timestamp wins, older silently dropped. Two users editing different fields = no conflict.
- **Sets** (labels, assignedTo): AWSet delta operations (`{ add, remove }`). Commutative and conflict-free — no timestamps needed.
- **Descriptions**: Yjs CRDT via dedicated WebSocket worker. Character-level merge, no REST conflict path.

The merge strategy is implicit from the value shape in the `ops` key — bare value → LWW scalar, `{ add, remove }` object → AWSet delta.

#### 3. Conflict resolution
No 409 rejections. Scalars: latest HLC timestamp wins silently — the server compares `incoming > stored` per field and accepts or drops. Sets: commutative operations always succeed. Descriptions: Yjs handles merge at character level.

The server returns `droppedFields` in the response so the frontend can optionally notify the user when a scalar edit was silently superseded.

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
│  2. Check: Is stream caught up AND online?                                │
│     │                                                                     │
│     ├── YES ──► 3. mutationFn: Send API request                           │
│     │               │                                                     │
│     │               ├── OK ──► onSuccess: finalize cache                  │
│     │               │   (scalars: HLC wins; sets: delta applied;          │
│     │               │    droppedFields optionally shown to user)          │
│     │               └── FAIL ──► Server/network error → Error toast       │
│     │                                                                     │
│     └── NO ──► 3. Request auto-pauses (React Query networkMode)           │
│                    │                                                      │
│                    └── On reconnect: catch-up stream first, then          │
│                        resumePausedMutations()                            │
└───────────────────────────────────────────────────────────────────────────┘
```

| Scenario | Behavior | Result |
|----------|----------|--------|
| User types rapidly (online) | Debounced, only final sent | No server flood |
| User edits same scalar 5x (offline) | Squashed to 1 entry (LWW) | 1 request on reconnect |
| User adds/removes labels (offline) | AWSet deltas merged | 1 request with combined delta |
| User edits 3 different fields (offline) | 3 separate entries | 3 requests on reconnect |

### Idempotency

Replaying the same mutation (same `stx.mutationId`) produces the same result without side effects. Critical for:
- **Network retries**: Request succeeds but response is lost
- **Offline queue replay**: Some mutations may have reached server before disconnect
- **Crash recovery**: Pending transactions replay from IndexedDB

---

## Offline sync

### Gap detection (seq + tombstones)

Uses entity-type sequence numbers (`seq`) for **create/update/soft-delete detection**. Product deletes are one-way tombstone updates (`deleted_at` set), so they are stamped and fetched like any other product entity mutation.

**Sequence architecture:**
- **`seq`** — Per-entity row sequence stamped by the CDC worker after processing each product-entity create/update, including soft-delete updates. The worker atomically increments `context_counters.counts['s:{entityType}']` and writes the new value back to `entity.seq`. This is the **sole source of truth** for detecting product entity changes. New entities start with `seq = 0` until CDC stamps them (typically within ~50-200ms).
- **Hierarchy-aware scoping** — The CDC worker resolves the entity's direct parent column (derived from `hierarchy.getParent()`) as the context key. For example, `attachment.parent = 'organization'` → key = `organization_id`; `task.parent = 'project'` → key = `project_id`. This means seq is scoped to the nearest context entity, avoiding unnecessary refetches for sibling contexts the user can't access.
- **Membership detection** — Membership changes are detected via the org-level `s:membership` counter and standard membership invalidation.
- **Delete detection** — Product deletes are detected as seq-stamped tombstone rows (`deletedAt != null`) returned by `seqCursor` delta fetches. Physical hard deletes are reserved for post-horizon purge and are not part of normal product sync convergence.
- **`seqCursor`** — Query parameter on list endpoints. Always a bounded range: `seqCursor=min,max` (both inclusive, e.g. `seqCursor=4,6` → `seq >= 4 AND seq <= 6`). The catchup response provides `serverEntitySeq` as the upper bound; batch notifications provide `batchUntilSeq`. Open-ended fetches are not supported — every caller must know its exact seq range.

**Two modes of gap detection:**

1. **Catchup (offline/reconnect):** Client compares stored contextEntity-scoped `clientEntitySeq` (app stream: `{contextEntityId}:s:{entityType}`) or unscoped `clientEntitySeq` (public stream: `{entityType}`) with `serverEntitySeq` from catchup summary (sourced from `context_counters.counts['s:{type}']`, managed by CDC worker). The delta tells whether product entity mutations happened. The delta fetch includes tombstone rows, and the client removes those entities from cache.

2. **Live (SSE):** Each product entity notification includes `seq`, scoped to its entity type + context (e.g., tasks within a project). Client updates stored seq watermark on each notification. On reconnect, the catchup comparison detects any missed changes.

**How it works — scenario:**

A project has tasks. `seq` is stamped by the CDC worker on product INSERT/UPDATE, including soft-delete updates.

```
Server timeline (project-123, tasks):        seq
  Task A created                              1
  Task B created                              2
  Task C created                              3
  ── client goes offline (clientSeq = 3) ──
  Task D created                              4
  Task B soft-deleted                         5
  Task A updated                              6
  Task E created                              7
  ── client reconnects ──
```

Catchup POST returns for this scope:
```
serverSeq: 7
```

Client logic:
```
delta       = serverSeq - clientSeq = 7 - 3 = 4
delta > 0 → delta fetch with seqCursor=4,7
```

The delta fetch (`GET /tasks?seqCursor=4,7`) returns tasks D, B, A, E. Task B has `deletedAt` set, so the client removes it from detail and list caches. The client stores `clientSeq = 7`.

**Why tombstones remain:** the soft-deleted row must remain queryable by `seqCursor` until the hard-purge window is beyond the activities/catchup horizon.


### Cache freshness strategy (staleTime)

Product entity queries use a sync-aware `staleTime` function (`syncStaleTime`) that returns **Infinity** when the sync stream is live, and **5 minutes** as fallback when the stream is somehow disconnected. This prevents redundant refetches on app restart — freshness is controlled by catchup-based seq invalidation and count-based integrity checks, not time-based staleness.

| staleTime | When | Effect |
|-----------|------|--------|
| 30s (global default) | Non-synced queries (users, tenants, requests) | Standard React Query behavior |
| Infinity (`syncStaleTime`) | Product entity queries, stream live | Catchup + count integrity handle freshness exclusively |
| 5 min (`syncStaleTime`) | Product entity queries, stream disconnected | Fallback so queries refresh on navigation |
| Infinity | Offline mode (when device is offline) | Always serve from cache until back online |

Only product entity queries opt in to `syncStaleTime` — they are the only entities covered by the CDC → catchup pipeline. Context entities (organizations, memberships) and non-synced queries keep the global 30s default.

### Cache integrity check (entityCounts)

After seq-based processing, catchup performs a **count integrity check** to detect cache/server drift that seq comparison alone might miss. The backend includes `entityCounts` in the catchup response (maintained by the CDC worker in `context_counters`).

The client compares these server-reported counts against the `total` field from the first page of cached infinite query data. If counts diverge (e.g., cache says 15 items, server says 20), the affected list query is invalidated regardless of seq state.

**What it catches:**
- Creates that got lost (failed refetch after invalidation) → count mismatch → caught
- Deletes that got lost (cache patching failed) → count mismatch → caught
- Content updates with no count change → not caught (but seq comparison already covers this)

**How it works:**
```typescript
// After seq-based processing in catchup:
for (const [entityType, serverCount] of Object.entries(entityCounts)) {
  const cachedTotal = getCachedListTotal(keys, organizationId);
  if (cachedTotal !== null && cachedTotal !== serverCount) {
    invalidateEntityListForOrg(keys, organizationId, 'active');
  }
}
```

**Cost:** Zero extra DB queries — `entityCounts` comes from the same `counts` JSONB column already fetched for `entitySeqs`. On the client, it's a single integer comparison per entity type per org.

### Merge resolution (HLC + AWSet)

Uses per-field merge strategies instead of version-based conflict detection. The merge strategy is implicit from the value shape in the `ops` key.

#### Wire format

All updatable fields — both scalars and sets — go in a single `ops` key. The merge strategy is detected at runtime:
- Bare value (`string | number | boolean | null`) → scalar → LWW with HLC
- Object with `{ add, remove }` → set → AWSet delta

```typescript
// Update request body
{
  ops: {
    name?: string;                                      // scalar → LWW
    status?: number;                                     // scalar → LWW
    labels?: { add?: string[]; remove?: string[] };      // set → AWSet
    assignedTo?: { add?: string[]; remove?: string[] };  // set → AWSet
  };
  stx: StxBase;
}
```

#### HLC (Hybrid Logical Clock)

Combines physical time + logical counter + client ID for causal ordering even with clock drift:

```
Format: "1710500000123:0001:abcde" (unix millis + zero-padded counter + sourceId hash)
Compare: lexicographic string comparison gives correct ordering
```

The `sourceId` suffix (5-char hash) ensures deterministic tie-breaking when two clients generate timestamps at the same logical time. Properties: always advances, breaks ties deterministically, causal ordering guaranteed.

**Client-side (mutation creation):**
```typescript
// Generate HLC timestamps only for scalar fields in ops (skip AWSet deltas)
function createStxForUpdate(ops: Record<string, unknown>): StxBase {
  const fieldTimestamps: Record<string, string> = {};
  for (const [key, value] of Object.entries(ops)) {
    if (!isSetOp(value)) fieldTimestamps[key] = generateHLC();
  }
  return { mutationId: nanoid(), sourceId, fieldTimestamps };
}
```

**Server-side (merge resolution in handlers):**
```typescript
import { resolveFieldConflicts } from '#/sync/field-versions';
import { applyArrayDelta } from '#/sync/array-delta';

// 1. Separate scalars from set ops
// 2. For scalars: HLC-based accept/drop
const { acceptedFields, dropped } = resolveFieldConflicts(
  scalarFields, incomingTimestamps, entity.stx.fieldTimestamps
);

// 3. For sets: apply AWSet deltas (commutative, no conflict check)
for (const [field, delta] of Object.entries(setOps)) {
  acceptedFields[field] = applyArrayDelta(entity[field], delta);
}

// 4. Atomic SQL write resolves HLC conflicts directly:
// UPDATE tasks SET
//   name = CASE WHEN :hlc > (stx->'fieldTimestamps'->>'name') THEN :name ELSE name END,
//   stx = jsonb_set(stx, '{fieldTimestamps}', merged_timestamps)
// WHERE id = :id RETURNING *;
```

#### AWSet properties

Set fields (`labels`, `assignedTo`) use Add-Wins Set delta operations:
- **Idempotent** — add existing = no-op, remove missing = no-op
- **Commutative** — order doesn't matter, result is the same
- **No conflict check** — set fields are not tracked in `fieldTimestamps`

#### Key features
- `stx.fieldTimestamps` tracks per-scalar-field HLC timestamps (replaces `recordVersion` + `fieldVersions`)
- Client generates HLC for each scalar field being changed (not for set fields)
- Server compares HLC: newer wins, older silently dropped — no 409 rejections
- Set fields use commutative AWSet deltas — always succeed
- `droppedFields` returned in response for optional client notification
- Atomic SQL approach eliminates read-write race conditions
- Server advances its HLC clock from incoming timestamps for causal ordering

### Echo prevention (sourceId)

Uses `stx.sourceId` to prevent applying own mutations received from stream.

```typescript
// In handleEntityNotification():
if (stx?.sourceId === sourceId) {
  return; // Skip own mutation
}
```

Each browser tab generates a unique `sourceId` on load, sent with every mutation.

### Mutation queue

Uses React Query's mutation cache with `squashPendingMutation()` and `coalescePendingCreate()`.

**Scope strategy:**
- **Create/delete** mutations use `scope: { id: entityType }` — serializes all create/delete operations per entity type to preserve ordering (create-before-update, no orphaned updates)
- **Update** mutations have **no scope** — fire concurrently for different entities, enabling parallel edits without blocking

**Squashing behavior:**
- Same-entity update mutations squash (cancel pending, keep latest `ops`)
- Delta-aware merge: scalar fields use LWW (last write wins); set fields merge AWSet deltas (`{ add, remove }`)
- On reconnect: pull upstream first, then flush
- Queued mutation variables are rewritten at boot when the persisted schema ordinal is behind the bundle (see "Schema evolution" below) — replay always happens in current shape

**Why no scope on updates?** With scope, ALL updates for an entity type (e.g., all task updates) serialize behind each other. If a user rapidly edits task A then task B, task B waits for task A’s response. Without scope, both fire concurrently.

### Create + edit coalescing

When a user creates an entity offline and edits it before reconnecting, `coalescePendingCreate()` merges update `ops` into the pending create mutation.

This runs at the top of every update mutation’s `onMutate` — before squash or optimistic updates. If a pending create is found for the same entity, the update ops are folded into the create variables (set deltas applied against the create’s full arrays, scalars overwritten) and the update mutation returns early (no separate request needed).

| Scenario | Result |
|----------|--------|
| Create → edit title → edit content → online | 1 create request with final values |
| Create → delete → online | 0 requests (both cancelled) |
| Create (online) → offline → edit → online | 1 update request per field |

---

## Schema evolution (version tolerance)

Deploys change entity schemas; offline clients don't update in lockstep. A PWA tab can run last week's bundle with a persisted cache and queued offline edits in last week's shape. Breaking changes ship as **append-only lens modules** (`shared/src/version-changes/`) that declare the change once; the sync engine derives everything else. See [SCHEMA_EVOLUTION.md](./SCHEMA_EVOLUTION.md) for the module format and the shipping playbook.

Exactly two runtime touch points; the rest is build-time schema generation:

**1. Server seam — inside `resolveUpdateOps` (and `normalizeCreateItem` for creates).** During a lens's *expand window*, the generated ops/create Zod schemas accept both old and new field names, so old-bundle requests pass validation unchanged. `normalizeOps` then canonicalizes `ops` keys **and their `stx.fieldTimestamps` keys** (a renamed scalar must keep its HLC history, or an older offline edit could wrongly win), and mirror-writes the twin field so rows carry both columns. HLC/AWSet resolution only ever sees canonical keys. Responses need no transform: rows dual-emit both field names during the window — old bundles read the old name, new bundles the new one.

**2. Client seam — boot cache migration in the persister.** The persisted meta record carries a `schemaVersion` ordinal (the lens count baked into the bundle). When it's behind, cached product rows, bundled context queries, and queued mutation variables are rewritten in place — chunked Dexie transactions, pointer advanced atomically in the final write, Web Lock so only one tab runs the pass. Migrations are idempotent, so an interrupted pass safely re-runs. No network involved: a fleet of clients migrating costs the server nothing.

**Multi-tab safety**: tabs announce their schema version on the BroadcastChannel; a tab that sees a higher version (or a newer pointer on disk) marks itself **stale** via `schema-version-guard` and stops persisting — a stale bundle must never write old-shape data over a migrated store. A pointer *ahead* of the bundle on restore means the same thing: restore nothing, never write, let the PWA reload prompt replace the bundle.

**Telemetry**: every request carries `X-Client-Version`; the server-side version distribution is the *fleet floor* that gates when the old field may be contracted (dropped). doba lens transforms report duration/warning metrics via otel.

With an empty lens list (the current state) every seam is a passthrough no-op. The interim escape hatch for breaking changes remains `appConfig.clientCacheVersion` (bump → cache wipe keeping queued mutations), enforced by the `schema-bust-gate` CI job.

---

## Multi-tab coordination

**Architecture**: Single-writer, multi-reader using Web Locks API for leader election.

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
- All tabs can mutate, but only leader persists mutations to IndexedDB (followers keep in-memory)
- First tab to acquire Web Lock becomes leader
- Automatic failover: when leader closes, a waiting follower is promoted
- Tabs announce their **schema version** on the channel; a tab running an older bundle marks itself stale and stops persisting (see "Schema evolution" above)

**Why leader-only mutation persistence?**

All tabs of one user share a single IndexedDB record for the React Query cache, inside that user's `appdb` (`${appConfig.slug}:${userId}` — cross-user isolation is structural, see ARCHITECTURE.md "Client storage"). Each persist operation overwrites the entire record. Without leader-only persistence:

```
Problem: Race condition on shared IDB record

Tab A: Edits page, persists cache { mutations: [A1] }
Tab B: Edits page, persists cache { mutations: [B1] }  ← overwrites A1!
Tab A: Refreshes → restores { mutations: [B1] } → replays B1, loses A1

With leader-only (current implementation):

Tab A (leader): Edits → persists { mutations: [A1] }
Tab B (follower): Edits → keeps in-memory only (shouldDehydrateMutation: false)
Tab A: Refreshes → restores [A1] ✓
Tab B: Refreshes → restores [A1] (leader's state) → B1 was lost but A1 is safe
```

The tradeoff: follower mutations are lost on refresh. In practice this is rare — users typically work in one tab, and online mutations complete before refresh.

---

## TTL entity cache

The TTL-based entity cache is **essential for the sync engine to scale**. This cache enables:
- **O(1) fan-out** — One DB query serves all subscribers
- **Thundering herd protection** — Request coalescing prevents duplicate fetches
- **Token-gated security** — Membership-required data cached with short-lived tokens

### Two-tier design

Both tiers are **entity-keyed** (`entityType:entityId` → data). Tokens are a lightweight index for access control, not cache keys.

| Tier | Cache key | Token role | TTL | Use case |
|------|-----------|------------|-----|----------|
| **Public** | `{entityType}:{entityId}` (LRU) | None | 60 min | Public pages (no auth required) |
| **App** | `{entityType}:{entityId}` (TTL) | Access control (forward-only) | 10 min | Authenticated entities (tasks, attachments) |

**Forward-only token design (app cache):** Multiple tokens can point to the same entity key. When an entity changes, the old cache entry is invalidated but old tokens still resolve to the same entity key. This means stale clients with an old token get a cache hit (latest data) instead of a DB round-trip. No duplicate cache entries per entity.

### Token flow (app stream only)

When a realtime entity changes, the SSE stream notification includes a `cacheToken`:

```
1. CDC sends message → ActivityBus emits event
   └── reserve(token, entityType, entityId): maps token → entity key, invalidates stale data

2. SSE broadcasts notification with cacheToken to subscribers
   └── Notification: { action, entityType, entityId, stx, cacheToken }

3. Client receives notification
   └── Stores cacheToken in cache-token-store (entityType:entityId → token)
   └── Invalidates React Query cache to trigger refetch

4. React Query fetches entity data
   └── GET /attachment/{id} with X-Cache-Token header
   └── Middleware: validate signature → resolve token → entity key → cache lookup
   └── First client to fetch populates entity cache (X-Cache: MISS)
   └── Subsequent clients (any token for same entity) get cache hit (X-Cache: HIT)
```

**Token signing:** Session-signed HMAC — CDC provides base token (nanoid), SSE signs per-subscriber with session token. Server validates signature and extracts base token for resolution.

**Frontend flow:**
- Stream handler stores tokens on notification receive
- Query options check store and add X-Cache-Token header
- Tokens removed on entity deletion

### Request coalescing (singleflight)

N concurrent cache misses for the same entity → 1 DB query → N responses. Coalesces by **entity key** (not token), so different tokens for the same entity share one in-flight fetch:


### Cache invalidation via ActivityBus

ActivityBus events manage cache lifecycle:
- **Create/update:** `reserve(token, entityType, entityId)` — maps token to entity key, invalidates stale data
- **Delete:** `invalidateByEntity(entityType, entityId)` — removes entity from cache. No tombstone needed — DB returns 404 if client missed SSE.

**Edit propagation to other clients:** Mutation → DB write → CDC detects change → ActivityBus reserves new token (maps to entity key, invalidates stale data) → SSE broadcasts notification with `cacheToken` → other clients fetch with `X-Cache-Token` → token resolves to entity key → first fetch populates cache → subsequent fetches (any token) hit cache. The editing client patches its own cache optimistically (no refetch needed).

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
| Stale tokens after rapid edits | Forward-only: old tokens resolve to same entity key → cache hit with latest data |
| Concurrent updates | Each ActivityBus event invalidates entity entry, final state correct |
| Read-your-writes | Cache miss falls through to DB |

### Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Public cache max size | 1000 entries | ~5-10MB RAM |
| App entity cache max size | 5000 entries | ~25-50MB RAM |
| Token index max size | 10000 entries | Lightweight string→string mappings |
| Public TTL | 60 min | LRU eviction is primary; TTL is safety net |
| App cache TTL | 10 min | Entity data + token index auto-expire |
| Token signing | Session-signed HMAC | Base token from CDC, signed per subscriber |

---

### Sync priority

Priority routing determines how aggressively the client fetches data, based on the user's current route context. It applies in two places:

1. **Live SSE handler** — determines whether to fetch + patch (high) or invalidate-only (low)
2. **Sync service (Phase B)** — processes current org first, other orgs after (or not at all without `offlineAccess`)

| Priority | Condition | Live SSE behavior | Sync service behavior |
|----------|-----------|--------------------|-----------------------|
| **high** | User is viewing the org that scopes this entity | Fetch entity + patch list cache | Process immediately, no delay |
| **low** | User is elsewhere (different org, not in org route) | Mark stale only | Only process if `offlineAccess` (500ms delay) |

---

### offlineAccess role

The `offlineAccess` toggle controls two things:

| Concern | offlineAccess ON | offlineAccess OFF |
|---------|-----------------|-------------------|
| Cache persistence | `appdb` `rq` scope (survives restart) | `appdb` `s-<tab>` scope (survives refresh, cleared on tab close) |
| StaleTime when offline | Infinity | Default (30s) |
| Product entity staleTime (online) | Infinity (sync-aware) | Infinity (sync-aware) |
| Product entity sync (current org) | Yes | Yes |
| Product entity sync (other orgs) | Yes (offline cache fill) | No (refetch on navigation) |
| Member sync (eager) | Yes | No |

---

## Embedded entity propagation

Product entities can embed references to other entities (e.g., tasks embed label objects in their `labels` array). When a source entity changes, these embedded copies go stale. The propagation system keeps them fresh without extra backend queries.

### How it works

A shared config (`propagationTargets` in `shared/src/propagation-targets.ts`) declares embedding relationships:

```typescript
// source entity type → targets that embed it
const propagationTargets = {
  label: [{ targetType: 'task', field: 'labels' }],
};
```

The server attaches a `propagation` hint to SSE notifications and catchup responses for source entity types. The hint contains only source entity IDs that changed, split into `update` (created/updated) and `remove` (deleted) — no target entity queries needed.

The client scans its own React Query cache using `Set` lookups to find and patch stale embeddings. This is sub-millisecond for typical cache sizes (2K entities with 5 embeddings each = ~10K `Set.has()` calls).

### Integration points

| Flow | When propagation runs | Ordering guarantee |
|------|----------------------|--------------------|
| **Live SSE** | After the source entity's own cache write completes | Fresh source data available in cache |
| **Catchup** | After all delta-fetches for the org complete | Delta-fetched targets already have correct embeddings; only TTL-cached stale copies need patching |

An `updatedAt` guard prevents replacing a fresher embedding with an older one (race protection).


## Yjs collaborative editing

Descriptions on product entities (`task`, `page`, etc.) use Yjs CRDT for real-time collaborative editing via a standalone WebSocket relay worker.

### Architecture

The Yjs worker is a standalone `yjs/` workspace package (like `cdc/`). During editing it is a **binary relay** — it stores and forwards raw `Uint8Array` updates without parsing document content. Content is parsed only at the session boundaries: **seeding** (fresh session → `entity.description` → Y.Doc via `@blocknote/server-util` `blocksToYDoc`) and **materialization** (Y.Doc → description via a secret-gated internal backend endpoint). The relay is the **single writer** for descriptions during collaboration — clients never seed and never persist.

> **Authorization.** The relay authorizes each connection **locally** rather than calling back to the backend. On WS upgrade it verifies the HMAC token, then runs the shared permission engine (`shared/src/permissions`, the same engine the backend uses) against an RLS-scoped read of the entity scope + the user's memberships — see `yjs/src/data/permissions.ts` (`canEditEntity`). Denied → close `4003`, missing ancestor scope → `4400`, DB/resolver error → `4503`. Extracting the engine into `shared` means the relay and the backend can never drift on the same decision.

> **Schema parity.** The relay builds its BlockNote schema from the same React-free configs the frontend editor uses (`shared/blocknote-schema-configs`), so the ProseMirror node specs are identical on both sides — a doc seeded server-side round-trips through the client editor without loss.

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

Offline editing:
  Browser → BlockNote (standalone mode) → JSON save on blur → REST mutation → entity.description
  Pending flushes land in the offline mutation queue and replay on reconnect
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

While a Yjs editor is active, the SSE handler skips Yjs-owned fields (description + its derived fields, registered per entity type via `registerYjsOwnedFields`) for that entity — a slightly stale server snapshot must not overwrite the fresher local Y.Doc state. Non-description fields (`labels`, `status`, etc.) still flow through normally. Registration is the client's only collab-mode responsibility besides rendering; unregister happens on editor unmount.

### Derived fields

Derived fields (`summary`, `checkboxCount`, `keywords`, etc.) are computed server-side on every create/update (authoritative). During collaborative editing they are refreshed by the relay's materialization calls — one per document per save window, with write amplification O(1) in the number of editors. The materialize request carries an empty `fieldTimestamps`, so the stx pipeline stamps a **server HLC** for `description` — LWW semantics against offline solo edits stay coherent. Entities opt in by registering a materializer (`registerYjsMaterializer` in the entity's backend module), a thin wrapper around their standard update operation.

---

## Local offline testing

Testing PWA and offline capabilities locally requires abuild with a Workbox service worker. 

### How it works

1. Backend + CDC start in development mode (`pnpm dev`)
2. Frontend builds with Workbox service worker (precaches all assets)
3. Vite preview server serves the built app on `http://localhost:3000`
4. Service worker registers on `localhost` (no HTTPS required)

### Quick start

```bash
# One-shot: build + preview (backend must be running or will start)
pnpm offline

# Iterative: auto-rebuild on changes + preview
pnpm offline:watch
```

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
