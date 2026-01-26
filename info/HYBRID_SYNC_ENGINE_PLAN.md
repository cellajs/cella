# Cella hybrid sync engine plan

> **IMPORTANT**: This document describes the sync engine design. The actual implementation lives in the codebase. When updating this document also consider updating: [SYNC_ENGINE_REQUIREMENTS.md](./SYNC_ENGINE_REQUIREMENTS.md) for design decisions, invariants, testable requirements.

> **Existing archicture**:
It is important to know Cella's base architecture and especially to realize the dynamic nature of the entity model:  Cella as a template has a composition of entities but a 'fork' of can have a different and extended entity composition: [ARCHITECTURE.md](./ARCHITECTURE.md)

**Terminology**:
The sync engine uses precise vocabulary to avoid confusion. See [SYNC_ENGINE_REQUIREMENTS.md#terminology](./SYNC_ENGINE_REQUIREMENTS.md#terminology) for the authoritative glossary covering:

## Summary

This document outlines a plan to build a **hybrid sync engine** that extends existing **OpenAPI + React Query** infrastructure with sync and offline capabilities. This engine is - *currently* - designed to be a integral part of cella and its entity model. The approach is "hybrid" because the default is standard REST/OpenAPI endpoints while entity modules *can* be 'upgraded' with transaction tracking, offline support, and live stream for realtime sync. 

| Mode | Entity type | Features | Example |
|--------|--------|----------|---------|
| basic | **entityType** | all REST CRUD entities, server-generated IDs, can also be split by context or product | `organization` |
| offline | **OfflineEntityType** | + `{ data, tx }` wrapper, client IDs, transaction tracking, offline queue, conflict detection | (currently empty) |
| realtime | **RealtimeEntityType** | + Live stream (SSE), live cache updates, multi-tab leader election | `page`, `attachment` |

> This plan focuses on upgrading synced entities (`OfflineEntityType` + `RealtimeEntityType`) with sync primitives using a minimal surface area so that an 'upgrade' doesnt mean a complete rewrite of the code for that entity.

---

## Problem statement

External sync solutions don't work well in en OpenAPI focused codbase. They bypass REST endpoints, authorization, caching and change capture patterns, forcing all-or-nothing adoption. Running them alongside OpenAPI and React Query creates huge over lap and therefore poor DX.

| Concern | External services | Built-in approach |
|---------|-------------------|-------------------|
| **OpenAPI contract** | Bypassed - sync happens outside REST | Extends existing endpoints with `{ data, tx }` wrapper |
| **Authorization** | Requires re-implementing permission logic | Reuses `isPermissionAllowed()` and existing guards |
| **Schema ownership** | Sync layer often dictates schema patterns | Drizzle/zod schemas remain authoritative |
| **Audit trail** | Not covered in general | Activities already recorded through a Change Data Capture (CDC worker) |
| **Opt-in complexity** | All-or-nothing adoption | Progressive: REST → Tracked → Offline → Realtime |
| **React Query base layer** | New reactive layer | Builds on existing TanStack Query cache |

Cella's existing infrastructure provides 70% of what's needed:

- ✅ `activitiesTable` - act as durable change log
- ✅ CDC worker - Already captures entity changes via logical replication  
- ✅ React Query - Optimistic updates, cache management, persistence
- ✅ Permission system - `isPermissionAllowed()` for entity-level ACLs
- ✅ OpenAPI + Zod - Type-safe request/response contracts

## Core concepts

### Design philosophy
- **Extend on OpenAPI** - All features work through the existing OpenAPI infrastructure.
- **React Query base** - Build on top of, not around, TanStack Query.
- **Progressive enhancement** - REST for context entities; synced entities add optimistic updates → offline → realtime.
- **Minimal UI surface area** - Forms and UI components should remain unaware of sync mechanics. Sync concerns (tx metadata, version tracking, mutation handling) are handled in the mutation layer (`query.ts`), not in forms.

### Architecture
- **Leverage CDC Worker** - Use pg `activitiesTable` as durable activity log (no separate transaction storage).
- **Live stream** - SSE streaming backed by CDC Worker + WebSocket for realtime sync (`RealtimeEntityType` only).
- **Separation of concerns** - LIST endpoints handle queries/filtering; live stream is dumb, just provides new data.
- **React Query as merge point** - Both initial load and live stream updates feed into the same cache.
- **Two paths for entity data** - Live updates get entity data from CDC Worker via WebSocket; catch-up queries JOIN activities with entity tables.

### Sync mechanics
- **Client-generated IDs** - Synced entities use client-generated mutation IDs (nanoid) for tracking.
- **Upstream-first sync** - Pull before push will prevent most conflicts for online clients.
- **Version-based conflict detection** - Integer version counters per entity and per field enable gap detection and conflict resolution.
- **Offline mutation queue** - Persist pending mutations to IndexedDB, replay on reconnect.
- **Seq-based gap detection** - Per-org sequence numbers detect missed changes at the list level.
- **Field-level versioning** - `tx.fieldVersions` tracks individual field versions for concurrent edit detection.
- **Merge strategy** - LWW (server wins) as default, resolution UI for fields needing user input.
- **Single-writer multi-tab** - One leader tab owns SSE connection and broadcasts to followers.

### Mutation layer responsibilities

The mutation layer (`query.ts`) encapsulates all sync logic so forms remain simple:

1. **Version extraction** - Read `tx.version` from cached entity for conflict detection
2. **tx metadata generation** - Generate `id` (nanoid), `sourceId`, `baseVersion`
3. **Optimistic updates** - Apply changes to cache immediately, rollback on error
4. **Squashing** - Cancel redundant in-flight mutations for the same entity

**Form contract**: Forms call `updateMutation.mutate({ id, data })` - no sync knowledge required.

See `frontend/src/modules/page/query.ts` for implementation.

### Type safety

Having backend, frontend, CDC, config in one repo puts us in an excellent position to provide end-to-end type safety across the entire 'sync engine flow'. 

- **Prevent type assertions** - Avoid `as`, `as unknown as`, and `!` assertions. They break the compile-time safety that catches sync bugs.
- **Use generics over casts** - For dynamic entity types, use discriminated unions and generic functions.

### OpenAPI as stream contract

The stream implementation should derive as much as possible from generated OpenAPI types to minimize hardcoding. Current state and proposals:

**Current hardcoded elements in `use-live-stream.ts`:**
- URL path: `/organizations/${orgId}/sync/stream`
- Query param names: `live`, `offset`, `entityTypes`
- SSE event names: `message`, `offset`
- Entity type values for filtering

**Proposal A: Derive types only (current approach)**
- Types derived from `SyncStreamResponses` (done in `stream-types.ts`)
- URL/params still hardcoded but TypeScript catches schema drift
- Minimal runtime overhead, maximum simplicity
- **Trade-off**: URL changes require manual updates

**Proposal B: Use generated zod for runtime validation**
```typescript
import { zSyncStreamResponse } from '~/api.gen/zod.gen';

// Parse SSE data with runtime validation
const handleMessage = (event: MessageEvent) => {
  const result = zSyncStreamResponse.shape.activities.element.safeParse(
    JSON.parse(event.data)
  );
  if (!result.success) {
    console.warn('Stream message validation failed:', result.error);
    return;
  }
  onMessage?.(result.data);
};
```
- **Benefit**: Runtime validation catches schema mismatches
- **Trade-off**: Performance overhead for each message

**Proposal C: Extract URL pattern from types**
```typescript
import type { SyncStreamData } from '~/api.gen';

// URL template from generated types (requires string manipulation)
type StreamUrl = SyncStreamData['url']; // '/organizations/{orgIdOrSlug}/sync/stream'

// Build URL from template
const buildStreamUrl = (orgId: string): string => {
  const template: StreamUrl = '/organizations/{orgIdOrSlug}/sync/stream';
  return `${API_BASE}${template.replace('{orgIdOrSlug}', orgId)}`;
};

// Query params typed from schema
type StreamQuery = NonNullable<SyncStreamData['query']>;
const params: StreamQuery = { live: 'sse', offset, entityTypes: types.join(',') };
```
- **Benefit**: URL pattern and params match OpenAPI exactly
- **Trade-off**: More boilerplate, template string manipulation

**Proposal D: Generate SSE client helper**
Add to `openapi-ts.config.ts` a custom plugin that generates an SSE helper:
```typescript
// api.gen/sse.gen.ts (generated)
export const syncStreamSSE = (params: SyncStreamData) => {
  const url = buildUrl('/organizations/{orgIdOrSlug}/sync/stream', params);
  return new EventSource(url, { withCredentials: true });
};
```
- **Benefit**: Fully generated, type-safe SSE creation
- **Trade-off**: Requires custom openapi-ts plugin

**Recommended approach**: Start with **Proposal A** (types only) + elements of **Proposal C** (typed query params). Add **Proposal B** (zod validation) only in debug mode. Defer **Proposal D** until SSE patterns stabilize.

#### Type strictness by layer

Different layers have different typing constraints. The strategy is: **lenient at ingestion boundaries, strict at API/stream/frontend**.

| Layer | Strictness | Why | Typing approach |
|-------|-----------|-----|-----------------|
| **CDC Worker** | Lenient | Receives `Record<string, unknown>` from pg-logical-replication. Row data is inherently untyped. | Use runtime validation, `unknown` types, and type guards. Assertions acceptable for well-tested extraction utilities. |
| **ActivityBus** | Moderate | Receives from WebSocket (CDC Worker). Data crosses JSON boundary. | Validate payload shape with Zod, emit typed `ActivityEvent`. |
| **API Handlers** | Strict | OpenAPI schemas provide compile-time contracts. | Use generated types, no assertions. Type guards for string→enum. |
| **Stream Handlers** | Strict | SSE messages have defined schemas. | Use `RealtimeEntityType`, `ActivityAction` from config. |
| **Frontend** | Strict | Generated SDK types from `api.gen/`. | Derive types from generated schemas, no custom duplicates. |

#### Config-based entity type usage

The config exports typed arrays and type guards for entity classification. See `config/default.ts` for exports and `config/types.ts` for derived types.

**Usage by layer:**

| Layer | Uses | Example |
|-------|------|---------|
| **CDC Worker** | `EntityType` (all entities) | `extractActivityContext()` returns `entityType: EntityType \| null` |
| **Stream Handlers** | `RealtimeEntityType` | Filter activities to only stream realtime entities |
| **API Handlers** | `RealtimeEntityType` or `OfflineEntityType` | Accept `{ data, tx }` wrapper for synced entities |
| **Frontend** | `RealtimeEntityType` | `useLiveStream()` hook subscribes to realtime entities |

**Type guard pattern**: See `backend/src/modules/sync/stream-handlers.ts` for `isRealtimeEntityType` usage.

## Flow charts

#### Current: OpenApi + React query to build on top of

```
┌─────────────────────────────────────────────────────────────┐
│                     React Components                        │
│              useQuery / useInfiniteQuery                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              TanStack Query                                 │
│            - Query caching: same schema for list & detail   │
│            - Optimistic mutations via onMutate              │
│            - Persisted to IndexedDB via Dexie               |
│            - Custom prefetch script for `offlineAccess`     |
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                REST API (Hono + OpenAPI + zod)              │
│              (Standard request/response cycle)              │
└─────────────────────────────────────────────────────────────┘
```

#### New: Hybrid sync engine

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

## Technical specifications

### Leveraging existing Change Data Capture Worker

```
┌──────────────────────────────────────────────────────────────────────┐
│ Frontend: Create page                                                │
│ const transactionId = createTransactionId(); // HLC format per DEC-1 │
│ api.createPage({ body: { data, tx } })                               │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Backend handler                                                      │
│ const { data, tx } = ctx.req.valid('json');                          │
│ INSERT INTO pages (..., tx = { transactionId, sourceId, ... })       │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ PostgreSQL logical replication → CDC Worker                          │
│ Extracts tx metadata from row.tx JSONB column                        │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ activitiesTable (doesn't store entity content data )                 │
│ { type: 'page.created', entityId: 'abc',  tx }                       │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Stream Endpoint delivers message with full entity data               │
│ SSE: { action: 'create', entity: {...}, transactionId: 'xyz123' }    │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Frontend: Reconcile pending transactions                             │
│ if (message.transactionId === pendingTx.id) { confirm(); }           │
└──────────────────────────────────────────────────────────────────────┘
```

### Implementation references

The sync engine is implemented across these key files:

| Component | Location |
|-----------|----------|
| **Activities schema** | `backend/src/db/schema/activities.ts` |
| **CDC WebSocket client** | `cdc/src/lib/api-websocket.ts` |
| **Activity sender** | `cdc/src/handlers/` |
| **Stream subscriber manager** | `backend/src/sync/stream-subscribers.ts` |
| **Stream endpoint** | `backend/src/modules/sync/stream-handlers.ts` |
| **Activity Bus** | `backend/src/sync/activity-bus.ts` |
| **Conflict detection** | `backend/src/sync/conflict-detection.ts` |
| **Idempotency** | `backend/src/sync/idempotency.ts` |

### Realtime sync via live stream

The stream architecture follows this pattern:
1. Client connects to SSE endpoint with offset
2. Server sends catch-up activities since offset
3. Server registers subscriber for push notifications
4. CDC Worker → WebSocket → ActivityBus → Stream fan-out

**Key files:**
- Stream endpoint: `backend/src/modules/sync/stream-handlers.ts`
- Stream subscriber manager: `backend/src/sync/stream-subscribers.ts`
- Activity fetcher: `backend/src/sync/activity-fetcher.ts`
- Frontend hook: `frontend/src/query/realtime/use-live-stream.ts`

**Stream message payload** (see `frontend/src/query/realtime/stream-types.ts`):

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

**Frontend live stream**: See `frontend/src/query/realtime/use-live-stream.ts` for the complete implementation including:
- Persisted offset (survives tab closure)
- Tab coordinator integration (leader election)
- SSE connection with catch-up and live modes

### Transaction ID format (nanoid)

Cella uses **nanoid** for mutation IDs. This provides:

- **Uniqueness**: 21-character URL-safe string with ~126 bits of entropy
- **Simplicity**: No clock synchronization needed
- **Echo prevention**: Compare `tx.sourceId` to detect own mutations

**Version-based conflict detection**: Instead of comparing transaction IDs, Cella uses integer `version` counters:
- Entity-level: `tx.version` increments on every mutation
- Field-level: `tx.fieldVersions[field]` tracks per-field versions

**Implementation**: See `frontend/src/query/offline/tx-utils.ts`

### Entity transient `tx` column

Synced entity tables have a single transient JSONB column for transaction metadata.

**Implementation**: See `backend/src/db/schema/pages.ts` and the `txColumn` helper in `backend/src/db/utils/tx-columns.ts`

**Schema**:
```typescript
interface TxColumnData {
  id: string;              // nanoid mutation ID
  sourceId: string;        // Tab/instance ID for echo prevention
  version: number;         // Entity version (incremented on every mutation)
  fieldVersions: Record<string, number>;  // Per-field versions
}
```

**Why "transient"?**
- Written by handler during mutation
- Read by CDC Worker to populate activitiesTable
- Overwritten on next mutation (no history preserved on entity)
- Entity table is NOT the source of truth for sync state

**Version-based conflict detection**:
- `tx.version` provides entity-level version for gap detection
- `tx.fieldVersions` enables field-level conflict detection
- Client sends `baseVersion` (version when entity was read)
- Server compares `fieldVersions[changedField]` with client's `baseVersion`

### Transaction wrapper schema

| Operation | Request | Response | Notes |
|-----------|---------|----------|-------|
| GET | Flat params | `Entity[]` / `Entity` | No tx - resolve conflicts client-side |
| POST/PATCH/DELETE | `{ data, tx }` | `Entity` with `tx` | Server tracks version + sourceId |
| Stream notification | N/A | `{ action, entityType, entityId, seq, tx }` | Includes sourceId for echo prevention |

**Transaction metadata schemas**: See `backend/src/schemas/transaction-schemas.ts`

### Source identifier & transaction factory

**Implementation**: See `frontend/src/query/offline/tx-utils.ts` which provides:
- `sourceId` - Unique identifier for this browser tab (generated once per page load)
- `createTxForCreate()` - Create tx for new entities (baseVersion: 0)
- `createTxForUpdate(cachedEntity)` - Create tx with baseVersion from cached entity
- `createTxForDelete()` - Create tx for delete mutations

| Purpose | How sourceId serves it |
|---------|------------------------|
| Mutation source | Sent in `tx.sourceId`, stored in entity |
| Echo prevention | Compare stream notification's `sourceId` to your own |
| Leader election | Unique per tab, elect one leader via Web Locks |

**Why not userId?** We have `userId` for audit ("who"). `sourceId` is for sync ("which instance+browserTab").

### Conflict reduction strategy (three layers)

#### 1. Upstream-first

> "Pull before push" - client must be caught up before sending mutations.

**When online (stream connected)**:
- Stream keeps client continuously up-to-date
- Mutations sent immediately after optimistic update
- Conflicts are rare: only truly concurrent edits (same field, same moment) can conflict

**When offline (queued mutations)**:
- Mutations queue locally in IndexedDB outbox
- User continues working, sees optimistic updates
- On reconnect: catch-up first, THEN flush outbox
- Conflict likelihood grows with offline duration (more server changes accumulated)
- **Client advantage**: Conflicts detected client-side before pushing, enabling:
  - Side-by-side comparison (your value vs server value)
  - Per-field resolution (keep mine, keep theirs, merge)
  - Batch review of multiple conflicts
  - No 409 errors - user resolves proactively

**How it works in Cella:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Upstream-First Mutation Flow                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
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
│     │               ▼                                                    │
│     │           5. Server validates (conflict check, idempotency)        │
│     │               │                                                    │
│     │               ├── OK ──► Confirm via stream message                │
│     │               │                                                    │
│     │               └── CONFLICT ──► Show resolution UI, maybe rollback  │
│     │                                                                    │
│     └── NO (offline or behind) ──► 4. Queue mutation locally             │
│                                        │                                 │
│                                        ▼                                 │
│                                    5. On catch-up: flush queue           │
│                                        │                                 │
│                                        ▼                                 │
│                                    6. If conflict detected: resolve      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```


#### 2. Field-level tracking
 
Conflicts are scoped to individual fields via `tx.changedField`. Two users editing different fields = no conflict. The `data` object in requests can still be complete or partial entity data—only `changedField` determines conflict scope.

#### 3. **Merge - For same-field conflicts: LWW (server wins) → resolution UI (user decides)

When offline, conflict likelihood grows with duration, but  client should enable graceful resolution before pushing.

**Entity row structure** - Synced entity tables have a single transient `tx` JSONB column for transaction metadata. 

Conflict detection and resolution spans backend and frontend:
1. **Backend** - Validates `expectedTransactionId` against activitiesTable (see `backend/src/sync/conflict-detection.ts`)
2. **Frontend (online)** - Handles 409 conflict responses
3. **Frontend (offline)** - Detects conflicts client-side when pulling upstream changes

**Conflict resolution UI**: Not yet implemented. See [SYNC_ENGINE_TODOS.md](./SYNC_ENGINE_TODOS.md).

### Idempotency via activitiesTable

Idempotency ensures that replaying the same mutation (same `transactionId`) produces the same result without side effects. This is critical for offline-first sync because:

- **Network retries**: A request may succeed server-side but the response gets lost. Client retries → server must recognize the duplicate.
- **Offline queue replay**: When reconnecting, queued mutations are flushed. If some already reached the server before disconnect, they must not create duplicates.
- **Crash recovery**: Browser crash mid-mutation → on restart, pending transactions replay from IndexedDB.

**Implementation**: See `backend/src/sync/idempotency.ts` for `isTransactionProcessed()` and `getEntityByTransaction()`.

---

### Frontend mutation pattern with transactions

The mutation pattern for synced entities follows these steps:
1. Generate transaction ID in `onMutate`
2. Apply optimistic update
3. Send API request with `{ data, tx }` wrapper
4. Confirm via stream message or rollback on error

**Implementation**: See `frontend/src/modules/page/query.ts` for `usePageCreateMutation` and `usePageUpdateMutation`.

**Key differences from basic (non-synced) mutations:**
- Generates `transactionId` in `onMutate` using HLC format (per DEC-1)
- Includes `{ data, tx }` wrapper in API body (per DEC-19)
- Tracks transaction lifecycle: `pending` → `sent` → `confirmed` (via live stream)
- Uses client-generated entity ID for optimistic display
- Existing optimistic update patterns (`mutateCache.create/remove`) remain unchanged

### Transaction lifecycle states

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

### Mutation blocking pattern (jitter prevention)

**Problem**: Rapid consecutive mutations to the same entity cause "jittery" UI:
1. User updates page (mutation A sending...)
2. User updates same page again (mutation B)
3. Optimistic update B applied
4. Mutation A response arrives → may conflict with optimistic B

**Two solutions depending on use case:**

#### Option A: Cancel in-flight (for rapid edits)

Best for: Title editing, content fields, any rapid-fire user input.

**Implementation**: See `frontend/src/query/offline/squash-utils.ts` for `squashPendingMutation()`.

**Key behaviors:**
- Sends request IMMEDIATELY (no latency for user)
- If request is in-flight and user edits again → in-flight request cancelled
- AbortController propagates to fetch, stopping network request
- Cancelled transactions marked as such (not 'failed')
- Server only processes the latest request

#### Option B: Entity-level mutex (for discrete actions)

Best for: Toggle switches, explicit save buttons, non-typing interactions.

React Query's `isPending` state provides this implicitly. A dedicated `withMutationLock()` pattern is available if needed but not currently implemented.

#### When to use which?

| Scenario | Use | Why |
|----------|-----|-----|
| Typing in title/content field | Cancel in-flight | Cancels stale requests, immediate feedback |
| Toggle published/draft | Mutex | Discrete action, wait for completion |
| Explicit "Save" button | Mutex | User expects save to complete |
| Drag-and-drop reorder | Cancel in-flight | Rapid movements, only final position matters |
| Checkbox toggle | Mutex | Binary state, order matters |

### Online vs offline mutation flow

The mutation handling differs based on connectivity:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Online vs Offline Mutation Flow                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐                                                            │
│  │ User edits  │                                                            │
│  │ field       │                                                            │
│  └──────┬──────┘                                                            │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 1. Apply optimistic update IMMEDIATELY (always, per INV-1)          │    │
│  └──────────────────────────────┬──────────────────────────────────────┘    │
│                                 │                                            │
│                    ┌────────────┴────────────┐                              │
│                    │ Online?                 │                              │
│                    └────────────┬────────────┘                              │
│                    YES          │          NO                               │
│         ┌───────────────────────┴────────────────────────────┐              │
│         │                                                    │              │
│         ▼                                                    ▼              │
│  ┌─────────────────────────┐                  ┌─────────────────────────┐   │
│  │ 2a. Debounce (300ms)    │                  │ 2b. Add to outbox       │   │
│  │     Cancel in-flight    │                  │     Squash same-field   │   │
│  │     Send latest only    │                  │     (key: entity:field) │   │
│  └──────────┬──────────────┘                  └──────────┬──────────────┘   │
│             │                                            │                  │
│             ▼                                            │                  │
│  ┌─────────────────────────┐                  ┌──────────┴──────────────┐   │
│  │ 3a. Request in-flight   │                  │ Wait for reconnection   │   │
│  │     (can be cancelled)  │                  └──────────┬──────────────┘   │
│  └──────────┬──────────────┘                             │                  │
│             │                                            ▼                  │
│             ▼                                 ┌─────────────────────────┐   │
│  ┌─────────────────────────┐                  │ 3b. Catch-up stream     │   │
│  │ 4a. Confirmed via       │                  │     Check for conflicts │   │
│  │     stream or response  │                  └──────────┬──────────────┘   │
│  └─────────────────────────┘                             │                  │
│                                                          ▼                  │
│                                               ┌─────────────────────────┐   │
│                                               │ 4b. Flush outbox        │   │
│                                               │     (one request/field) │   │
│                                               └─────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key stability guarantees:**

| Scenario | Behavior | Result |
|----------|----------|--------|
| User types 20 chars in 2 seconds (online) | 1 debounced request sent | No server flood |
| User types while request in-flight (online) | In-flight cancelled, new debounce starts | Latest value wins |
| User edits same field 5x while offline | Outbox squashes to 1 entry | 1 request on reconnect |
| User edits 3 different fields while offline | 3 separate outbox entries | 3 requests on reconnect |
| Network drops mid-request | Request fails, mutation stays in outbox | Retried on reconnect |

### Hydrate barrier (race prevention)

**Problem**: Stream messages arriving before initial LIST query completes can cause data regression:
1. User opens app, LIST query starts fetching
2. Stream connects with `offset=now`
3. Stream message arrives (newer data)
4. LIST response arrives (older snapshot!)
5. User sees data regress to older state

**Solution**: Queue stream messages during hydration using `useHydrateBarrier` hook from [hydrate-barrier.ts](../frontend/src/query/realtime/hydrate-barrier.ts). The `useLiveStream` hook accepts an `isHydrated` option that controls when queued messages are flushed.

**Key files:**
- `hydrate-barrier.ts` - Composable barrier utility and React hook
- `use-live-stream.ts` - Integrates barrier via `isHydrated` option
- `organization-routes.tsx` - Passes hydration state based on `useIsFetching` for realtime entity types

### Seq-based gap detection

Gap detection uses per-org sequence numbers (`seq`) on activities table instead of persisted offsets.

**Implementation**: See [user-stream-handler.ts](../frontend/src/query/realtime/user-stream-handler.ts) for the in-memory seqStore.

**Key features:**
- Tracks last seen `seq` per organization in memory
- Gaps detected when `notification.seq > lastSeenSeq + 1`
- Missed changes trigger list invalidation
- No persistence needed - React Query handles staleness on reconnect

### Entity-level mutation outbox (offline)

**Scenario**: User offline, edits page 3 times:
```
Time 1: Update title → Mutation A queued
Time 2: Update content → Mutation B queued
Time 3: Update title again → Mutation C queued
```

**Entity-Level Solution**: Queue per-entity, squash same-entity changes.

**Implementation**: Uses React Query's mutation cache with `squashPendingMutation()` from [squash-utils.ts](../frontend/src/query/offline/squash-utils.ts).

**Key behaviors:**
- Outbox keyed by `entityType:entityId`
- Same-entity mutations squash (cancel pending, keep latest)
- Version-based conflict detection via `tx.baseVersion`
- On reconnect: pull upstream first, check for conflicts, then flush

**Result from scenario above**:
```
After squashing:
- { field: 'title', value: 'Third Title', txId: C, expectedTxId: originalTitleTx }
- { field: 'content', value: '...', txId: B, expectedTxId: originalContentTx }
```

**Benefits**:
- Two requests max (one per field), not three
- Field-level conflict detection
- Clear conflict resolution per field
- No intermediate states on server

**Upstream-First Flow**:
1. Come online → Pull stream messages (upstream-first)
2. For each message: check if queued mutation conflicts
3. Mark conflicted mutations, show resolution UI
4. Flush remaining pending mutations

### Offline mutation coalescing (create + edit scenarios)

When a user creates an entity offline and then edits it before reconnecting, the mutations are **coalesced** into a single create request. This is distinct from field-level squashing (same field edited multiple times).

**Key difference from update squashing:**
- **Update squashing** (OFFLINE-005): Same field updated 3x → 1 update request with final value
- **Create coalescing** (DEC-23): Create + edit title + edit content → 1 create request with final values

**Why coalesce creates?**
The entity doesn't exist on server yet, so:
- Field-level conflict detection is meaningless (no prior transaction to compare against)
- Multiple update requests would fail (entity not found)
- Intermediate states on server add no value

**Outbox key strategy:**
```typescript
// Different keying for different operations
const getOutboxKey = (mutation: MutationEntry): string => {
  if (mutation.type === 'create' || mutation.type === 'delete') {
    // Entity-level: one entry per entity for create/delete
    return `${mutation.entityType}:${mutation.entityId}`;
  }
  // Field-level: one entry per field for updates
  return `${mutation.entityType}:${mutation.entityId}:${mutation.field}`;
};
```

**Scenario walkthroughs:**

**Scenario A: Create + multiple edits while offline**
```
Time 1: User creates page offline    → Outbox: { type: 'create', data: { title: 'New', content: '' } }
Time 2: User edits title             → Outbox: { type: 'create', data: { title: 'Updated', content: '' } }  ← merged
Time 3: User edits content           → Outbox: { type: 'create', data: { title: 'Updated', content: '...' } }  ← merged
Time 4: User comes online            → 1 API call: POST /pages with final values
```

**Scenario B: Create + delete while offline**
```
Time 1: User creates page offline    → Outbox: { type: 'create', ... }
Time 2: User deletes the page        → Outbox: empty  ← both cancelled
Time 3: User comes online            → 0 API calls (nothing happened from server's perspective)
```

**Scenario C: Create online, edit offline**
```
Time 1: User creates page online     → Server has page (confirmed)
Time 2: User goes offline
Time 3: User edits title             → Outbox: { type: 'update', field: 'title', ... }
Time 4: User edits content           → Outbox: { type: 'update', field: 'content', ... }  ← separate entry
Time 5: User comes online            → 2 API calls: field-level updates (standard behavior)
```

**Implementation in FieldMutationOutbox:**

The create + edit coalescing logic is implemented in the mutation layer. Key behaviors:
- If a pending create exists for same entity, merge updates into the create payload
- If a pending create exists and user deletes, cancel both (entity never reached server)
- Otherwise, use standard field-level squashing for updates

See [squash-utils.ts](../frontend/src/query/offline/squash-utils.ts) for implementation.

### Multi-tab coordination

**Architecture**: Single-writer, multi-reader (from TanStack DB persistence plan)

**Leader Election Approach**: Web Locks API with visibility-aware fallback. Web Locks is simpler than SharedWorker and sufficient for our needs, with background throttling handled via heartbeat and visibility state checks.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Browser                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Tab 1 (Leader)                    Tab 2 (Follower)    Tab 3 (Follower)     │
│  ┌─────────────────┐               ┌─────────────┐     ┌─────────────┐      │
│  │ SSE Connection  │               │             │     │             │      │
│  │ to /stream      │               │  No SSE     │     │  No SSE     │      │
│  └────────┬────────┘               │             │     │             │      │
│           │                        └──────▲──────┘     └──────▲──────┘      │
│           │                               │                   │             │
│           ▼                               │                   │             │
│  ┌─────────────────┐                      │                   │             │
│  │ BroadcastChannel│──────────────────────┴───────────────────┘             │
│  │ "cella-sync"    │     (broadcasts stream messages to all tabs)          │
│  └─────────────────┘                                                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Implementation**: See [tab-coordinator.ts](../frontend/src/query/realtime/tab-coordinator.ts) for the full implementation using Web Locks API and BroadcastChannel.

**Key features:**
- Web Locks API for leader election (`navigator.locks.request`)
- BroadcastChannel for sharing stream messages with all tabs
- Only leader tab opens SSE connection
- Other tabs receive messages via broadcast
- Automatic leader failover when leader tab closes

**Handling background throttling**:
- Use `document.visibilityState` to prefer foreground tabs as leader
- Leader sends heartbeat every 5s via BroadcastChannel
- If no heartbeat for 10s, other tabs can contest leadership


---


## Comparison matrix

| Feature | Linear | TinyBase | LiveStore | Electric | Cella Hybrid |
|---------|--------|----------|-----------|----------|--------------|
| Architecture | Local-first (SQLite) | Local-first (CRDT) | Event sourcing | Shape-based sync | Server-first + cache |
| Installation | Proprietary | npm package | npm package | npm + sidecar | Cella template |
| Data Model | Relational (SQLite) | Key-value + Tables | Event Sourcing | Shapes | CRUD + Transactions |
| Local Storage | SQLite WASM (wa-sqlite) | IndexedDB / OPFS / SQLite | SQLite WASM | TanStack DB | IndexedDB (Dexie + RQ) |
| Source of Truth | Local SQLite | Client (CRDT) | Client eventlog | Server: replication | Server: replication |
| Sync Protocol | Custom sync log | CRDT (MergeableStore) | Push/Pull events | HTTP shapes | Live stream SSE |
| Offline Reads | ✅ Full SQL queries | ✅ Full | ✅ Full | ⚠️ Cached shapes | ⚠️ Cached data |
| Offline Writes | ✅ Full | ✅ Native CRDT | ✅ Eventlog | ❌ | ✅ Mutation outbox |
| Merge Location | Client + Server | Client only (CRDT) | Client only | Client only | Client + Server |
| Optimistic Updates | ✅ Instant (local-first) | ✅ Reactive listeners | ✅ Automatic | ⚠️ Patterns | ✅ Transaction-tracked |
| Conflict Resolution | Per-model resolvers | CRDT auto-merge | Rebase, upstream-first | LWW | LWW → UI |
| Upstream-First | ✅ Yes | ❌ CRDT-based | ✅ Yes | ❌ | ✅ Yes |
| Transaction Tracking | ✅ Full | ⚠️ Checkpoints (local) | ✅ Full eventlog | ❌ | ✅ Per-operation |
| Audit Trail | ✅ Sync log | ❌ | ✅ Eventlog | ❌ | ✅ activitiesTable |
| Realtime Updates | ✅ WebSocket | ✅ WebSocket/Broadcast | ✅ | ✅ Shapes | ✅ SSE + WebSocket |
| Multi-Tab Sync | ✅ SharedWorker | ✅ BroadcastChannel | ✅ | ✅ | ✅ Leader election |
| Bundle Size | Large (SQLite WASM) | 5.4-12.1kB | ~50kB | ~30kB | ~5kB (hooks only) |
| React Integration | Custom hooks | ✅ ui-react module | ✅ | ✅ TanStack | ✅ TanStack Query |
| OpenAPI Compatible | ❌ Bypasses REST | ❌ | ❌ | ❌ | ✅ Extends REST |
| Progressive Adoption | ❌ All-or-nothing | ⚠️ | ⚠️ | ⚠️ | ✅ REST → Sync |
| Devtools | ✅ Custom | ✅ Inspector | ⚠️ | ⚠️ | ✅ React Query Devtools |
| Undo/Redo | ✅ | ✅ Checkpoints | ✅ Eventlog | ❌ | ⚠️ Via activities |
| Broader scope use | N/A (own infra) | N/A | N/A | ❌ | ✅ ActivityBus can support API internals |

---


## References
- [TanStack DB Persistence Plan](https://github.com/TanStack/db/issues/865#issuecomment-3699913289) - Multi-tab coordination, hydrate barrier, leader election patterns
- [Hono SSE Streaming](https://hono.dev/docs/helpers/streaming#stream-sse) - SSE helper docs
- [LiveStore Syncing](https://docs.livestore.dev/reference/syncing/) - Push/pull sync patterns (research reference)
- [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) - Browser leader election

---

## Acknowledgements

This sync engine design draws from established patterns in distributed systems and local-first software. Key influences:
- [ElectricSQL](https://electric-sql.com/) - Shape-based sync, PostgreSQL logical replication
- [LiveStore](https://livestore.io/) - SQLite-based sync with reactive queries, event sourcing
- [TinyBase](https://tinybase.org/) - Reactive data store with sync, CRDT support, and persistence
- [Last-Write-Wins (LWW)](https://en.wikipedia.org/wiki/Eventual_consistency) - Simple resolution for opaque values
- [Hybrid Logical Clocks (HLC)](https://cse.buffalo.edu/tech-reports/2014-04.pdf) - Kulkarni et al., causality-preserving timestamps

---
