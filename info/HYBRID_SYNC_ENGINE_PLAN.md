# Cella hybrid sync engine

> **Architecture context**: Cella has a dynamic entity model—a 'fork' can have different and extended entity compositions. See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Overview

The **hybrid sync engine** extends Cella's **OpenAPI + React Query** infrastructure with sync and offline capabilities. It is "hybrid" because standard REST/OpenAPI endpoints remain the default, while entity modules *can* be 'upgraded' with transaction tracking, offline support, and realtime streaming.

| Mode | Entity type | Features | Example |
|------|-------------|----------|---------|
| basic | `EntityType` | Standard REST CRUD, server-generated IDs | `organization` |
| offline | `OfflineEntityType` | + `{ data, tx }` wrapper, transaction tracking, offline queue, conflict detection | (currently empty) |
| realtime | `RealtimeEntityType` | + Live stream (SSE), live cache updates, multi-tab leader election | `page`, `attachment` |

---

## Why a built-in sync engine?

External sync solutions bypass REST endpoints, authorization, and caching patterns, forcing all-or-nothing adoption and resulting in poor DX. By internalizing the entire sync engine, cella can make unique combos: audit trail functionality, internal event bus functionality and a unified tracing strategy.

| Concern | External services | Built-in approach |
|---------|-------------------|-------------------|
| **OpenAPI contract** | Bypassed | Extends existing endpoints with `{ data, tx }` wrapper |
| **Authorization** | Requires re-implementing | Reuses `isPermissionAllowed()` and existing guards |
| **Schema ownership** | Sync layer dictates patterns | Drizzle/Zod schemas remain authoritative |
| **Opt-in complexity** | All-or-nothing | Progressive: REST → Tracked → Offline → Realtime |
| **React Query** | New reactive layer | Builds on existing TanStack Query cache |

---

## Terminology

| Term | Definition |
|------|------------|
| **Activity** | A record in `activitiesTable` representing an entity change |
| **Activity log** | The `activitiesTable` as durable storage of all entity changes |
| **Live stream** | Org-scoped SSE connection for realtime entity updates |
| **Stream message** | The SSE payload containing entity data and transaction metadata |
| **Mutation** | A client-initiated change identified by `tx.id` |
| **Upstream-first** | Pull latest server state before pushing mutations |
| **LWW** | Last Write Wins—conflict resolution where server value wins |
| **Squashing** | Merging multiple mutations to the same field into one |
| **Leader tab** | The one browser tab that owns the SSE connection |
| **Source ID** | Identifies which tab/instance made a mutation (for echo prevention) |
| **Version** | Integer counter incremented on every entity mutation |
| **Seq** | Scoped sequence number for gap detection |
| **baseVersion** | The entity version when client last read it, sent with mutations for conflict detection |

---

## Core concepts

### Philosophy
- **Extend OpenAPI** - All features work through existing OpenAPI infrastructure
- **React Query base** - Build on top of, not around, TanStack Query
- **Progressive enhancement** - REST for basic stuff; for daily-use stuff you upgrade module into → offline → realtime

### Architecture overview
- **Leverage CDC Worker** - Use `activitiesTable` as durable activity log
- **Live stream** - SSE streaming backed by CDC Worker + WebSocket for realtime notifications
- **Separation of concerns** - LIST endpoints handle queries/filtering; live stream notifies of changes
- **React Query as merge point** - Initial/prefetch load and notification-triggered fetches feed into the same cache
- **Notify + fetch pattern** - SSE sends lightweight notifications; clients fetch entity data with priority-based scheduling; LRU cache enables efficient fan-out

### Sync mechanics
- **Gap detection** - Scoped sequence numbers (`seq`) detect missed entity changes
- **Single-writer multi-tab** - One leader tab owns SSE connection and broadcasts to followers
- **LRU entity cache** - Server-side cache with request coalescing for efficient notification-triggered fetches
- **Fetch prioritizer** - Client schedules fetches based on user's current view (high/medium/low priority)
- **Upstream-first sync** - Pull before push prevents most conflicts
- **Version-based conflict detection** - Integer version counters per entity and per field
- **Offline mutation queue** - Persist pending mutations to IndexedDB, replay on reconnect
- **Field-level versioning** - `tx.fieldVersions` tracks individual field versions
- **Conflict strategy** - Reject on version (field) mismatch (409), client retries with fresh data

### Mutation layer

The mutation layer (`query.ts`) encapsulates all sync logic so forms remain simple:
1. Read `tx.version` from cached entity for conflict detection
2. Generate tx metadata: `id` (nanoid), `sourceId`, `baseVersion`
3. Apply optimistic updates immediately, rollback on error
4. Cancel redundant in-flight mutations for the same entity

**Form contract**: Forms call `updateMutation.mutate({ id, data })` - no sync knowledge required.


## Architecture

> **SERVER:** CDC Worker → WebSocket → API → SSE fan-out

This architecture uses a persistent WebSocket connection from CDC Worker to API server, provides instant delivery with no poll delay, scales with orgs not with subscribers (multi-tenant security through existing middleware), and reduces round-trips through the database since the CDC Worker already has the data.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Push-based stream architecture                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PostgreSQL                                                                 │
│  ┌──────────────────────────────────┐                                       │
│  │ Logical Replication              │                                       │
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
│  │  │ ActivityBus         │ ───> Event for internal API use        │        │
│  │  │ Emits ActivityEvent │                                        │        │
│  │  └──────────┬──────────┘                                        │        │
│  │             ▼                                                   │        │
│  │  ┌─────────────────────┐                                        │        │
│  │  │ StreamSubscriber    │  Map<orgId, Set<LiveStreamConnection>> │        │
│  │  │ Manager             │                                        │        │
│  │  │ org-123: [stream1,  │  Fan-out: O(1) lookup + O(subscribers) │        │
│  │  │           stream2]  │  broadcast per org                     │        │
│  │  │ org-456: [stream3]  │                                        │        │
│  │  └──────────┬──────────┘                                        │        │
│  │             ▼                                                   │        │
│  │  ┌─────────────────────────────────────────────────────┐        │        │
│  │  │ SSE Stream 1 │ SSE Stream 2 │ SSE Stream 3 │ ...    │        │        │
│  │  │ (org-123)    │ (org-123)    │ (org-456)    │        │        │        │
│  │  └──────────────┴──────────────┴──────────────┴────────┘        │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

> **CLIENT**: LIST for initial load, live stream for deltas

Client filters and dedupes. Stream delivers org changes - only filtered by permission - to simplify server implementation and allow client-side flexibility for filtering by entity type or other criteria.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Initial Load:              2. Subscribe to Updates:                 │
│     React Query                  Live Stream                            │
│     ┌──────────────┐               ┌──────────────────┐                 │
│     │ use..Query(  │               │ stream.subscribe │                 │
│     │   pagesQuery │               │   offset: 'now'  │◄─── Start now   │
│     │ )            │               │                  │     (skip hist) │
│     └──────┬───────┘               └────────┬─────────┘                 │
│            │                                │                           │
│            ▼                                ▼                           │
│     GET /pages?q=X&sort=Y          GET /{org}/live?sse                  │
│     (full query power)              (just deltas, no filtering)         │
│            │                                │                           │
│            ▼                                ▼                           │
│     ┌───────────────────────────────────────────────────┐               │
│     │              React Query Cache                    │               │
│     │  pagesData = [...pages from LIST]                 │               │
│     │                  ↑                                │               │
│     │  stream.onMessage → update/insert/remove in cache │               │
│     └───────────────────────────────────────────────────┘               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```


## Technical details

### Stream notification format
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

## Conflict handling

### Three-layer conflict reduction

#### 1. Upstream-first
"Pull before push" - client must be caught up before sending mutations.

**When online:** Stream keeps client continuously up-to-date. Conflicts are rare—only truly concurrent edits to the same field can conflict.

**When offline:** Mutations queue locally. On reconnect, catch-up first, THEN flush outbox. Client detects conflicts before pushing, enabling side-by-side comparison and per-field resolution.

#### 2. Field-level tracking
Conflicts are scoped to individual fields via `tx.fieldVersions`. Two users editing different fields = no conflict. Multi-field mutations check each changed field independently.

#### 3. Conflict strategy
Server rejects conflicting mutations with 409 status. Client must refetch, rebase changes onto fresh data, and retry. No silent overwrites.

### Conflict flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Upstream-First Mutation Flow                      │
├──────────────────────────────────────────────────────────────────────────┤
│  1. User triggers mutation                                               │
│     │                                                                    │
│     ▼                                                                    │
│  2. Apply optimistic update immediately (always - for instant UX)        │
│     │                                                                    │
│     ▼                                                                    │
│  3. Check: Is stream caught up AND online?                               │
│     │                                                                    │
│     ├── YES ──► 4. Send mutation with sync metadata                      │
│     │               │                                                    │
│     │               ├── OK ──► Confirm via stream message                │
│     │               └── CONFLICT ──► Show resolution UI                  │
│     │                                                                    │
│     └── NO ──► 4. Queue mutation locally                                 │
│                    │                                                     │
│                    ▼                                                     │
│                5. On catch-up: flush queue, resolve any conflicts        │
└──────────────────────────────────────────────────────────────────────────┘
```

### Idempotency

Replaying the same mutation (same `transactionId`) produces the same result without side effects. Critical for:
- **Network retries**: Request succeeds but response is lost
- **Offline queue replay**: Some mutations may have reached server before disconnect
- **Crash recovery**: Pending transactions replay from IndexedDB

See `backend/src/sync/idempotency.ts` for implementation.

---

## Mutation patterns

### Transaction lifecycle

```
┌──────────┐    onMutate     ┌──────────┐    API success    ┌───────────┐
│  (none)  │ ───────────────>│ pending  │ ─────────────────>│ confirmed │
└──────────┘                 └──────────┘                   └───────────┘
                                  │
                                  │ API error
                                  ▼
                             ┌──────────┐
                             │  failed  │
                             └──────────┘
```

**Key differences from basic mutations:**
- Generates tx metadata in `mutationFn` via `createTxForCreate()` / `createTxForUpdate()`
- Includes `{ data, tx }` wrapper in API body with `baseVersion` for conflict detection
- Squashes redundant in-flight mutations to same entity via `squashPendingMutation()`
- Uses client-generated temp ID for optimistic display (replaced on success)

See [page/query.ts](../frontend/src/modules/page/query.ts) for implementation.

### Jitter prevention

**Problem**: Rapid consecutive mutations cause jittery UI when responses arrive out of order.

**Solution**: Cancel in-flight requests using `squashPendingMutation()` from [squash-utils.ts](../frontend/src/query/offline/squash-utils.ts). For discrete actions (toggles, save buttons), use React Query's `isPending` state.

| Scenario | Solution |
|----------|----------|
| Typing in title/content | Cancel in-flight |
| Toggle switch, save button | Use `isPending` |
| Drag-and-drop reorder | Cancel in-flight |

### Online vs offline flow

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    Online vs Offline Mutation Flow                        │
├───────────────────────────────────────────────────────────────────────────┤
│  User edits field                                                         │
│     │                                                                     │
│     ▼                                                                     │
│  1. Apply optimistic update IMMEDIATELY                                   │
│     │                                                                     │
│     ├── ONLINE ──► Debounce, cancel in-flight, send latest only           │
│     │                  │                                                  │
│     │                  └── Confirmed via stream or response               │
│     │                                                                     │
│     └── OFFLINE ──► Add to outbox (squash same-field)                     │
│                        │                                                  │
│                        └── On reconnect: catch-up, check conflicts, flush │
└───────────────────────────────────────────────────────────────────────────┘
```

| Scenario | Behavior | Result |
|----------|----------|--------|
| User types rapidly (online) | Debounced, only final sent | No server flood |
| User edits same field 5x (offline) | Squashed to 1 entry | 1 request on reconnect |
| User edits 3 different fields (offline) | 3 separate entries | 3 requests on reconnect |

---

## Offline sync

### Hydrate barrier

**Problem**: Stream messages arriving before initial LIST completes can cause data regression.

**Solution**: Queue stream messages during hydration using `useHydrateBarrier` hook. The `useLiveStream` hook accepts an `isHydrated` option that controls when queued messages are flushed.

### Gap detection (seq)

Uses per-scope sequence numbers (`seq`) on activities table for **list-level gap detection**. When `notification.seq > lastSeenSeq + 1`, a gap is detected and list invalidation is triggered.

See [user-stream-handler.ts](../frontend/src/query/realtime/user-stream-handler.ts) for implementation.

**How it works:**
```typescript
// Per-scope sequence tracking in memory
const seqStore = new Map<string, number>();

// On each stream message:
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

See [tx-utils.ts](../frontend/src/query/offline/tx-utils.ts) for client-side utilities.

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
// In handleProductEntityEvent():
if (tx?.sourceId === sourceId) {
  return; // Skip own mutation
}
```

Each browser tab generates a unique `sourceId` on load, sent with every mutation.

### Mutation outbox

Uses React Query's mutation cache with `squashPendingMutation()` from [squash-utils.ts](../frontend/src/query/offline/squash-utils.ts).

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
- Only leader tab opens SSE connection
- BroadcastChannel shares messages with all tabs
- Foreground tabs preferred for leadership
- Automatic leader failover when leader tab closes
- Heartbeat every 5s, contested if no heartbeat for 10s

See [tab-coordinator.ts](../frontend/src/query/realtime/tab-coordinator.ts) for implementation.

---

## LRU entity cache

The LRU cache is **essential for the sync engine to scale**. Without it:
- 100 subscribers watching an entity = 100 DB queries on every update
- Popular public pages become a DDoS vector against our own database
- Horizontal scaling is blocked (each server instance duplicates load)

This cache enables:
- **O(1) fan-out** — One DB query serves all subscribers
- **Thundering herd protection** — Request coalescing prevents duplicate fetches
- **Token-gated security** — Membership-required data cached with short-lived tokens

### Two-tier design

| Tier | Key format | TTL | Use case |
|------|-----------|-----|----------|
| **Public** | `public:{entityType}:{entityId}:{version}` | 5 min | Public pages, org profiles |
| **Token-gated** | `token:{prefix}:{entityType}:{entityId}:{version}` | 10 min | Attachments, contacts requiring membership |

### Token flow (token-gated tier)

```
1. User subscribes to SSE stream
   └── Server verifies membership → generates 10-min HMAC-signed token
   └── Token sent via SSE: { event: 'access-token', token, expiresAt }

2. CDC detects entity change
   └── Cache invalidated → next request re-fetches and caches enriched data

3. Subscribers fetch full data using token
   └── GET /entities/{id}?accessToken=abc123&version=5
   └── Cache hit if same token + version

4. Token refresh every 9 min via SSE (before 10-min expiry)
```

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

### Implementation files

```
backend/src/lib/
├── lru-cache.ts              # Generic LRU cache with TTL
├── lru-cache.test.ts         # 13 unit tests
├── entity-cache.ts           # Two-tier cache (public + token)
├── access-token.ts           # HMAC token gen/verify
├── access-token.test.ts      # 11 unit tests
├── request-coalescing.ts     # Singleflight pattern
├── request-coalescing.test.ts # 7 unit tests
└── cache-metrics.ts          # Hit rate tracking

backend/src/middlewares/
└── entity-cache.ts           # Hono middleware

backend/src/sync/
└── cache-invalidation.ts     # CDC → cache hook (registered at startup)

backend/src/modules/metrics/
└── metrics-handlers.ts       # GET /metrics/cache endpoint
```

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
