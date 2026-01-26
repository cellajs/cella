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
| **Seq** | Per-org sequence number for gap detection |
| **baseVersion** | The entity version when client last read it, sent with mutations for conflict detection |

---

## Why a built-in sync engine?

External sync solutions bypass REST endpoints, authorization, and caching patterns, forcing all-or-nothing adoption. Running them alongside OpenAPI and React Query creates overlap and poor DX.

| Concern | External services | Built-in approach |
|---------|-------------------|-------------------|
| **OpenAPI contract** | Bypassed | Extends existing endpoints with `{ data, tx }` wrapper |
| **Authorization** | Requires re-implementing | Reuses `isPermissionAllowed()` and existing guards |
| **Schema ownership** | Sync layer dictates patterns | Drizzle/Zod schemas remain authoritative |
| **Audit trail** | Not covered | Activities recorded via CDC Worker |
| **Opt-in complexity** | All-or-nothing | Progressive: REST → Tracked → Offline → Realtime |
| **React Query** | New reactive layer | Builds on existing TanStack Query cache |

**Infrastructure the sync engine uses:**
- `activitiesTable` — Durable change log
- CDC Worker — Captures entity changes via logical replication  
- React Query — Optimistic updates, cache management, persistence
- Permission system — `isPermissionAllowed()` for entity-level ACLs
- OpenAPI + Zod — Type-safe request/response contracts
- **LRU Entity Cache** — Server-side caching for scalable fan-out (see section below)

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

## Design principles

### Invariants (must always be true)

1. **Optimistic updates happen BEFORE checking online status** - User sees instant feedback regardless of sync state
2. **Transaction IDs are immutable once generated** - Same ID used for retries enables idempotency
3. **CDC Worker is the source of truth for activity history** - Entity tables have transient `tx` that gets overwritten
4. **One mutation = one field change** - `tx.changedField` declares which single field is tracked for conflicts
5. **Only leader tab opens SSE connection** - Prevents duplicate connections and race conditions
6. **No type assertions in API/stream/frontend code** - Type safety catches sync bugs at compile time

### Constraints

| Constraint | Limit | Why |
|------------|-------|-----|
| Mutation ID length | 21 chars | nanoid default |
| Source ID length | 64 chars | prefix + nanoid headroom |
| Catch-up query batch | 100 activities | Prevent memory/latency spikes |
| IndexedDB transaction store | 1000 entries max | Client storage limits |

---

## Core concepts

### Philosophy
- **Extend OpenAPI** - All features work through existing OpenAPI infrastructure
- **React Query base** - Build on top of, not around, TanStack Query
- **Progressive enhancement** - REST for context entities; synced entities add optimistic updates → offline → realtime
- **Minimal UI surface area** - Forms remain unaware of sync mechanics; sync concerns handled in the mutation layer

### Architecture overview
- **Leverage CDC Worker** - Use `activitiesTable` as durable activity log
- **Live stream** - SSE streaming backed by CDC Worker + WebSocket for realtime sync
- **Separation of concerns** - LIST endpoints handle queries/filtering; live stream provides new data
- **React Query as merge point** - Both initial load and live stream updates feed into the same cache
- **Two paths for entity data** - Live updates get entity data from CDC Worker via WebSocket; catch-up queries JOIN activities with entity tables

### Sync mechanics
- **Client-generated IDs** - Synced entities use nanoid mutation IDs for tracking
- **Upstream-first sync** - Pull before push prevents most conflicts
- **Version-based conflict detection** - Integer version counters per entity and per field
- **Offline mutation queue** - Persist pending mutations to IndexedDB, replay on reconnect
- **Field-level versioning** - `tx.fieldVersions` tracks individual field versions
- **Merge strategy** - LWW (server wins) as default, resolution UI for fields needing user input
- **Single-writer multi-tab** - One leader tab owns SSE connection and broadcasts to followers

### Mutation layer

The mutation layer (`query.ts`) encapsulates all sync logic so forms remain simple:
1. Read `tx.version` from cached entity for conflict detection
2. Generate tx metadata: `id` (nanoid), `sourceId`, `baseVersion`
3. Apply optimistic updates immediately, rollback on error
4. Cancel redundant in-flight mutations for the same entity

**Form contract**: Forms call `updateMutation.mutate({ id, data })` - no sync knowledge required.

---

## Key decisions

### Transaction ID format
Uses **nanoid** (21-character URL-safe string) for mutation IDs. Simple, no clock synchronization needed. Version-based conflict detection doesn't require causality ordering.

### Field-level conflict tracking
One mutation changes one field, conflicts are per-field. Two users editing different fields = no conflict. Trade-off: multiple API calls for multi-field edits, but dramatically reduces conflicts.

### CDC Worker sends entity data via WebSocket
CDC Worker maintains a persistent WebSocket to API server, sending full entity data from replication rows with no payload limit. Enables instant delivery with 50k+ msg/sec throughput.

### Transient tx column
Synced entity tables have a single `tx` JSONB column containing `{ id, sourceId, version, fieldVersions }`. Written by handler, read by CDC Worker, overwritten on next mutation. Entity table is NOT the source of truth for sync state.

### activitiesTable as activity log
Extends existing activities table with tx column rather than creating a separate sync table. Reuses existing infrastructure.

### React Query as cache layer
Feed stream messages into React Query cache, not a parallel state. Consistent with rest of Cella.

### Organization-level stream granularity
One SSE stream per org, delivering all realtime entity types for that org. Client filters by entity type; simpler server and permission boundary by tenant.

### Transaction wrapper required for synced entities
Synced entity mutation endpoints require `{ data, tx }` wrapper—no "legacy mode". All mutations are tracked with no gaps.

### Offline mutation coalescing
When a user creates an entity offline and edits it before reconnecting, create and edits are coalesced into a single create request with final values. Reduces network traffic dramatically.

### React Query mutation cache as outbox
Uses React Query's mutation cache with IndexedDB persistence rather than a custom outbox. Leverages existing infrastructure with built-in retry and garbage collection.

## Architecture

> **SERVER:** CDC Worker → WebSocket → API → SSE fan-out

This architecture uses a persistent WebSocket connection from CDC Worker to API server (no payload limits), provides instant delivery with no poll delay, scales with orgs not with subscribers (multi-tenant security through existing middleware), and avoids round-trips through the database since the CDC Worker already has the data.

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
│             │                                                               │
│             ▼                                                               │
│  ┌─────────────────────┐     ┌─────────────────────┐                        │
│  │    CDC Worker       │────>│  activitiesTable    │                        │
│  │                     │     │  (INSERT)           │                        │
│  │  After INSERT:      │     └─────────────────────┘                        │
│  │  ws.send(           │                                                    │
│  │   {activity, entity}│                                                    │
│  │  )                  │                                                    │
│  └──────────┬──────────┘                                                    │
│             │                                                               │
│             │ WebSocket (persistent, replication backpressure)              │
│             ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    API Server (Hono)                            │        │
│  │                                                                 │        │
│  │  ┌─────────────────────┐                                        │        │
│  │  │ /internal/cdc       │                                        │        │
│  │  │ (WebSocket)         │                                        │        │
│  │  │ All entity types    │                                        │        │
│  │  └──────────┬──────────┘                                        │        │
│  │             │                                                   │        │
│  │             ▼                                                   │        │
│  │  ┌─────────────────────┐                                        │        │
│  │  │ ActivityBus         │◄─── WebSocket from CDC Worker          │        │
│  │  └──────────┬──────────┘                                        │        │
│  │             │ Emits ActivityEvent                               │        │
│  │             ▼                                                   │        │
│  │  ┌─────────────────────┐                                        │        │
│  │  │ StreamSubscriber    │  Map<orgId, Set<LiveStreamConnection>> │        │
│  │  │ Manager             │                                        │        │
│  │  │ org-123: [stream1,  │  Fan-out: O(1) lookup + O(subscribers) │        │
│  │  │           stream2]  │  broadcast per org                     │        │
│  │  │ org-456: [stream3]  │                                        │        │
│  │  └──────────┬──────────┘                                        │        │
│  │             │                                                   │        │
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

## Implementation references

The sync engine is implemented across these key files:

**Backend:**
| Component | Location |
|-----------|----------|
| Activities schema | `backend/src/db/schema/activities.ts` |
| Stream endpoint | `backend/src/modules/sync/stream-handlers.ts` |
| Stream subscriber manager | `backend/src/sync/stream-subscribers.ts` |
| Activity Bus | `backend/src/sync/activity-bus.ts` |
| Conflict detection | `backend/src/sync/conflict-detection.ts` |
| Idempotency | `backend/src/sync/idempotency.ts` |
| Transaction schemas | `backend/src/schemas/transaction-schemas.ts` |
| LRU cache | `backend/src/lib/lru-cache.ts` |
| Entity cache service | `backend/src/lib/entity-cache.ts` |
| Request coalescing | `backend/src/lib/request-coalescing.ts` |
| Access tokens | `backend/src/lib/access-token.ts` |
| Cache invalidation | `backend/src/sync/cache-invalidation.ts` |

**CDC Worker:**
| Component | Location |
|-----------|----------|
| WebSocket client | `cdc/src/lib/api-websocket.ts` |
| Activity handlers | `cdc/src/handlers/` |
| Context extraction | `cdc/src/utils/extract-activity-context.ts` |

**Frontend:**
| Component | Location |
|-----------|----------|
| Live stream hook | `frontend/src/query/realtime/use-live-stream.ts` |
| Stream types | `frontend/src/query/realtime/stream-types.ts` |
| Tab coordinator | `frontend/src/query/realtime/tab-coordinator.ts` |
| Stream handler | `frontend/src/query/realtime/user-stream-handler.ts` |
| Hydrate barrier | `frontend/src/query/realtime/hydrate-barrier.ts` |
| Transaction utils | `frontend/src/query/offline/tx-utils.ts` |
| Squash utils | `frontend/src/query/offline/squash-utils.ts` |
| Query persister | `frontend/src/query/persister.ts` |

---

## Technical details

### Stream message format

```typescript
interface StreamMessage<T = unknown> {
  data: T | null;                  // Full entity data (null if deleted)
  entityType: string;              // 'page' | 'attachment' 
  entityId: string;
  action: ActivityAction;          // 'create' | 'update' | 'delete'
  activityId: number;              // Stream offset for resumption
  changedKeys: string[] | null;    // Which fields changed
  createdAt: string;               // Activity timestamp
  tx: Tx | null;                   // Transaction metadata (null for non-synced)
}
```

### Transaction wrapper schema

| Operation | Request | Response | Notes |
|-----------|---------|----------|-------|
| GET | Flat params | `Entity[]` / `Entity` | No tx - resolve conflicts client-side |
| POST/PATCH/DELETE | `{ data, tx }` | `Entity` with `tx` | Server tracks version + sourceId |
| Stream notification | N/A | `{ action, entityType, entityId, seq, tx }` | Includes sourceId for echo prevention |

### Transient tx column

Synced entity tables have a single transient JSONB column for transaction metadata:

```typescript
interface TxColumnData {
  id: string;              // nanoid mutation ID
  sourceId: string;        // Tab/instance ID for echo prevention
  version: number;         // Entity version (incremented on every mutation)
  fieldVersions: Record<string, number>;  // Per-field versions
}
```

**Why "transient"?** Written by handler during mutation, read by CDC Worker to populate activitiesTable, then overwritten on next mutation. The entity table is NOT the source of truth for sync state—`activitiesTable` is.

### Source ID

- Unique identifier for a browser tab (generated via nanoid on page load)
- Used for mutation source tracking and echo prevention
- Different from `userId` (audit: "who") — `sourceId` is for sync ("which tab")

---

## Conflict handling

### Three-layer conflict reduction

#### 1. Upstream-first
"Pull before push" - client must be caught up before sending mutations.

**When online:** Stream keeps client continuously up-to-date. Conflicts are rare—only truly concurrent edits to the same field can conflict.

**When offline:** Mutations queue locally. On reconnect, catch-up first, THEN flush outbox. Client detects conflicts before pushing, enabling side-by-side comparison and per-field resolution.

#### 2. Field-level tracking
Conflicts are scoped to individual fields via `tx.changedField`. Two users editing different fields = no conflict.

#### 3. Merge strategy
LWW (server wins) as default, resolution UI when user input is needed.

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
┌──────────┐    onMutate     ┌──────────┐    API success    ┌──────────┐
│  (none)  │ ───────────────>│ pending  │ ─────────────────>│   sent   │
└──────────┘                 └──────────┘                   └──────────┘
                                  │                              │
                                  │ API error                    │ Stream message
                                  ▼                              ▼
                             ┌──────────┐                   ┌───────────┐
                             │  failed  │                   │ confirmed │
                             └──────────┘                   └───────────┘
```

**Key differences from basic mutations:**
- Generates `transactionId` in `onMutate` using nanoid
- Includes `{ data, tx }` wrapper in API body
- Tracks lifecycle: `pending` → `sent` → `confirmed` via live stream
- Uses client-generated entity ID for optimistic display

See `frontend/src/modules/page/query.ts` for implementation.

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

### Gap detection

Uses per-org sequence numbers (`seq`) on activities table. When `notification.seq > lastSeenSeq + 1`, a gap is detected and list invalidation is triggered.

See [user-stream-handler.ts](../frontend/src/query/realtime/user-stream-handler.ts) for implementation.

**Key features:**
- Tracks last seen `seq` per organization in memory
- Gaps detected when `notification.seq > lastSeenSeq + 1`
- Missed changes trigger list invalidation
- No persistence needed - React Query handles staleness on reconnect

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

## References

- [TanStack DB Persistence Plan](https://github.com/TanStack/db/issues/865#issuecomment-3699913289) - Multi-tab coordination patterns
- [Hono SSE Streaming](https://hono.dev/docs/helpers/streaming#stream-sse) - SSE helper docs
- [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) - Browser leader election

**Influences:**
- [ElectricSQL](https://electric-sql.com/) - Shape-based sync, PostgreSQL logical replication
- [LiveStore](https://livestore.io/) - SQLite-based sync with event sourcing
- [TinyBase](https://tinybase.org/) - Reactive data store with CRDT support

---

## Appendix: Comparison with alternatives

| Feature | Linear | TinyBase | LiveStore | Electric | Cella Hybrid |
|---------|--------|----------|-----------|----------|--------------|
| Architecture | Local-first (SQLite) | Local-first (CRDT) | Event sourcing | Shape-based sync | Server-first + cache |
| Source of Truth | Local SQLite | Client (CRDT) | Client eventlog | Server | Server |
| Offline Writes | ✅ Full | ✅ Native CRDT | ✅ Eventlog | ❌ | ✅ Mutation outbox |
| Conflict Resolution | Per-model resolvers | CRDT auto-merge | Rebase | LWW | LWW → UI |
| OpenAPI Compatible | ❌ | ❌ | ❌ | ❌ | ✅ Extends REST |
| Bundle Size | Large (SQLite WASM) | 5.4-12.1kB | ~50kB | ~30kB | ~5kB (hooks only) |
| Progressive Adoption | ❌ All-or-nothing | ⚠️ | ⚠️ | ⚠️ | ✅ REST → Sync |
