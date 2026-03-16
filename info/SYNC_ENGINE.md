# Cella hybrid sync engine

> **Architecture context**: Cella has a dynamic entity model—a 'fork' can have different and/or extended entity config. See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Overview

The **hybrid sync engine** extends Cella's **OpenAPI + React Query** infrastructure with sync and offline capabilities. It is "hybrid" because standard REST/OpenAPI endpoints remain the default, while entity modules *can* be 'upgraded' with transaction tracking, offline support, and realtime streaming. The core sync concept is a classic _notify-then-pull_ sync: A worker notifies the client, which then fetches the new data.

| Mode | Entity type | Features | Example |
|------|-------------|----------|---------|
| basic | `ContextEntityType` | Standard REST CRUD, server-generated IDs | `organization` |
| realtime | `ProductEntityType` | + Per-field merge strategies (HLC LWW, AWSet), offline queue, Yjs collaborative editing, Live stream (SSE), live cache updates, multi-tab leader election | `page`, `attachment` |

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

## Why a built-in sync engine?

External sync solutions bypass REST endpoints, authorization, and caching patterns, forcing all-or-nothing adoption and resulting in poor DX. 

By internalizing the sync engine, cella can make unique combos: audit trail functionality, internal event bus functionality and a unified tracing strategy.

| Concern | External services | Built-in approach |
|---------|-------------------|-------------------|
| **OpenAPI contract** | Bypassed | Extends existing endpoints with `stx` object in entity |
| **Authorization** | Requires re-implementing | Reuses `checkPermission()` and existing guards |
| **Schema ownership** | Sync layer dictates patterns | Drizzle/Zod schemas remain authoritative |
| **Opt-in complexity** | All-or-nothing | Progressive: REST → Tracked → Offline → Realtime |
| **React Query** | New reactive layer | Builds on existing TanStack Query cache & hooks |

---

## Core concepts

### Philosophy
- **Extend OpenAPI** - All features work through existing OpenAPI infrastructure
- **React Query base** - Build on top of, not around, TanStack Query
- **Progressive enhancement** - REST for basic stuff; for daily-use stuff you upgrade module into → offline → realtime

### Architecture overview
- **Logical replication** - CDC Worker receives WAL changes, persists activities to `activitiesTable`, sends messages to API
- **ActivityBus** - Receives CDC messages via WebSocket, emits events to internal handlers
- **Live stream** - SSE sends lightweight notifications to clients (no entity data)
- **Catchup is now handled by standard list fetches** - Clients use normal REST list queries (e.g., `/pages`, `/attachments`) to catch up, not the `/stream` endpoint.
- **Stream endpoints are for live notifications only** - SSE endpoints provide real-time updates.
- **Notify + fetch pattern** - SSE notifications trigger priority-based entity fetches; TTL cache enables efficient fan-out
- **React Query as merge point** - Initial/prefetch load and notification-triggered fetches feed into the same cache

### Realtime mechanics
- **Gap detection** - Entity-type sequence numbers (`seq`) detect missed entity changes; deletes always scanned
- **Single-writer multi-tab** - One leader tab owns SSE connection and mutations, broadcast for follower
- **TTL entity cache** - Server-side cache with request coalescing for efficient notification-triggered fetches
- **Fetch prioritizer** - Client schedules fetches based on user's current view (high/medium/low priority)

### Sync mechanics
- **Upstream-first sync** - Pull before push prevents most conflicts
- **Per-field merge strategies** - Scalars use HLC-based LWW (latest timestamp wins); sets use commutative AWSet deltas (`{ add, remove }`); descriptions use Yjs CRDT via dedicated worker
- **Offline mutation queue** - Persist pending mutations to IndexedDB, replay on reconnect
- **Conflict strategy** - Scalars: latest HLC wins silently (no 409). Sets: commutative, conflict-free. Descriptions: character-level Yjs CRDT merge
- **Yjs collaborative editing** - Standalone WebSocket relay worker for real-time description co-editing; client-side materialization of derived fields
- **Smart mutations** The mutation layer (`query.ts`) encapsulates all sync logic so forms remain simple:

## Architecture

> **SERVER:** CDC Worker → WebSocket → API → SSE fan-out

This architecture uses a persistent WebSocket connection from CDC Worker to API server, provides instant delivery with no poll delay, scales with orgs not with subscribers (multi-tenant security through existing middleware), and reduces round-trips through the database since the CDC Worker already has most of the data.

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
│  │  │ ActivityBus         │ ───> Emits events for internal handlers │        │
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
│  │         │  data: { action, entityType, entityId, seq, stx }    │        │
│  │         ▼                                                       │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **CLIENT**: Two-phase sync cycle → SSE/live → priority-based fetch updates


## Stream notification format
Synced entity tables have a single transient JSONB column for transaction metadata. It is sent in the SSE notification.

**Why "transient"?** Written by handler during mutation, read by CDC Worker to populate activitiesTable, then overwritten on next mutation. The entity table is NOT the source of truth for sync state—`activitiesTable` is.


```typescript
interface StreamNotification {
  action: ActivityAction;          // 'create' | 'update' | 'delete'
  entityType: string;              // 'page' | 'attachment'
  entityId: string;
  organizationId: string | null;
  seq: number | null;              // Entity-type sequence stamped by trigger (for sync)
  stx: {
    id: string;                    // Mutation ID
    sourceId: string;              // Tab/instance ID for echo prevention
    fieldTimestamps: Record<string, string>;  // Per-field HLC timestamps (scalars only)
  };
}
```

---

## Stream types

Cella has two stream types with different characteristics:

### App stream (`/entities/app/stream`)


Authenticated stream for all user-scoped entities and memberships.

| Aspect | Implementation |
|--------|----------------|
| **Auth** | Requires authentication (session cookie) |
| **Scope** | All orgs user belongs to + memberships |
| **Catch-up** | Handled by standard REST list fetches (not /stream) |
| **Processing** | Standard list fetches update cache; SSE triggers fetches |
| **Cursor storage** | Persisted in sync store (survives refresh) |

### Public stream (`/entities/public/stream`)


Unauthenticated stream for public entities (e.g., pages).

| Aspect | Implementation |
|--------|----------------|
| **Auth** | No authentication required |
| **Scope** | All public entity types (from `hierarchy.publicActionsTypes`) |
| **Catch-up** | Handled by standard REST list fetches (not /stream) |
| **Processing** | Standard list fetches update cache; SSE triggers fetches |
| **Cursor storage** | In-memory only (module-level variable) |

**How catchup works:**

The backend returns a summary per scope (orgId for app stream, entityType for public stream):
```typescript
interface CatchupChangeSummary {
  deletedIds: string[];   // Entity IDs deleted since cursor (always scanned, watertight)
  entitySeqs?: Record<string, number>;    // Entity-type seqs from context_counters counts JSONB (trigger-managed)
  deletedByType?: Record<string, string[]>; // Deleted IDs grouped by entityType
  entityCounts?: Record<string, number>;  // Entity-type total counts (e:{type} keys) for cache integrity
}
```

The client processes catchup in a two-phase sync cycle:

**Phase A (catchup — fast, in connect flow before SSE opens):**
- Processes deletes by patching both detail and list caches directly (no invalidation, no refetch)
- Compares entity-type `serverEntitySeq` (from trigger-managed `context_counters.counts['s:{type}']`) with stored `clientEntitySeq`
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
│     │               │    droppedFields optionally shown to user)           │
│     │               └── FAIL ──► Server/network error → Error toast        │
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

### Gap detection (seq + always-scan deletes)

Uses entity-type sequence numbers (`seq`) for **create/update detection** and always-scan deletes for **watertight delete detection**.

**Sequence architecture:**
- **`seq`** — Per-entity row sequence stamped by a PostgreSQL BEFORE INSERT/UPDATE trigger (`stamp_entity_seq`). The trigger atomically increments `context_counters.counts['s:{entityType}']` and writes the new value into `entity.seq`. This is the **sole source of truth** for detecting creates/updates.
- **Hierarchy-aware scoping** — The trigger reads the entity's direct parent column (derived from `hierarchy.getParent()`) as the context key. For example, `attachment.parent = 'organization'` → key = `organization_id`; `task.parent = 'project'` → key = `project_id`. Parentless entities use `'public:<entityType>'`. This means seq is scoped to the nearest context entity, avoiding unnecessary refetches for sibling contexts the user can't access.
- **Membership detection** — Membership changes are detected via cursor-bounded activity scan (same scan used for deletes). No counter needed — the client unconditionally refreshes membership queries on every catchup.
- **Delete detection** — Deletes are always scanned from the activities table (cursor-bounded). The `seq` trigger only fires on INSERT/UPDATE, so deletes bypass it entirely. This is by design: always scanning is watertight with no edge cases.
- **`afterSeq`** — Query parameter on list endpoints. Returns entities with `seq > afterSeq`, enabling delta fetches instead of full list refetches.

**Two modes of gap detection:**

1. **Catchup (offline/reconnect):** Client compares stored contextEntity-scoped `clientEntitySeq` (app stream: `{contextEntityId}:s:{entityType}`) or unscoped `clientEntitySeq` (public stream: `{entityType}`) with `serverEntitySeq` from catchup summary (sourced from trigger-managed `context_counters.counts['s:{type}']`). The delta tells whether creates/updates happened. Deletes are always included via activities scan.

2. **Live (SSE):** Each product entity notification includes `seq` (entity-type). Client updates stored seq watermark on each notification. On reconnect, the catchup comparison detects any missed changes.

**How it works:**
```typescript
// Per-scope sequence tracking (persisted in sync store)
// App stream: orgId:s:entityType → contextEntity-scoped seq
// Public stream: entityType → seq
const seqs: Record<string, number> = {};

// During catchup (Phase A) — entity-type granularity:
// Step 1: Apply deletes (always provided by backend, watertight)
for (const [entityType, ids] of Object.entries(deletedByType)) {
  for (const entityId of ids) {
    removeEntityFromCache(entityType, entityId);
    removeEntityFromListCache(entityId, keys);
  }
}

// Step 2: Detect creates/updates via entitySeqs delta
for (const [entityType, serverEntitySeq] of Object.entries(entitySeqs)) {
  const clientEntitySeq = seqs[`${orgId}:s:${entityType}`] ?? 0;
  const deletedForType = deletedByType?.[entityType] ?? [];
  const entityDelta = serverEntitySeq - clientEntitySeq;

  // Only mark stale if creates/updates happened (delta > deletes)
  if (entityDelta > deletedForType.length) {
    invalidateEntityList(keys, 'active'); // Refetch mounted queries immediately
  }

  seqs[`${orgId}:s:${entityType}`] = serverEntitySeq;
}

// During live SSE — tracks entity-type seq only:
if (seq !== null) {
  const key = `${organizationId}:s:${entityType}`;
  if (seq > (seqs[key] ?? 0)) seqs[key] = seq;
}
```

**Key features:**
- Single-level entity-type seq tracking (`orgId:s:attachment`, `orgId:s:page`) — no org-level seq needed
- `seq` on entity rows is stamped atomically by PostgreSQL trigger (`stamp_entity_seq`) — same trigger also updates `context_counters.counts['s:{entityType}']`
- Product entity seqs are fully trigger-managed; membership changes detected via activity scan
- Deletes and membership changes are always scanned from activities table (cursor-bounded) — watertight, no counter tricks
- List endpoints support `afterSeq` query param for delta fetches (`WHERE seq > afterSeq`)
- Persisted across tabs/reloads via localStorage (sync store)
- Catchup summary provides entitySeqs + deletedByType per org — enables entity-type processing
- Catchup marks staleness only; the sync service and React Query hooks handle actual refetching

### Cache freshness strategy (staleTime)

Product entity queries use a sync-aware `staleTime` function (`syncStaleTime`) that returns **Infinity** when the sync stream is live, and **5 minutes** as fallback when the stream is disconnected. This prevents redundant refetches on app restart — freshness is controlled by catchup-based seq invalidation and count-based integrity checks, not time-based staleness.

| staleTime | When | Effect |
|-----------|------|--------|
| 30s (global default) | Non-synced queries (users, tenants, requests) | Standard React Query behavior |
| Infinity (`syncStaleTime`) | Product entity queries, stream live | Catchup + count integrity handle freshness exclusively |
| 5 min (`syncStaleTime`) | Product entity queries, stream disconnected | Fallback so queries refresh on navigation |
| Infinity | Offline mode (when device is offline) | Always serve from cache until back online |

Only product entity queries opt in to `syncStaleTime` — they are the only entities covered by the CDC → catchup pipeline. Context entities (organizations, memberships) and non-synced queries keep the global 30s default.

### Cache integrity check (entityCounts)

After seq-based processing, catchup performs a **count integrity check** to detect cache/server drift that seq comparison alone might miss. The backend includes `entityCounts` in the catchup response — entity-type totals from `context_counters.counts['e:{type}']` (pre-computed by database triggers).

The client compares these server-reported counts against the `total` field from the first page of cached infinite query data. If counts diverge (e.g., cache says 15 items, server says 20), the affected list query is invalidated regardless of seq state.

**What it catches:**
- Creates that got lost (failed refetch after invalidation) → count mismatch → caught
- Deletes that got lost (cache patching failed) → count mismatch → caught
- Content updates with no count change → not caught (but seq comparison already covers this)

**How it works:**
```typescript
// After seq-based processing in catchup:
for (const [entityType, serverCount] of Object.entries(entityCounts)) {
  const cachedTotal = getCachedListTotal(keys, orgId);
  if (cachedTotal !== null && cachedTotal !== serverCount) {
    invalidateEntityListForOrg(keys, orgId, 'active');
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
  stx: StxRequest;
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
function createStxForUpdate(ops: Record<string, unknown>): StxRequest {
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
const { accepted, dropped } = resolveFieldConflicts(
  scalarFields, incomingTimestamps, entity.stx?.fieldTimestamps ?? {}
);

// 3. For sets: apply AWSet deltas (commutative, no conflict check)
for (const [field, delta] of Object.entries(setOps)) {
  accepted[field] = applyArrayDelta(entity[field], delta);
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

**Why leader-only mutation persistence?** // TODO-015 review this

All tabs share a single IndexedDB record for the React Query cache. Each persist operation overwrites the entire record. Without leader-only persistence:

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

| Tier | Key format | TTL | Use case |
|------|-----------|-----|----------|
| **Public** | `{entityType}:{entityId}` (LRU) | 10 min | Public pages (simple LRU, no tokens) |
| **Token-gated** | `token:{prefix}:{entityType}:{entityId}:{version}` | 10 min | Attachments requiring membership |

**Note**: Public entities (like pages) use a simple LRU cache without tokens since no authentication is required. The token-gated cache is only for authenticated entities accessed via app stream.

### Token flow (app stream only)

When a realtime entity changes, the SSE stream notification includes a `cacheToken`:

```
1. User subscribes to SSE stream (/me/stream)
   └── Server verifies membership → connection established

2. CDC sends message → ActivityBus emits event → SSE sends notification
   └── Stream builds notification with cacheToken for each subscriber
   └── Notification: { action, entityType, entityId, stx, cacheToken }

3. Client receives notification
   └── Stores cacheToken in cache-token-store (entityType:entityId → token)
   └── Invalidates React Query cache to trigger refetch

4. React Query fetches entity data
   └── GET /page/{id} with X-Cache-Token header
   └── First client to fetch populates server cache
   └── Subsequent clients get cache hit (X-Cache: HIT)
```

**Token generation:**
- HMAC-signed with `ARGON_SECRET`
- Contains: userId, organizationIds, entityType, entityId, version, expiresAt
- TTL: 10 minutes (matches cache TTL)

**Frontend flow:**
- Stream handler stores tokens on notification receive
- Query options check store and add X-Cache-Token header
- Tokens removed on entity deletion

### Request coalescing (singleflight)

N concurrent cache misses for the same entity → 1 DB query → N responses:

```typescript
const inFlight = new Map<string, Promise<unknown>>();

export async function coalesce<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  
  const promise = fetcher().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
```

### Cache invalidation via ActivityBus

ActivityBus events invalidate cache; next request re-fetches with enriched data:

```typescript
activityBus.onAny((event) => {
  if (event.entityType && (event.action === 'update' || event.action === 'delete')) {
    entityCache.invalidateEntity(event.entityType, event.entityId);
  }
});
```

**On delete:** Just invalidate. No tombstone needed — let DB return 404 if client missed SSE.

### Endpoint-first caching

Cache enriched API responses (with signed URLs, relations), not raw CDC rows:

```
Client request → Cache miss → Full handler (enrichment) → Cache response → Return
Subsequent requests → Cache hit → Return cached enriched data
```

### Race condition handling

| Race condition | Mitigation |
|----------------|------------|
| Thundering herd | Request coalescing (singleflight) |
| Invalidation during fetch | Version in key prevents serving wrong version |
| Token expiry mid-request | Different key, wasted entry naturally expires |
| Concurrent updates | Each ActivityBus event invalidates, final state correct |
| Read-your-writes | Cache miss falls through to DB |

### Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Public cache max size | 1000 entries | ~5-10MB RAM |
| Token cache max size | 5000 entries | ~25-50MB RAM |
| Public TTL | 5 min | Balance freshness vs. load |
| Token TTL | 10 min | Matches token expiry |
| Token secret | `env.ARGON_SECRET` | HMAC-SHA256 signing |

---

### Sync priority

Priority routing determines how aggressively the client fetches data, based on the user's current route context. It applies in two places:

1. **Live SSE handler** — determines whether to fetch + patch (high) or invalidate-only (low)
2. **Sync service (Phase B)** — processes current org first, other orgs after (or not at all without `offlineAccess`)

| Priority | Condition | Live SSE behavior | Sync service behavior |
|----------|-----------|--------------------|-----------------------|
| **high** | User is viewing the org that scopes this entity | Fetch entity + patch list cache | Process immediately, no delay |
| **low** | User is elsewhere (different org, not in org route) | Mark stale only | Only process if `offlineAccess` (500ms delay) |

**How it works:**
1. Extract current org from TanStack Router's matched route context (`getRouteOrgId()`)
2. Match notification's `organizationId` against route org
3. Same org → high priority; else → low priority

**Examples with `attachment: { ancestors: ['organization'] }`:**
- User on `/$org-abc/attachments` → attachment in org-abc → **high** (fetch + patch)
- User on `/$org-abc/members` → attachment in org-abc → **high** (fetch + patch)
- User on `/$org-xyz/...` → attachment in org-abc → **low** (invalidate only)

**Benefits:**
- No route annotations required — uses existing entity hierarchy
- Automatically adapts when new entities are added
- Works across different apps (cella, raak) with different entity hierarchies

---

## Client sync cycle

The client sync cycle is a two-phase process that runs on every stream connect (including reconnects, leader promotion, and circuit breaker recovery). It replaces a separate catchup + prefetch system with a unified flow that works *with* React Query rather than around it.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Client sync cycle                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Stream connect()                                                           │
│     │                                                                       │
│     ▼                                                                       │
│  Phase A: Catchup (synchronous, before SSE opens)                           │
│     │  1. Fetch catchup summary from backend (entitySeqs + deletes)          │
│     │  2. Patch deletes into detail + list caches (no invalidation)          │
│     │  3. Compare entity-type seqs, mark changed types stale                │
│     │  4. Update stored entity-type seqs                                    │
│     │  5. Always refresh memberships (unconditional invalidation)           │
│     │  6. Cache integrity: compare entityCounts vs cached totals            │
│     ▼                                                                       │
│  SSE opens → offset event → state = 'live'                                  │
│     │                                                                       │
│     ▼                                                                       │
│  Phase B: Sync service (background, triggered by 'live' state)              │
│     │  1. Wait 1s (avoid server overload)                                   │
│     │  2. Build menu from cache (context entities + memberships)             │
│     │  3. High priority: ensureQueryData for current org                     │
│     │     → Stale queries (from Phase A) refetch; fresh ones are no-ops     │
│     │  4. Low priority (offlineAccess only): ensureQueryData for other orgs  │
│     │     → 500ms stagger between orgs                                      │
│     ▼                                                                       │
│  Live SSE handles individual notifications going forward                    │
│                                                                             │
│  Fallback (if SSE fails):                                                   │
│     • refetchOnMount: true → data refreshes on navigation                   │
│     • refetchOnReconnect: true → stale queries refetch on network return    │
│     • Pull-to-refresh → invalidates all active queries                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### offlineAccess role

The `offlineAccess` toggle controls two things:

| Concern | offlineAccess ON | offlineAccess OFF |
|---------|-----------------|-------------------|
| Cache persistence | IndexedDB (survives restart) | Session storage (survives refresh) |
| StaleTime when offline | Infinity | Default (30s) |
| Product entity staleTime (online) | Infinity (sync-aware) | Infinity (sync-aware) |
| Product entity sync (current org) | Yes | Yes |
| Product entity sync (other orgs) | Yes (offline cache fill) | No (refetch on navigation) |
| Member sync (eager) | Yes | No |

### Key files

| File | Role |
|------|------|
| `frontend/src/query/realtime/stream-store.ts` | Stream lifecycle (connect → catchup → SSE) |
| `frontend/src/query/realtime/catchup-processor.ts` | Phase A: delete patching + staleness marking |
| `frontend/src/query/realtime/sync-service.ts` | Phase B: priority-based ensureQueryData |
| `frontend/src/query/realtime/app-stream-handler.ts` | Live SSE: fetch + patch (high) or invalidate (low) |
| `frontend/src/query/realtime/cache-ops.ts` | Shared cache primitives (remove, invalidate, fetch+patch) |
| `frontend/src/query/basic/sync-stale-config.ts` | Sync-aware staleTime for product entity queries |
| `frontend/src/offline-config.tsx` | Pure mapping: entity type → sync query options |
| `frontend/src/query/provider.tsx` | Wires sync service to stream 'live' state transitions |
| `frontend/src/store/sync.ts` | Persisted seqs, cursor, lastSyncAt |
| `frontend/src/query/offline/squash-utils.ts` | Delta-aware mutation squashing + create-edit coalescing |
| `frontend/src/query/offline/stx-utils.ts` | Client-side stx metadata creation (mutationId, sourceId, HLC fieldTimestamps) |
| `frontend/src/query/offline/hlc.ts` | Per-tab HLC clock (generateHLC, advanceClock) |
| `frontend/src/query/offline/array-delta.ts` | AWSet delta computation + application for set fields |
| `frontend/src/modules/common/blocknote/use-derived-fields-sender.ts` | Debounced client-side materialization → REST |
| `backend/src/sync/field-versions.ts` | HLC-based scalar merge resolution (accept/drop) |
| `backend/src/sync/array-delta.ts` | AWSet delta schema + server-side application |
| `backend/src/sync/hlc.ts` | HLC create/compare/serialize utilities |
| `backend/src/sync/build-stx.ts` | Build stx with fieldTimestamps for entity writes |

---

## Yjs collaborative editing

Descriptions on product entities (`task`, `page`, etc.) use Yjs CRDT for real-time collaborative editing via a standalone WebSocket relay worker.

### Architecture

The Yjs worker is a standalone `yjs/` workspace package (like `cdc/`). It is a **pure binary relay** — the server never instantiates a `Y.Doc`. It stores and relays raw `Uint8Array` updates with zero document memory.

```
Online editing:
  Browser → y-websocket provider → Yjs worker (standalone service, own port)
  Client (debounced 3s):
    → Compute derived fields from local Y.Doc (summary, keywords, checkboxCount, etc.)
    → PATCH /:entityType/:entityId/derived → backend validates + writes to entity table
    → CDC detects row change → SSE → non-editing clients update

Offline editing:
  Browser → BlockNote → JSON save on blur → REST mutation → entity.description
  On reconnect: y-websocket connects, client initializes Y.Doc from entity.description

Other users (non-editing, online):
  CDC detects materialized row change → SSE → TanStack Query cache update
  Non-editing users never connect to Yjs worker
```

### Key design decisions

| Decision | Choice | Rationale |
|----------|--------|----------|
| Transport | Standalone service on own port | Isolates CPU/memory from API; independent scaling |
| Server Y.Doc | **None — pure binary relay** | Zero memory per active document; horizontally trivial |
| Storage | **Ephemeral** — `yjs_documents` row exists only during active editing sessions | Entity table is the single source of truth; no drift between two sources |
| Materialization | **Client-side** — debounced REST call sends derived fields | Client already has the hydrated Y.Doc; no server re-hydration needed |
| Auth | HMAC-signed token (same pattern as `cache-token-signer.ts`) | API signs token, worker verifies with shared secret |
| Frontend provider | `y-websocket` (official, 3KB) | Battle-tested; auto-reconnect; BlockNote supports natively |
| Server BlockNote dep | **None** | All block/description processing is client-side |

### Ephemeral lifecycle

1. First WS connect → relay creates `yjs_documents` row (empty state). Client pushes Y.Doc (initialized from `entity.description` JSON via `initialContent`).
2. During editing → relay stores raw binary state (debounced 3s). Subsequent clients sync from stored state.
3. Last WS disconnect → 5 min grace timer. If no reconnect → deletes `yjs_documents` row.
4. On editor close → flush derived fields via REST (cancel debounce, fire with `keepalive: true`), seed TanStack Query cache from editor state.

### SSE suppression while editing

While a Yjs editor is active, the SSE handler skips description-derived fields for that entity (to avoid overwriting the fresher local Y.Doc state). Non-description fields (`labels`, `status`, etc.) still flow through normally. On editor close, the query cache is seeded from the editor state and normal SSE flow resumes.

### Client-side derived fields

Per-entity materialization (derived fields like `summary`, `checkboxCount`, `keywords`) is computed entirely on the client. After a debounce (3s), the client sends computed fields via `PATCH /:entityType/:entityId/derived`. HLC timestamps guard against stale overwrites (same Phase B infrastructure). This eliminates `@blocknote/server-util` from the server entirely.

### Checked state

Checkbox checked state lives in BlockNote block props (`checklistItem.props.checked: boolean`), not in a separate column. Checkbox toggles are Y.Doc updates synced via Yjs in real-time. Two materialized counters (`checkboxCount`, `checkedCount`) on the task entity support list rendering performance.

For full implementation details, see [FIELD_MERGE_STRATEGIES.md](./FIELD_MERGE_STRATEGIES.md) Phase C.

---

## Local offline testing

Testing PWA and offline capabilities locally requires a production-style build with a real Workbox service worker. The `offline` scripts provide a one-command workflow for this.

### Commands

| Command | What it does | Best for |
|---------|-------------|----------|
| `pnpm offline` | Starts backend+CDC, builds frontend, serves via preview server | One-off validation before PR |
| `pnpm offline:watch` | Same, but frontend rebuilds automatically on file changes | Active offline feature development |
| `pnpm dev` + DevTools Offline | Standard dev server, toggle Network → Offline in DevTools | Mutation queue/sync logic (no SW) |

### How it works

1. Backend + CDC start in development mode (`DEV_MODE=full`)
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

Then in the app:
1. Open preferences and toggle **Offline access** on
2. Wait for sync to complete (check console for `[Sync]` logs)
3. Open DevTools → Network → check **Offline**
4. Refresh the page — app loads from SW cache
5. Create/edit entities — mutations queue locally
6. Uncheck Offline — mutations replay and sync

---

## References

- [TanStack DB Persistence Plan](https://github.com/TanStack/db/issues/865#issuecomment-3699913289) - Multi-tab coordination patterns
- [Hono SSE Streaming](https://hono.dev/docs/helpers/streaming#stream-sse) - SSE helper docs
- [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) - Browser leader election

**Influences:**
- [ElectricSQL](https://electric-sql.com/) - Shape-based sync, PostgreSQL logical replication
- [LiveStore](https://livestore.io/) - SQLite-based sync with event sourcing
- [TinyBase](https://tinybase.org/) - Reactive data store with CRDT support, HLC design influence
- [y-protocols](https://github.com/yjs/y-protocols) - Yjs sync/awareness protocol primitives

**Design documents:**
- [FIELD_MERGE_STRATEGIES.md](./FIELD_MERGE_STRATEGIES.md) - Per-field merge strategy implementation plan (LWW, AWSet, Yjs)
