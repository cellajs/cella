# Cella hybrid sync engine

> **Architecture context**: Cella has a dynamic entity model—a 'fork' can have different and/or extended entity config. See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Overview

The **hybrid sync engine** extends Cella's **OpenAPI + React Query** infrastructure with sync and offline capabilities. It is "hybrid" because standard REST/OpenAPI endpoints remain the default, while entity modules *can* be 'upgraded' with transaction tracking, offline support, and realtime streaming. The core sync concept is a classic _notify-then-pull_ sync: A worker notifies the client, which then fetches the new data.

| Mode | Entity type | Features | Example |
|------|-------------|----------|---------|
| basic | `ContextEntityType` | Standard REST CRUD, server-generated IDs | `organization` |
| realtime | `ProductEntityType` | + Transaction tracking, offline queue, conflict detection, Live stream (SSE), live cache updates, multi-tab leader election | `page`, `attachment` |

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
- **Gap detection** - Scoped sequence numbers (`seq`) detect missed entity changes
- **Single-writer multi-tab** - One leader tab owns SSE connection and mutations, broadcast for follower
- **TTL entity cache** - Server-side cache with request coalescing for efficient notification-triggered fetches
- **Fetch prioritizer** - Client schedules fetches based on user's current view (high/medium/low priority)

### Sync mechanics
- **Upstream-first sync** - Pull before push prevents most conflicts
- **Version-based conflict detection** - Integer version counters per entity and per field
- **Offline mutation queue** - Persist pending mutations to IndexedDB, replay on reconnect
- **Conflict strategy** - Reject on version (field) mismatch (409), client retries with fresh data
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
│  │         │  data: { action, entityType, entityId, seq, seqAt, stx } │        │
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
  seq: number;                     // Org-level sequence for gap detection
  seqAt: number;                   // Per-entity sequence stamped by trigger (for delta fetch)
  stx: {
    id: string;                    // Mutation ID
    sourceId: string;              // Tab/instance ID for echo prevention
    version: number;               // Entity version after mutation
    fieldVersions: Record<string, number>;
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
  seq: number;            // Current max seq for this scope (org-level, CDC-managed)
  deletedIds: string[];   // Entity IDs deleted since cursor
  entitySeqs?: Record<string, number>;    // Per-entityType seqs from context_counters counts JSONB (trigger-managed)
  deletedByType?: Record<string, string[]>; // Deleted IDs grouped by entityType
  entityCounts?: Record<string, number>;  // Per-entityType total counts (e:{type} keys) for cache integrity
}
```

The client processes catchup in a two-phase sync cycle:

**Phase A (catchup — fast, in connect flow before SSE opens):**
- Processes deletes by patching both detail and list caches directly (no invalidation, no refetch)
- Compares per-entityType `serverEntitySeq` (from trigger-managed `context_counters.counts['s:{type}']`) with stored `clientEntitySeq`
- If creates/updates detected for an entity type → invalidates active list queries (`invalidateEntityList(keys, 'active')`) so mounted queries refetch immediately
- **Cache integrity check**: Compares server `entityCounts` (from `context_counters.counts['e:{type}']`) with cached list totals — if counts diverge despite matching seqs, invalidates the affected list queries
- Updates stored seqs (both org-level and per-entityType)

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

#### 2. Field-level tracking
Conflicts are scoped to individual fields via `stx.fieldVersions`. Two users editing different fields = no conflict. Multi-field mutations check each changed field independently.

#### 3. Conflict strategy
Server rejects conflicting mutations with 409 status. Client must refetch, rebase changes onto fresh data, and retry. No silent overwrites.

### Conflict flow

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
│     │               └── CONFLICT (409) ──► Show resolution UI             │
│     │                                                                     │
│     └── NO ──► 3. Request auto-pauses (React Query networkMode)           │
│                    │                                                      │
│                    └── On reconnect: catch-up stream first, then          │
│                        resumePausedMutations(), resolve any conflicts     │
└───────────────────────────────────────────────────────────────────────────┘
```

| Scenario | Behavior | Result |
|----------|----------|--------|
| User types rapidly (online) | Debounced, only final sent | No server flood |
| User edits same field 5x (offline) | Squashed to 1 entry | 1 request on reconnect |
| User edits 3 different fields (offline) | 3 separate entries | 3 requests on reconnect |

### Idempotency

Replaying the same mutation (same `stx.mutationId`) produces the same result without side effects. Critical for:
- **Network retries**: Request succeeds but response is lost
- **Offline queue replay**: Some mutations may have reached server before disconnect
- **Crash recovery**: Pending transactions replay from IndexedDB

---

## Offline sync

### Gap detection (seq)

Uses per-scope sequence numbers (`seq`) for **list-level gap detection**. Seq is monotonic (never decremented by deletes) and scoped per org (app stream) or per entityType (public stream).

**Sequence architecture:**
- **`seqAt`** — Per-entity row sequence stamped by a PostgreSQL BEFORE INSERT/UPDATE trigger (`stamp_entity_seq_at`). The trigger atomically increments `context_counters.counts['s:{entityType}']` and writes the new value into `entity.seqAt`. This is the source of truth for per-entityType sequences.
- **Hierarchy-aware scoping** — The trigger reads the entity's direct parent column (derived from `hierarchy.getParent()`) as the context key. For example, `attachment.parent = 'organization'` → key = `organization_id`; `task.parent = 'project'` → key = `project_id`. Parentless entities use `'public:<entityType>'`. This means seq is scoped to the nearest context entity, avoiding unnecessary refetches for sibling contexts the user can't access.
- **`seq` / `mSeq`** — Org-level counters managed by CDC Worker's `getNextSeq()`. Used for coarse gap detection (has anything changed in this org?). The trigger does NOT touch these.
- **`afterSeq`** — Query parameter on list endpoints. Returns entities with `seqAt > afterSeq`, enabling delta fetches instead of full list refetches.

**Two modes of gap detection:**

1. **Catchup (offline/reconnect):** Client compares stored per-entityType `clientEntitySeq` with `serverEntitySeq` from catchup summary (sourced from trigger-managed `context_counters.counts['s:{type}']`). The delta tells whether creates/updates happened beyond just deletes.

2. **Live (SSE):** Each notification includes `seq` (org-level) and `seqAt` (per-entity). Client updates stored seq on each notification. On reconnect, the catchup summary comparison detects any missed changes.

**How it works:**
```typescript
// Per-scope sequence tracking (persisted in sync store)
// App stream: orgId → seq, orgId:s:entityType → per-entityType seq
// Public stream: entityType → seq
const seqs: Record<string, number> = {};

// During catchup (Phase A) — per-entityType granularity:
for (const [entityType, serverEntitySeq] of Object.entries(entitySeqs)) {
  const clientEntitySeq = seqs[`${orgId}:s:${entityType}`] ?? 0;
  const deletedForType = deletedByType?.[entityType] ?? [];
  const entityDelta = serverEntitySeq - clientEntitySeq;

  // Patch deletes directly into list caches (no invalidation)
  for (const entityId of deletedForType) {
    removeEntityFromCache(entityType, entityId);
    removeEntityFromListCache(entityId, keys);
  }

  // Only mark stale if creates/updates happened (delta > deletes)
  if (entityDelta > deletedForType.length) {
    invalidateEntityList(keys, 'active'); // Refetch mounted queries immediately
  }

  seqs[`${orgId}:s:${entityType}`] = serverEntitySeq;
}

// During live SSE — tracks both org-level and per-entityType:
if (seq !== null && organizationId) {
  seqs[organizationId] = seq;
}
if (seqAt !== null) {
  const key = `${organizationId}:s:${entityType}`;
  if (seqAt > (seqs[key] ?? 0)) seqs[key] = seqAt;
}
```

**Key features:**
- Two-level seq tracking: org-level (`orgId`) for coarse gap detection + per-entityType (`orgId:s:attachment`) for granularity
- `seqAt` on entity rows is stamped atomically by PostgreSQL trigger (`stamp_entity_seq_at`) — same trigger also updates `context_counters.counts['s:{entityType}']`
- CDC only increments org-level `seq`/`mSeq` columns (for gap detection), not per-entityType counts
- List endpoints support `afterSeq` query param for delta fetches (`WHERE seq_at > afterSeq`)
- Persisted across tabs/reloads via localStorage (sync store)
- Catchup summary provides entitySeqs + deletedByType per org — enables per-entityType processing
- Catchup marks staleness only; the sync service and React Query hooks handle actual refetching
- Fallback to org-level invalidation when backend doesn't provide `entitySeqs` (backward compat)

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

After seq-based processing, catchup performs a **count integrity check** to detect cache/server drift that seq comparison alone might miss. The backend includes `entityCounts` in the catchup response — per-entityType totals from `context_counters.counts['e:{type}']` (pre-computed by database triggers).

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

### Conflict detection (version)

Uses entity-level version numbers (`stx.version`) and field-level versions (`stx.fieldVersions`) for **mutation conflict detection**.

**Client-side (mutation creation):**
```typescript
// Extract baseVersion from cached entity when creating update mutation
function createStxForUpdate(cachedEntity?: EntityWithStx | null): StxMetadata {
  return {
    id: nanoid(),
    sourceId,
    baseVersion: extractVersion(cachedEntity?.stx),  // From cached stx.version
  };
}
```

**Server-side (conflict check in handlers):**
```typescript
import { checkFieldConflicts, throwIfConflicts, buildFieldVersions, getChangedTrackedFields } from '#/sync/field-versions';

// Get all tracked fields that are being updated
const trackedFields = ['name', 'content', 'status'] as const;
const changedFields = getChangedTrackedFields(payload, trackedFields);

// Field-level conflict detection - check ALL changed fields
const { conflicts } = checkFieldConflicts(changedFields, entity.stx, stx.lastReadVersion);
throwIfConflicts('entity', conflicts);

// Build updated fieldVersions for ALL changed fields
const fieldVersions = buildFieldVersions(entity.stx?.fieldVersions, changedFields, newVersion);
```

**Key features:**
- `stx.version` increments on every mutation (entity-level)
- `stx.fieldVersions` tracks per-field last-modified version
- Client sends `baseVersion` (version when entity was read)
- Server rejects if ANY field's `fieldVersions[field] > baseVersion`
- Multi-field mutations check ALL changed fields for conflicts
- Enables offline edits with eventual conflict resolution

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

Uses React Query's mutation cache with `squashPendingMutation()`.

**Squashing behavior:**
- Same-entity mutations squash (cancel pending, keep latest)
- Version-based conflict detection via `stx.baseVersion`
- On reconnect: pull upstream first, check for conflicts, then flush

### Create + edit coalescing

When a user creates an entity offline and edits it before reconnecting, mutations are coalesced into a single create request.

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
│     │  1. Fetch catchup summary from backend (seq + entitySeqs + deletes)    │
│     │  2. Patch deletes into detail + list caches (no invalidation)          │
│     │  3. Compare per-entityType seqs, mark changed types stale             │
│     │  4. Update stored seqs (org-level + per-entityType)                   │
│     │  5. Handle membership changes (mSeq gap detection)                    │
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

---

## References

- [TanStack DB Persistence Plan](https://github.com/TanStack/db/issues/865#issuecomment-3699913289) - Multi-tab coordination patterns
- [Hono SSE Streaming](https://hono.dev/docs/helpers/streaming#stream-sse) - SSE helper docs
- [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) - Browser leader election

**Influences:**
- [ElectricSQL](https://electric-sql.com/) - Shape-based sync, PostgreSQL logical replication
- [LiveStore](https://livestore.io/) - SQLite-based sync with event sourcing
- [TinyBase](https://tinybase.org/) - Reactive data store with CRDT support
