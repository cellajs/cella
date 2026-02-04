# Cella hybrid sync engine

> **Architecture context**: Cella has a dynamic entity model—a 'fork' can have different and/or extended entity config. See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Overview

The **hybrid sync engine** extends Cella's **OpenAPI + React Query** infrastructure with sync and offline capabilities. It is "hybrid" because standard REST/OpenAPI endpoints remain the default, while entity modules *can* be 'upgraded' with transaction tracking, offline support, and realtime streaming.

| Mode | Entity type | Features | Example |
|------|-------------|----------|---------|
| basic | `ContextEntityType` | Standard REST CRUD, server-generated IDs | `organization` |
| realtime | `ProductEntityType` | + Transaction tracking, offline queue, conflict detection, Live stream (SSE), live cache updates, multi-tab leader election | `page`, `attachment` |

---

## Why a built-in sync engine?

External sync solutions bypass REST endpoints, authorization, and caching patterns, forcing all-or-nothing adoption and resulting in poor DX. 

By internalizing the sync engine, cella can make unique combos: audit trail functionality, internal event bus functionality and a unified tracing strategy.

| Concern | External services | Built-in approach |
|---------|-------------------|-------------------|
| **OpenAPI contract** | Bypassed | Extends existing endpoints with `tx` object in entity |
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
- **Logical replication** - A Change Data Capture (CDC) worker receives all changes and inserts them into `activitiesTable`
- **Live stream** - SSE streaming backed by CDC Worker + WebSocket for realtime notifications
- **Catchup-then-SSE pattern** - Catch-up via REST fetch, then SSE for live-only notifications
- **Notify + fetch pattern** - SSE sends lightweight notifications; clients fetch entity data with priority-based scheduling; TTL cache enables efficient fan-out
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
│  │  ws.send(           │                                                    │
│  │   {activity, entity}│                                                    │
│  │  )                  │                                                    │
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
│  │  │ ActivityBus         │ ───> Emit for internal API use         │        │
│  │  │ Emits ActivityEvent │                                        │        │
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
│  │         │  data: { action, entityType, entityId, seq, tx }      │        │
│  │         ▼                                                       │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **CLIENT**: Catchup-then-SSE pattern with priority-based fetching

Two-phase connection: fetch catch-up batch, then SSE for live-only. Stream sends lightweight notifications. Client determines fetch priority based on current view, then fetches entity data via REST.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Connection (catchup-then-SSE)                                          │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 1. Catchup: GET /me/stream?offset=<cursor>                         │ │
│  │    → Returns batch of catch-up activities as JSON                  │ │
│  │    → processCatchupBatch(): deletes, invalidations, membership     │ │
│  │                                                                    │ │
│  │ 2. SSE: GET /me/stream?offset=now&live=sse                         │ │
│  │    → Live notifications only (no catch-up in SSE)                  │ │
│  │    → Server sends offset marker immediately                        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Data Flow                                                              │
│                                                                         │
│  ┌──────────────┐              ┌──────────────────────────────────────┐ │
│  │ useQuery()   │              │  SSE Stream (live-only)              │ │
│  │ pagesQuery   │              │                                      │ │
│  └──────┬───────┘              │  event: change                       │ │
│         │                      │  data: { entityType: 'page',         │ │
│         ▼                      │          entityId: 'abc',            │ │
│  GET /pages?q=X&sort=Y         │          action: 'update',           │ │
│  (full query, pagination)      │          seq: 42 }                   │ │
│         │                      └──────────────┬───────────────────────┘ │
│         │                                     ▼                         │
│         │                      ┌──────────────────────────────────────┐ │
│         │                      │  Determine Priority                  │ │
│         │                      │                                      │ │
│         │                      │  high: viewing this entity/context   │ │
│         │                      │  medium: same org, different view    │ │
│         │                      │  low: elsewhere                      │ │
│         │                      └──────────────┬───────────────────────┘ │
│         │                      ┌──────────────┴───────────────┐         │
│         │                      ▼              ▼               ▼         │
│         │                   [high]        [medium]         [low]        │
│         │                   immediate     debounced       invalidate    │
│         │                      │          (500ms)          only         │
│         │                      │              │               │         │
│         │                      └──────┬───────┘               │         │
│         │                             │                       │         │
│         │                             ▼                       │         │
│         │                      GET /pages/{id}                │         │
│         │                      (single entity fetch)          │         │
│         │                             │                       │         │
│         ▼                             ▼                       ▼         │
│     ┌───────────────────────────────────────────────────────────────┐   │
│     │                    React Query Cache                          │   │
│     │                                                               │   │
│     │  Initial load populates list ──────────────────────────────►  │   │
│     │  Notification fetch updates single entity ─────────────────►  │   │
│     │  Low priority: stale on next access ───────────────────────►  │   │
│     └───────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```



## Stream notification format
Synced entity tables have a single transient JSONB column for transaction metadata. It is sent in the SSE notification.

**Why "transient"?** Written by handler during mutation, read by CDC Worker to populate activitiesTable, then overwritten on next mutation. The entity table is NOT the source of truth for sync state—`activitiesTable` is.


```typescript
interface StreamNotification {
  action: ActivityAction;          // 'create' | 'update' | 'delete'
  entityType: string;              // 'page' | 'attachment'
  entityId: string;
  organizationId: string | null;
  seq: number;                     // Scoped sequence for gap detection
  tx: {
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

### App stream (`/me/stream`)

Authenticated stream for all user-scoped entities and memberships.

| Aspect | Implementation |
|--------|----------------|
| **Auth** | Requires authentication (session cookie) |
| **Scope** | All orgs user belongs to + memberships |
| **Catch-up** | Full activities (create, update, delete) via catchup fetch |
| **Processing** | `processCatchupBatch()` - deletes, invalidations, membership refresh |
| **Cursor storage** | Persisted in sync store (survives refresh) |

### Public stream (`/pages/stream`)

Unauthenticated stream for public entities (e.g., pages).

| Aspect | Implementation |
|--------|----------------|
| **Auth** | No authentication required |
| **Scope** | All public pages |
| **Catch-up** | **Delete activities only** via catchup fetch |
| **Processing** | Remove deleted pages from cache, then invalidate list for `modifiedAfter` refetch |
| **Cursor storage** | In-memory only (module-level variable) |

**Why delete-only catch-up?** Create/update changes are handled via `modifiedAfter` query param on the list endpoint. Only deletes need explicit catch-up since they can't be detected by `modifiedAfter`.

### Catchup-then-SSE pattern (both streams)

Both streams use the same two-phase connection pattern:

```
1. Catchup phase: GET /stream?offset=<cursor>
   └── Returns batch of activities as JSON
   └── Process: deletes, invalidations, etc.
   └── Get new cursor from response

2. SSE phase: GET /stream?offset=now&live=sse
   └── Server sends offset marker immediately
   └── Live notifications only (no catch-up in SSE)
   └── Updates cursor on each notification
```

**Benefits:**
- Catch-up as efficient batch (one HTTP request)
- SSE connection is lightweight (live-only)
- No race between catch-up and live events
- Cursor always up-to-date before SSE starts

---

## Conflict handling

### Three-layer conflict prevention

#### 1. Upstream-first
"Pull before push" - client must be caught up before sending mutations.

**When online:** Stream keeps client continuously up-to-date. Conflicts are rare — only truly concurrent edits to the same field can conflict.

**When offline:** Mutations queue locally, split/squashed by field. On reconnect, catch-up first, THEN replay pending mutations. Client detects conflicts before pushing, enabling side-by-side comparison and per-field resolution.

#### 2. Field-level tracking
Conflicts are scoped to individual fields via `tx.fieldVersions`. Two users editing different fields = no conflict. Multi-field mutations check each changed field independently.

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

Replaying the same mutation (same `tx.id`) produces the same result without side effects. Critical for:
- **Network retries**: Request succeeds but response is lost
- **Offline queue replay**: Some mutations may have reached server before disconnect
- **Crash recovery**: Pending transactions replay from IndexedDB

---

## Offline sync

### Gap detection (seq)

Uses per-scope sequence numbers (`seq`) on activities table for **list-level gap detection**. When `notification.seq > lastSeenSeq + 1`, a gap is detected and list invalidation is triggered.

**How it works:**
```typescript
// Per-scope sequence tracking in memory
const seqStore = new Map<string, number>();

// On each stream notification:
if (seq > lastSeenSeq + 1) {
  // Missed changes - invalidate list for this scope
  queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
}
seqStore.set(scopeKey, seq);
```

**Key features:**
- Tracks last seen `seq` per organization/scope in memory (`seqStore` Map)
- Scope key is `organizationId` or `global:${entityType}` for org-less entities
- Gaps detected when `notification.seq > lastSeenSeq + 1`
- Missed changes trigger list invalidation (refetch from server)
- No persistence needed - React Query handles staleness on reconnect

### Conflict detection (version)

Uses entity-level version numbers (`tx.version`) and field-level versions (`tx.fieldVersions`) for **mutation conflict detection**.

**Client-side (mutation creation):**
```typescript
// Extract baseVersion from cached entity when creating update mutation
function createTxForUpdate(cachedEntity?: EntityWithTx | null): TxMetadata {
  return {
    id: nanoid(),
    sourceId,
    baseVersion: extractVersion(cachedEntity?.tx),  // From cached tx.version
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
const { conflicts } = checkFieldConflicts(changedFields, entity.tx, tx.baseVersion);
throwIfConflicts('entity', conflicts);

// Build updated fieldVersions for ALL changed fields
const fieldVersions = buildFieldVersions(entity.tx?.fieldVersions, changedFields, newVersion);
```

**Key features:**
- `tx.version` increments on every mutation (entity-level)
- `tx.fieldVersions` tracks per-field last-modified version
- Client sends `baseVersion` (version when entity was read)
- Server rejects if ANY field's `fieldVersions[field] > baseVersion`
- Multi-field mutations check ALL changed fields for conflicts
- Enables offline edits with eventual conflict resolution

### Echo prevention (sourceId)

Uses `tx.sourceId` to prevent applying own mutations received from stream.

```typescript
// In handleEntityNotification():
if (tx?.sourceId === sourceId) {
  return; // Skip own mutation
}
```

Each browser tab generates a unique `sourceId` on load, sent with every mutation.

### Mutation queue

Uses React Query's mutation cache with `squashPendingMutation()`.

**Squashing behavior:**
- Same-entity mutations squash (cancel pending, keep latest)
- Version-based conflict detection via `tx.baseVersion`
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

**Why leader-only mutation persistence?** // TODO-025 review this

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

2. CDC detects entity change → ActivityBus emits event
   └── Stream builds notification with cacheToken for each subscriber
   └── SSE notification: { action, entityType, entityId, tx, cacheToken }

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

### Cache invalidation via CDC

CDC events invalidate cache; next request re-fetches with enriched data:

```typescript
activityBus.onAny((event) => {
  if (event.entityType && (event.action === 'update' || event.action === 'delete')) {
    entityCache.invalidateEntity(event.entityType, event.entityId);
  }
});
```

// TODO-026 we need to consider a variant for a list of items because SSE could also trigger a lot of paginated requests.

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
| Concurrent updates | Each CDC event invalidates, final state correct |
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

When a sync notification arrives, the client determines **fetch priority** based on what the user is currently viewing. This uses `entityConfig.ancestors` from the app config and TanStack Router's current route state.

| Priority | Condition | Behavior |
|----------|-----------|----------|
| **high** | User is viewing a context that scopes this entity | Immediate refetch of active queries |
| **medium** | User is in same org but different view, or global entity | Debounced refetch (500ms batch) |
| **low** | User is elsewhere (different org, public page) | Invalidate only, refetch on next access |

**How it works:**
1. Read `entityConfig[entityType].ancestors` to get scoping rules
2. Extract current context from router params (org, workspace, project, etc.)
3. Match notification's `organizationId` against route context
4. If any ancestor matches → high priority; same org → medium; else → low

**Examples with `attachment: { ancestors: ['organization'] }`:**
- User on `/$org-abc/attachments` → attachment in org-abc → **high**
- User on `/$org-abc/members` → attachment in org-abc → **medium**
- User on `/$org-xyz/...` → attachment in org-abc → **low**

**Benefits:**
- No route annotations required—uses existing `entityConfig`
- Automatically adapts when new entities are added
- Works across different apps (cella, raak) with different entity hierarchies

---

## References

- [TanStack DB Persistence Plan](https://github.com/TanStack/db/issues/865#issuecomment-3699913289) - Multi-tab coordination patterns
- [Hono SSE Streaming](https://hono.dev/docs/helpers/streaming#stream-sse) - SSE helper docs
- [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) - Browser leader election

**Influences:**
- [ElectricSQL](https://electric-sql.com/) - Shape-based sync, PostgreSQL logical replication
- [LiveStore](https://livestore.io/) - SQLite-based sync with event sourcing
- [TinyBase](https://tinybase.org/) - Reactive data store with CRDT support
