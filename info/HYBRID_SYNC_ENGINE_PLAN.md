# Cella hybrid sync engine plan

> **IMPORTANT**:
Whenever change the plan, iterate over the requirements and decisions document to confirm they still are consistent with the plan and whether to extend this document: [SYNC_ENGINE_REQUIREMENTS.md](./SYNC_ENGINE_REQUIREMENTS.md) - Design decisions, out-of-scope list, invariants, testable requirements. Secondly, when writing code for this plan: DO NOT copy examples verbatim. Example code is illustrative and may need adaptation. The requirements, plan and existing code should be central.

> **Existing archicture**:
It is important to know Cella's base architecture and especially to realize the dynamic nature of the entity model:  Cella as a template has a composition of entities but a 'fork' of can have a different and extended composition: [ARCHITECTURE.md](./ARCHITECTURE.md)

**Terminology**:
The sync engine uses precise vocabulary to avoid confusion. See [SYNC_ENGINE_REQUIREMENTS.md#terminology](./SYNC_ENGINE_REQUIREMENTS.md#terminology) for the authoritative glossary covering:

## Summary

This document outlines a plan to build a **hybrid sync engine** that extends existing **OpenAPI + React Query** infrastructure with sync and offline capabilities. This engine is - *currently* - designed to be a integral part of cella and its entity model. The approach is "hybrid" because the default is standard REST/OpenAPI endpoints while synced entity modules *can* be enhanced with transaction tracking, offline support, and live stream for realtime sync. 

| Entity type | Features | Example |
|--------|----------|---------|
| **entityType** | all REST CRUD entities, server-generated IDs, can also be split by context or product | `organization` |
| **OfflineEntityType** | + `{ data, tx }` wrapper, client IDs, transaction tracking, offline queue, conflict detection | (currently empty) |
| **RealtimeEntityType** | + Live stream (SSE), live cache updates, multi-tab leader election | `page`, `attachment` |

> This plan focuses on upgrading synced entities (`OfflineEntityType` + `RealtimeEntityType`) with sync primitives using a minimal surface area so that an 'upgrade' doesnt mean a complete rewrite of the code for that entity.

---

## Problem statement

Several sync solutions exist (Electric SQL, TinyBase, LiveStore, Liveblocks, etc.), but none align well for a hybrid approach:

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
- **Minimal UI surface area** - Forms and UI components should remain unaware of sync mechanics. Sync concerns (tx metadata, changedField detection, mutation splitting) are handled in the mutation layer (`query.ts`), not in forms.

### Architecture
- **Leverage CDC Worker** - Use pg `activitiesTable` as durable activity log (no separate transaction storage).
- **Live stream** - SSE streaming backed by CDC Worker + WebSocket for realtime sync (`RealtimeEntityType` only).
- **Separation of concerns** - LIST endpoints handle queries/filtering; live stream is dumb, just provides new data.
- **React Query as merge point** - Both initial load and live stream updates feed into the same cache.
- **Two paths for entity data** - Live updates get entity data from CDC Worker via WebSocket; catch-up queries JOIN activities with entity tables.

### Sync mechanics
- **Client-generated IDs** - Synced entities use client-generated transaction IDs for determinism.
- **Upstream-first sync** - Pull before push will prevent most conflicts for online clients.
- **Hybrid logical clocks (HLC)** - Transaction IDs use HLC for causality-preserving, sortable timestamps.
- **Offline mutation queue** - Persist pending mutations to IndexedDB, replay on reconnect.
- **Persisted stream offset** - Store last received `activityId` in IndexedDB per org, so closing browser doesn't lose position.
- **Field-level tracking** - One mutation = one transaction = one field change. The `data` object uses standard entity update shape; `tx.changedField` declares which single field is tracked for conflicts (see DEC-18).
- **Merge strategy** - LWW (server wins) as default, resolution UI for fields needing user input.
- **Single-writer multi-tab** - One leader tab owns SSE connection and broadcasts to followers.

### Mutation layer responsibilities

The mutation layer (`query.ts`) encapsulates all sync logic so forms remain simple:

1. **changedField detection** - Compare incoming data against cached entity to detect which field(s) changed
2. **Mutation splitting** - If multiple fields changed, split into separate mutations (one per field) for proper conflict tracking
3. **tx metadata generation** - Generate `transactionId`, `sourceId`, `expectedTransactionId`, `changedField`
4. **Conflict detection prep** - Look up last known transaction ID per field for `expectedTransactionId`
5. **Optimistic updates** - Apply changes to cache immediately, rollback on error

**Form contract**: Forms call `updateMutation.mutate({ id, data })` - no sync knowledge required.

```typescript
// Mutation layer handles everything internally
export const usePageUpdateMutation = () => {
  return useMutation({
    mutationFn: ({ id, data }) => {
      // 1. Get current entity from cache
      const current = findPageInCache(id);
      
      // 2. Detect changed fields
      const changedFields = detectChangedFields(current, data);
      
      // 3. If multiple fields, split into sequential mutations
      if (changedFields.length > 1) {
        return splitAndExecuteMutations(id, data, changedFields);
      }
      
      // 4. Single field - generate tx and execute
      const changedField = changedFields[0] ?? null;
      const tx = buildTxMetadata(id, changedField);
      return updatePage({ path: { id }, body: { data, tx } });
    },
    // ...optimistic update logic
  });
};
```

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

The config exports typed arrays and type guards for entity classification:

```typescript
// config/default.ts exports:
export const realtimeEntityTypes = ['attachment', 'page'] as const;
export const offlineEntityTypes = [] as const;

// Derived types
export type RealtimeEntityType = (typeof realtimeEntityTypes)[number];
export type OfflineEntityType = (typeof offlineEntityTypes)[number];
```

**Usage by layer:**

| Layer | Uses | Example |
|-------|------|---------|
| **CDC Worker** | `EntityType` (all entities) | `extractActivityContext()` returns `entityType: EntityType \| null` |
| **Stream Handlers** | `RealtimeEntityType` | Filter activities to only stream realtime entities |
| **API Handlers** | `RealtimeEntityType` or `OfflineEntityType` | Accept `{ data, tx }` wrapper for synced entities |
| **Frontend** | `RealtimeEntityType` | `useLiveStream()` hook subscribes to realtime entities |

**Type guard pattern:**

```typescript
// In stream-subscriber-manager.ts (strict layer)
import { config, type RealtimeEntityType } from 'config';
const { realtimeEntityTypes } = config;

const isRealtimeEntityType = (type: string): type is RealtimeEntityType =>
  realtimeEntityTypes.includes(type as RealtimeEntityType);

// In routeActivity() - only process realtime entities
if (!isRealtimeEntityType(notification.entityType)) return;
```

**CDC Worker (lenient layer) - no type guard needed:**

```typescript
// In cdc/src/utils/extract-activity-context.ts
// The entry.type comes from table registry, already typed as EntityType
const entityType = entry.kind === 'entity' ? entry.type : null;
// No assertion needed - discriminated union handles it
```

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

### Extended activitiesTable schema

```typescript
// backend/src/db/schema/activities.ts - additions
export const activitiesTable = pgTable('activities', {
  // ... existing columns (including changedKeys for activity feed)
  
  // NEW: Transaction metadata for sync tracking (null for non-synced entities)
  tx: jsonb('tx').$type<{
    transactionId: string;
    sourceId: string;
    changedField: string | null;
  }>(),
  
}, (table) => [
  // ... existing indexes
  // Expression indexes for tx queries
  index('idx_activities_tx_id').on(sql`(tx->>'transactionId')`),
  // Fast lookup: "what's the latest transaction for this entity+field?"
  index('idx_activities_tx_field').on(
    table.entityType, 
    table.entityId, 
    sql`(tx->>'changedField')`
  ),
]);
```

### CDC Worker: Transaction extraction, activity insert, and WebSocket notification

The CDC Worker processes three sync-related tasks:
1. **Extract tx metadata** from replicated row data
2. **Insert activity record** into activitiesTable (with tx metadata)
3. **Send via WebSocket** so stream consumers get instant and complete updates (no payload limit)

```typescript
// cdc/src/utils/extract-activity-context.ts

// Zod schema for tx parsing (synced entities only)
const txColumnSchema = z.object({
  transactionId: z.string().max(32),
  sourceId: z.string().max(64),
  changedField: z.string().max(64).nullable(),
});

export type Tx = z.infer<typeof txColumnSchema>;

/**
 * Type-safe extraction of tx JSONB from row data.
 */
function getRowTxData(row: Record<string, unknown>): Tx {
  const rawTx = row.tx ?? row['tx'];
  return txColumnSchema.parse(rawTx);
}

export function extractActivityContext(
  entry: TableRegistryEntry,
  row: Record<string, unknown>,
  action: ActivityAction,
) {
  // ... existing extraction
  
  const txData = getRowTxData(row);
  
  return {
    // ... existing fields
    tx: txData
  };
}

// cdc/src/lib/api-websocket.ts

/**
 * WebSocket client for CDC Worker → API Server communication.
 * Persistent connection with automatic reconnection.
 */
class ApiWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimeout: Timer | null = null;
  private messageQueue: string[] = [];
  
  constructor(private url: string, private secret: string) {}
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, {
        headers: { 'x-cdc-secret': this.secret },
      });
      
      this.ws.onopen = () => {
        // Flush queued messages
        for (const msg of this.messageQueue) {
          this.ws?.send(msg);
        }
        this.messageQueue = [];
        resolve();
      };
      
      this.ws.onclose = () => this.scheduleReconnect();
      this.ws.onerror = (err) => reject(err);
    });
  }
  
  send(data: unknown): void {
    const message = JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.messageQueue.push(message); // Queue for reconnection
    }
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect().catch(() => this.scheduleReconnect());
    }, 5000);
  }
}

// Singleton instance
export const apiWebSocket = new ApiWebSocket(
  env.API_INTERNAL_WS_URL, // e.g., ws://localhost:4000/internal/cdc
  env.CDC_INTERNAL_SECRET,
);

// cdc/src/handlers/activity-sender.ts

interface ActivityPayload {
  activity: {
    id: string;
    type: string;
    action: ActivityAction;
    entityType: EntityType;
    entityId: string;
    organizationId: string;
    tx: Tx | null;
    changedKeys: string[] | null;
    createdAt: string;
  };
  entity: Record<string, unknown>;
}

/**
 * Send activity + entity data via WebSocket to API server.
 * No payload limit - full entity data always included.
 */
function sendActivityToApi(activity: ActivityModel, entityData: Record<string, unknown>): void {
  const payload: ActivityPayload = {
    activity: {
      id: activity.id,
      type: activity.type,
      action: activity.action,
      entityType: activity.entityType,
      entityId: activity.entityId,
      organizationId: activity.organizationId,
      tx: activity.tx,
      changedKeys: activity.changedKeys,
      createdAt: activity.createdAt.toISOString(),
    },
    entity: entityData,
  };
  
  apiWebSocket.send(payload);
}

// cdc/src/handlers/insert.ts - Complete flow

async function handleInsert(row: Record<string, unknown>, entry: TableRegistryEntry) {
  // 1. Extract context including tx metadata
  const context = extractActivityContext(entry, row, 'create');
  
  // 2. Build activity record
  const activity: ActivityInsert = {
    organizationId: context.organizationId,
    entityType: context.entityType,
    entityId: context.entityId,
    action: 'create',
    tx: context.tx,
    // ... other fields
  };
  
  // 3. Insert activity
  const [inserted] = await db.insert(activitiesTable).values(activity).returning();
  
  // 4. Send via WebSocket for instant stream delivery (full entity data, no limit)
  sendActivityToApi(inserted, row);
}
```


### Realtime sync via live stream

**API server: Stream subscriber manager**

```typescript
// backend/src/lib/stream/stream-subscribers.ts
// NOTE: This subscribes to ActivityBus, which receives from CDC Worker via WebSocket
//       (all entity types with full entity data, no payload limit)

interface Subscriber {
  stream: LiveStreamConnection;
  entityTypes: RealtimeEntityType[] | null;  // null = all realtime entity types
  cursor: number;
  userId: string;
  userSystemRole: SystemRoleModel['role'] | 'user';   // From getContextUserSystemRole()
  memberships: MembershipBaseModel[];        // User's memberships for permission checks
}

interface ActivityNotification {
  orgId: string;
  activityId: number;
  entityType: RealtimeEntityType;
  entityId: string;
  action: ActivityAction;
  tx: Tx | null;
  entity: Record<string, unknown>;  // Always present for realtime entities (via WebSocket)
}

class StreamSubscriberManager {
  private subscribers = new Map<string, Set<Subscriber>>();
  private unsubscribeFromActivityBus: (() => void) | null = null;
  
  async initialize(activityBus: ActivityBus): Promise<void> {
    // Subscribe to ActivityBus which receives from CDC Worker via WebSocket
    // All entity types include full entity data (no payload limit)
    this.unsubscribeFromActivityBus = activityBus.on('activity', async (event) => {
      await this.broadcast(event);
    });
  }
  
  subscribe(orgId: string, subscriber: Subscriber): () => void {
    if (!this.subscribers.has(orgId)) {
      this.subscribers.set(orgId, new Set());
    }
    this.subscribers.get(orgId)!.add(subscriber);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.get(orgId)?.delete(subscriber);
      if (this.subscribers.get(orgId)?.size === 0) {
        this.subscribers.delete(orgId);
      }
    };
  }
  
  private async broadcast(payload: ActivityNotification): Promise<void> {
    const orgSubscribers = this.subscribers.get(payload.orgId);
    if (!orgSubscribers || orgSubscribers.size === 0) return;
    
    // Entity data always included from CDC Worker via WebSocket (no payload limit)
    // No fallback fetch needed for realtime entities
    
    // Fan out to all subscribers for this org
    for (const subscriber of orgSubscribers) {
      // Skip if subscriber is filtering and this type doesn't match
      if (subscriber.entityTypes && 
          !subscriber.entityTypes.includes(payload.entityType)) {
        continue;
      }
      
      // Skip if subscriber already has this (cursor check)
      if (payload.activityId <= subscriber.cursor) {
        continue;
      }
      
      // AUTHORIZATION: Use Cella's isPermissionAllowed for entity-level access
      // This reuses the same permission logic as REST endpoints
      const canAccess = this.checkEntityAccess(subscriber, payload);
      if (!canAccess) continue;
      
      try {
        await subscriber.stream.writeSSE({
          event: 'change',
          data: JSON.stringify(enriched),
          id: String(payload.activityId),
        });
        subscriber.cursor = payload.activityId;
      } catch {
        // Stream closed, will be cleaned up
      }
    }
  }
  
  /**
   * Check if subscriber can access this entity using Cella's permission system.
   * Mirrors the logic in getValidProductEntity() and splitByAllowance().
   */
  private checkEntityAccess(subscriber: Subscriber, payload: ActivityNotification): boolean {
    // System admins can see everything
    if (subscriber.userSystemRole === 'admin') return true;
    
    // Build entity object for permission check
    const projectId = payload.entity?.projectId;
    
    const entity = {
      entityType: payload.entityType,
      id: payload.entityId,
      organizationId: payload.orgId,
      ...(typeof projectId === 'string' && { projectId }),
    };
    
    // Use Cella's permission check - same logic as REST handlers
    const { allowed } = isPermissionAllowed(subscriber.memberships, 'read', entity);
    return allowed;
  }
}

export const streamSubscriberManager = new StreamSubscriberManager();
```

**Stream endpoint: Register subscriber, no polling**

Uses Cella's context helpers (`getContextUser`, `getContextOrganization`, `getContextMemberships`, `getContextUserSystemRole`) for authorization.

```typescript
// backend/src/modules/entities/entities-handlers.ts

const app = new OpenAPIHono<Env>();

const entitiesHandlers = app
  /**
   * SSE stream for realtime entity updates.
   * Authorization via org guard middleware (same as REST endpoints).
   */
  .openapi(entitiesRoutes.subscribeToStream, async (ctx) => {
    const { offset, live, entityTypes: entityTypesParam } = ctx.req.valid('query');
    
    // Parse entity types from query param - route schema already validates these are RealtimeEntityType values
    // The split + filter produces string[] but zod validation in route schema ensures they match RealtimeEntityType
    const entityTypesList = entityTypesParam?.split(',').filter(Boolean);
    const entityTypes = entityTypesList?.length ? entityTypesList : null;
    
    // Use Cella context helpers (populated by auth + org guard middleware)
    const user = getContextUser();
    const { id: orgId, membership } = getContextOrganization();
    const memberships = getContextMemberships();
    const userSystemRole = getContextUserSystemRole();
    
    // Parse offset
    let cursor = offset === '-1' ? 0 
               : offset === 'now' ? await getLatestActivityId(orgId)
               : Number(offset);
    
    if (live === 'sse') {
      return streamSSE(ctx, async (stream) => {
        // 1. Catch-up: send any activities since cursor
        // Pass memberships for permission filtering (same logic as splitByAllowance)
        const catchUp = await fetchAndEnrichActivities({
          orgId,
          cursor,
          entityTypes,
          memberships,
          userSystemRole,
        });
        
        for (const event of catchUp) {
          await stream.writeSSE({
            event: 'change',
            data: JSON.stringify(event),
            id: String(event.activityId),
          });
          cursor = event.activityId;
        }
        
        // 2. Send current offset
        await stream.writeSSE({ event: 'offset', data: String(cursor) });
        
        // 3. Register for push notifications (no polling!)
        // Subscriber includes memberships for permission checks during fan-out
        const unsubscribe = streamSubscriberManager.subscribe(orgId, {
          stream,
          entityTypes,
          cursor,
          userId: user.id,
          userSystemRole,
          memberships,  // For isPermissionAllowed checks in broadcast()
        });
        
        // 4. Keep alive until client disconnects
        stream.onAbort(() => {
          unsubscribe();
        });
        
        // Keep connection open (Hono handles this)
        await new Promise(() => {}); // Never resolves, stream stays open
      });
    }
    
    // Catch-up mode (non-SSE)
    const activities = await fetchAndEnrichActivities({
      orgId,
      cursor,
      entityTypes,
      memberships,
      userSystemRole,
    });
    
    const nextOffset = activities.length > 0 
      ? String(activities[activities.length - 1].activityId) 
      : String(cursor);
    
    ctx.header('Stream-Next-Offset', nextOffset);
    ctx.header('Cache-Control', 'public, max-age=5');
    
    return ctx.json(activities);
  });

export default streamHandlers;
```

**Activity fetcher with permission filtering**

```typescript
// backend/src/lib/stream/activity-fetcher.ts

interface FetchActivitiesParams {
  orgId: string;
  cursor: number;
  entityTypes: RealtimeEntityType[] | null;
  memberships: MembershipBaseModel[];
  userSystemRole: SystemRoleModel['role'] | 'user';
}

/**
 * Fetch activities and filter by user permissions.
 * Uses same permission logic as getValidProductEntity and splitByAllowance.
 */
export async function fetchAndEnrichActivities({
  orgId,
  cursor,
  entityTypes,
  memberships,
  userSystemRole,
}: FetchActivitiesParams) {
  // Build query filters
  const filters = [
    eq(activitiesTable.organizationId, orgId),
    gt(activitiesTable.id, String(cursor)),
  ];
  
  if (entityTypes?.length) {
    filters.push(inArray(activitiesTable.entityType, entityTypes));
  }
  
  // NOTE: Catch-up queries JOIN activities with entity tables to get entity data.
  // This differs from live updates where CDC Worker sends entity data via WebSocket.

  // Dynamic JOIN based on entity type (simplified - actual implementation uses type switch)
  const activitiesWithEntity = await fetchActivitiesWithEntityData(db, filters, entityTypes);
  
  // Filter by permissions (system admins see all)
  if (userSystemRole === 'admin') {
    return activitiesWithEntity;
  }
  
  // For each activity, check if user can read the entity
  return activitiesWithEntity.filter((activity) => {
    if (!activity.entityType || !activity.entityId) return false;
    
    // Build entity object for permission check
    const entity = {
      entityType: activity.entityType,
      id: activity.entityId,
      organizationId: orgId,
    };
    
    const { allowed } = isPermissionAllowed(memberships, 'read', entity);
    return allowed;
  });
}

export async function getLatestActivityId(orgId: string): Promise<number> {
  const [latest] = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(eq(activitiesTable.organizationId, orgId))
    .orderBy(activitiesTable.id)
    .limit(1);
  
  return latest ? Number(latest.id) : 0;
}
```

**Stream message payload** (combines entity data with metadata):

```typescript
// Matches createStreamMessageSchema output
// NOTE: Stream messages have different shape from request tx wrapper
// - Request: { data, tx: { transactionId, sourceId, changedField } }
// - Stream: Full message with entity + activity metadata
interface StreamMessage<T = unknown> {
  // Entity data
  data: T | null;                  // Full entity data (null if deleted)
  entityType: string;              // 'page' | 'attachment' 
  entityId: string;
  
  // Activity metadata (from activitiesTable)
  action: ActivityAction;          // 'create' | 'update' | 'delete'
  activityId: number;              // Stream offset for resumption
  changedKeys: string[] | null;    // Which fields changed (for updates)
  createdAt: string;               // Activity timestamp
  
  // Transaction metadata (from tx column, null for non-synced)
  tx: Tx | null;
}
```

**Frontend: Live stream + React Query integration**

```typescript
// frontend/src/query/realtime/use-live-stream.ts
export function useLiveStream(
  orgIdOrSlug: string,
  options?: {
    entityTypes?: string[];
    onMessage?: (message: StreamMessage) => void;
  }
) {

  // Persisted offset - survives tab closure (see OFFLINE-0)
  const offsetRef = useRef<string | null>(null);
  const debouncedSaveOffset = useDebouncedCallback(
    (offset: string) => offsetStore.set(orgIdOrSlug, offset),
    5000 // Max 1 write per 5 seconds
  );
  
  // Hydrate barrier - queue messages until initial data is loaded
  // Prevents race: stream message arrives before LIST query completes
  const queuedMessages = useRef<StreamMessage[]>([]);
  const isHydrating = useRef(true);
  
  // Track when initial queries complete
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.status === 'success') {
        if (isHydrating.current) {
          isHydrating.current = false;
          // Flush queued messages
          for (const queuedMessage of queuedMessages.current) {
            applyMessageToCache(queryClient, queuedMessage);
          }
          queuedMessages.current = [];
        }
      }
    });
    return unsubscribe;
  }, [queryClient]);
  
  const handleStreamMessage = useCallback((message: StreamMessage) => {
    // Queue during hydration to prevent data regression
    if (isHydrating.current) {
      queuedMessages.current.push(message);
      return;
    }
    
    // Mark pending transactions as confirmed when they appear in stream
    const transactionId = message.tx?.transactionId;
    if (transactionId && pendingTransactions.has(transactionId)) {
      trackTransaction(transactionId, { status: 'confirmed' });
      pendingTransactions.delete(transactionId);
    }
    
    // Update React Query cache
    applyMessageToCache(queryClient, message);
    options?.onMessage?.(message);
  }, [queryClient, options?.onMessage]);
  
  useEffect(() => {
    if (!isOnline || !orgIdOrSlug) return;
    
    // Read persisted offset on connect (critical for offline recovery)
    const initOffset = async () => {
      const persisted = await offsetStore.get(orgIdOrSlug);
      offsetRef.current = persisted ?? 'now';
      
      const params = new URLSearchParams({
        offset: offsetRef.current,
        live: 'sse',
      });
      if (options?.entityTypes?.length) {
        params.set('entityTypes', options.entityTypes.join(','));
      }
      
      const eventSource = new EventSource(`/api/stream/${orgIdOrSlug}?${params}`);
      
      eventSource.addEventListener('offset', (e) => {
        offsetRef.current = e.data;
        debouncedSaveOffset(e.data);
      });
      
      eventSource.addEventListener('change', (e) => {
        const message: StreamMessage = JSON.parse(e.data);
        offsetRef.current = e.lastEventId;
        debouncedSaveOffset(e.lastEventId);
        handleStreamMessage(message);
      });
      
      return () => eventSource.close();
    };
    
    const cleanup = initOffset();
    return () => { cleanup.then(fn => fn?.()); };
  }, [orgIdOrSlug, isOnline, handleStreamMessage]);
}

// ═══════════════════════════════════════════════════════════════════════════
// Cache update utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply stream message to React Query cache.
 * Uses message metadata to route to correct cache entries.
 */
function applyMessageToCache(queryClient: QueryClient, message: StreamMessage) {
  const { action, entityType, entityId, data: entity } = message;
  
  // Update detail cache
  if (action === 'delete') {
    queryClient.removeQueries({ queryKey: [entityType, entityId] });
  } else if (entity) {
    queryClient.setQueryData([entityType, entityId], entity);
  }
  
  // Update list caches - use type predicate to narrow list data shape
  queryClient.setQueriesData(
    { queryKey: [entityType, 'list'] },
    (oldData: unknown) => {
      if (!oldData || !isListCacheData(oldData)) return oldData;
      return updateListCache(oldData, action, entityId, entity);
    }
  );
}

/**
 * Type guard for list cache data structure.
 * Validates shape for TanStack Query infinite query cache.
 */
function isListCacheData(data: unknown): data is { pages: unknown[][]; pageParams: unknown[] } {
  if (typeof data !== 'object' || data === null) return false;
  if (!('pages' in data)) return false;
  // After 'in' check, TypeScript knows 'pages' exists
  const { pages } = data as { pages: unknown };
  return Array.isArray(pages);
}
```

### Transaction ID format (hybrid logical clock)

Cella uses **Hybrid Logical Clocks (HLC)** for transaction IDs. HLC combines physical timestamps with logical counters to provide:

- **Causality preservation**: If event A causes B, then HLC(A) < HLC(B)
- **Lexicographic sortability**: String comparison matches temporal order
- **Clock skew tolerance**: Logical counter handles same-millisecond events
- **Human readability**: Timestamps are visible for debugging

**Format**: `{wallTime}.{logical}.{nodeId}` (~32 chars)

```typescript
// frontend/src/query/offline/hlc.ts

// One HLC instance per tab (nodeId = sourceId)
const hlc = new HLC({ nodeId: sourceId });

/**
 * Generate a transaction ID using Hybrid Logical Clock.
 * Format: "1705123456789.0000.abc123" (wallTime.logical.nodeId)
 */
export const createTransactionId = (): string => {
  const timestamp = hlc.now();
  return `${timestamp.wallTime}.${String(timestamp.logical).padStart(4, '0')}.${timestamp.nodeId}`;
};

/**
 * Parse a transaction ID back into HLC components.
 */
export const parseTransactionId = (txId: string): { wallTime: number; logical: number; nodeId: string } => {
  const [wallTime, logical, nodeId] = txId.split('.');
  return { wallTime: Number(wallTime), logical: Number(logical), nodeId };
};

/**
 * Compare two transaction IDs. Returns -1, 0, or 1.
 * Lexicographic string comparison works due to format.
 */
export const compareTransactionIds = (a: string, b: string): number => {
  return a.localeCompare(b);
};

// Example output: "1705123456789.0000.src_abc123def456"
```

### Entity transient `tx` column

Synced entity tables have a single transient JSONB column for transaction metadata:

```typescript
// In backend/src/db/schema/pages.ts (and other synced entities)
export const pages = pgTable('pages', {
  // ... existing columns ...
  
  // Transient transaction metadata (written by handler, read by CDC Worker, overwritten on next mutation)
  tx: jsonb('tx').$type<{
    transactionId: string;
    sourceId: string;
    changedField: string | null;
  }>(),
});
```

**Why "transient"?**
- Written by handler during mutation
- Read by CDC Worker to populate activitiesTable
- Overwritten on next mutation (no history preserved on entity)
- Entity table is NOT the source of truth for sync state
- activitiesTable has complete field-level audit trail

**Why not permanent columns like `lastTransactionId`?**
- Entity-level tracking causes false conflicts (two users editing different fields)
- Field-level requires history: "what was the last transaction for THIS field?"
- That history lives in activitiesTable, queried via `checkFieldConflict()`

### Transaction wrapper schema

| Operation | Request | Response | Notes |
|-----------|---------|----------|-------|
| GET | Flat params | `Entity[]` / `Entity` | No tx - resolve conflicts client-side |
| POST/PATCH/DELETE | `{ data, tx }` | `{ data, tx }` | Server tracks transaction + source + changedField |
| Stream message | N/A | `{ data, tx }` | Includes sourceId, changedField for "is this mine?" |

**Transaction metadata schemas:**

```typescript
// backend/src/modules/sync/schema.ts
export const txSchema = z.object({
  transactionId: z.string().describe('Unique mutation ID (client-generated)'),
  sourceId: z.string().describe('Tab/instance ID - origin of mutation'),
  changedField: z.string().nullable().describe('Which field this mutation changes (null for create/delete)'),
  expectedTransactionId: z.string().nullable()
    .describe('Last transaction ID for this field (null for create, required for update/delete per API-009)'),
});

```

### Source identifier & transaction factory

**Single module for sync primitives** - consolidates `sourceId` and transaction ID generation:

```typescript
// frontend/src/query/offline/hlc.ts
// (sourceId is generated here, not in separate file)

/** Unique identifier for this browser tab (generated once per page load) */
export const sourceId = nanoid();

/** 
 * Create a transaction ID with timestamp prefix for sortability.
 * Format: {timestamp_base36}-{nanoid} (~21 chars)
 */
export const createTransactionId = () => {
  const timestamp = Date.now().toString(36).padStart(8, '0');
  return `${timestamp}-${nanoid(12)}`;
};
```

| Purpose | How sourceId serves it |
|---------|------------------------|
| Mutation source | Sent in `tx.sourceId`, stored in `lastSourceId` column |
| "Is this mine?" | Compare stream message's `sourceId` to your own |
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
1. **Backend** - Validates `expectedTransactionId` against activitiesTable
2. **Frontend (online)** - Handles 409 conflict responses
3. **Frontend (offline)** - Detects conflicts client-side when pulling upstream changes


#### Example code to handle conflicts

```typescript
// backend/src/lib/sync/conflict-detection.ts

interface ConflictCheckParams {
  entityType: string;
  entityId: string;
  changedField: string;
  expectedTransactionId: string | null;
}

/**
 * Check if a field has been modified since the client last saw it.
 */
export async function checkFieldConflict({
  entityType, entityId, changedField, expectedTransactionId,
}: ConflictCheckParams): Promise<{ hasConflict: boolean; serverTransactionId: string | null }> {
  const [latest] = await db
    .select({ tx: activitiesTable.tx })
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.entityType, entityType),
        eq(activitiesTable.entityId, entityId),
        sql`${activitiesTable.tx}->>'changedField' = ${changedField}`,
        sql`${activitiesTable.tx}->>'transactionId' IS NOT NULL`
      )
    )
    .orderBy(desc(activitiesTable.id))
    .limit(1);

  const serverTransactionId = latest?.tx?.transactionId ?? null;
  const hasConflict = serverTransactionId !== null && serverTransactionId !== expectedTransactionId;

  return { hasConflict, serverTransactionId };
}

// backend/src/modules/pages/handlers.ts

app.openapi(routes.updatePage, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const { data, tx } = ctx.req.valid('json');
  
  const { hasConflict, serverTransactionId } = await checkFieldConflict({
    entityType: 'page',
    entityId: id,
    changedField: tx.changedField,
    expectedTransactionId: tx.expectedTransactionId,
  });
  
  if (hasConflict) {
    throw new AppError(409, 'field_conflict', 'warn', {
      entityType: 'page',
      meta: {
        field: tx.changedField,
        expectedTransactionId: tx.expectedTransactionId,
        serverTransactionId,
      },
    });
  }
  
  // 2. Apply update with transient tx JSONB
  const [page] = await db.update(pagesTable)
    .set({
      ...data,
      tx: { transactionId: tx.transactionId, sourceId: tx.sourceId, changedField: tx.changedField },
      modifiedAt: new Date(),
      modifiedBy: ctx.get('user').id,
    })
    .where(eq(pagesTable.id, id))
    .returning();
  
  return ctx.json({ data: page, tx: { transactionId: tx.transactionId } });
});

// frontend/src/query/realtime/sync-coordinator.ts
// (conflict detection is part of sync coordinator)

/**
 * When stream message arrives, check for conflicts with queued mutations.
 * Called during upstream-first sync when reconnecting.
 */
function handleUpstreamMessage(message: StreamMessage, outbox: FieldMutationOutbox) {
  const { entityId, data: serverData } = message;
  const { changedField, transactionId } = message.tx;
  
  if (!changedField) return;
  
  // Check if we have a queued mutation for this field
  const queued = outbox.find(m => m.entityId === entityId && m.field === changedField);
  
  if (queued && serverData) {
    // Conflict! Field was modified server-side while we had pending changes
    queued.status = 'conflicted';
    queued.conflict = {
      serverValue: serverData[changedField as keyof typeof serverData],
      serverTransactionId: transactionId,
    };
  }
  
  // Update field transaction tracking regardless
  setFieldTransactionId(entityId, changedField, transactionId);
}

/**
 * Resolve a conflict between a queued local mutation and a server change.
 * Called when user chooses how to handle a field that was modified both locally and remotely.
 */
function resolveConflict(outbox: FieldMutationOutbox, queued: OutboxEntry, resolution: 'keep-mine' | 'keep-server' | 'merge', mergedValue?: unknown) {
  switch (resolution) {
    case 'keep-mine':
      // Rebase: accept server's version as base, but re-apply our value on top
      // Update expectedTransactionId so server sees we're aware of its change
      queued.expectedTransactionId = queued.conflict?.serverTransactionId ?? null;
      queued.status = 'pending'; // Ready to retry
      delete queued.conflict;
      break;
    case 'keep-server':
      // Discard our queued mutation - server value wins
      outbox.remove(queued);
      break;
    case 'merge':
      // User provided a merged value combining both versions
      queued.value = mergedValue;
      queued.expectedTransactionId = queued.conflict?.serverTransactionId ?? null;
      queued.status = 'pending'; // Ready to send merged value
      delete queued.conflict;
      break;
  }
}
```

### Idempotency via activitiesTable

Idempotency ensures that replaying the same mutation (same `transactionId`) produces the same result without side effects. This is critical for offline-first sync because:

- **Network retries**: A request may succeed server-side but the response gets lost. Client retries → server must recognize the duplicate.
- **Offline queue replay**: When reconnecting, queued mutations are flushed. If some already reached the server before disconnect, they must not create duplicates.
- **Crash recovery**: Browser crash mid-mutation → on restart, pending transactions replay from IndexedDB.

The `activitiesTable` serves as the idempotency check: if a `transactionId` already exists in an activity record, the mutation was already applied.

```typescript
// backend/src/lib/idempotency.ts

// Check if a transaction has already been processed.
export async function isTransactionProcessed(
  db: DbClient,
  transactionId: string,
): Promise<boolean> {
  const existing = await db.select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(sql`${activitiesTable.tx}->>'transactionId' = ${transactionId}`)
    .limit(1);
  
  return existing.length > 0;
}

// Get the entity created/modified by a transaction.
export async function getEntityByTransaction(
  db: DbClient,
  transactionId: string,
): Promise<{ entityType: string; entityId: string } | null> {
  const [activity] = await db.select({
    entityType: activitiesTable.entityType,
    entityId: activitiesTable.entityId,
  })
    .from(activitiesTable)
    .where(sql`${activitiesTable.tx}->>'transactionId' = ${transactionId}`)
    .limit(1);
  
  // entityType and entityId are nullable in schema, narrow before returning
  if (!activity?.entityType || !activity?.entityId) return null;
  return { entityType: activity.entityType, entityId: activity.entityId };
}

// Usage in handler
app.openapi(routes.createPage, async (ctx) => {
  const { data, tx } = ctx.req.valid('json');
  const { transactionId, sourceId } = tx;
  
  if (await isTransactionProcessed(db, transactionId)) {
    // Idempotent: return existing entity
    const ref = await getEntityByTransaction(db, transactionId);
    if (ref) {
      const [existing] = await db.select()
        .from(pagesTable)
        .where(eq(pagesTable.id, ref.entityId));
      
      return ctx.json({ data: existing, tx: { transactionId } });
    }
  }
  
  // First time - process normally
  // ...
});
```

---



### Frontend mutation pattern with transactions

Example using `page` entity.

```typescript
// frontend/src/modules/pages/query.ts - with sync tracking

/**
 * Create a page with optimistic updates and transaction tracking.
 * Demonstrates the sync pattern for synced entities.
 */
export const usePageCreateMutation = (orgIdOrSlug: string) => {
  const qc = useQueryClient();
  const mutateCache = useMutateQueryData(pageKeys.list({ orgIdOrSlug }));
  const { trackTransaction } = useTransactionManager();

  const pendingTxRef = useRef<string | null>(null);

  return useMutation<
    Page, 
    ApiError, 
    CreatePageBody, 
    { optimisticPage: Page; transactionId: string }
  >({
    mutationKey: pageKeys.create(),
    
    mutationFn: async (body) => {
      // transactionId was set in onMutate before mutationFn runs
      const transactionId = pendingTxRef.current;
      if (!transactionId) throw new Error('Transaction ID not set');
      
      return createPage({ 
        path: { orgIdOrSlug }, 
        body: {
          data: body,
          tx: { transactionId, sourceId, changedField: null }, // null for create
        },
      });
    },

    onMutate: async (newPage) => {
      const transactionId = createTransactionId();
      pendingTxRef.current = transactionId;
      
      // Cancel outgoing refetches
      await qc.cancelQueries({ queryKey: pageKeys.list({ orgIdOrSlug }) });

      // Build optimistic page with client-generated ID
      const optimisticPage: Page = {
        id: nanoid(), // Client-generated ID for optimistic display
        ...newPage,
        organizationId: orgIdOrSlug,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        createdBy: null, // Will be set by server
        modifiedBy: null,
      };

      // Track pending transaction for stream confirmation
      trackTransaction(transactionId, {
        type: 'create',
        entityType: 'page',
        entityIds: [optimisticPage.id],
        status: 'pending',
      });

      // Add to cache optimistically
      mutateCache.create([optimisticPage]);

      return { optimisticPage, transactionId };
    },

    onError: (_err, _newPage, context) => {
      // Remove optimistic data on error
      if (context?.optimisticPage) {
        mutateCache.remove([context.optimisticPage]);
      }
      if (context?.transactionId) {
        trackTransaction(context.transactionId, { status: 'failed' });
      }
    },

    onSuccess: (createdPage, _variables, context) => {
      // Replace optimistic with real data from server
      if (context?.optimisticPage) {
        mutateCache.remove([context.optimisticPage]);
      }
      mutateCache.create([createdPage]);
      
      // Mark as sent - final 'confirmed' status set when stream message arrives
      if (context?.transactionId) {
        trackTransaction(context.transactionId, { status: 'sent' });
      }
    },

    onSettled: () => {
      // Always refetch to ensure cache is in sync
      qc.invalidateQueries({ queryKey: pageKeys.list({ orgIdOrSlug }) });
    },
  });
};
```

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

```typescript
// frontend/src/query/offline/squash-utils.ts
// (The cancel-in-flight pattern is implemented via squashPendingMutation)

/**
 * Field-level mutation with in-flight cancellation.
 * Ensures only ONE request per field is ever in-flight.
 * Sends immediately, cancels previous request if still pending.
 */
function useFieldMutation<T>(
  entityId: string,
  field: string,
  mutationFn: (value: T, signal: AbortSignal) => Promise<unknown>
) {
  // Track in-flight request for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingTxRef = useRef<string | null>(null);
  
  return useCallback(async (value: T) => {
    // Cancel any in-flight request for THIS field
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    const transactionId = createTransactionId();
    pendingTxRef.current = transactionId;
    
    try {
      await mutationFn(value, abortController.signal);
      trackTransaction(transactionId, { status: 'sent' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Request was cancelled by newer mutation - this is expected
        trackTransaction(transactionId, { status: 'cancelled' });
        return;
      }
      trackTransaction(transactionId, { status: 'failed' });
      throw err;
    }
  }, [entityId, field, mutationFn]);
}

// Usage example
const updateTitle = useFieldMutation(
  pageId,
  'title',
  (title, signal) => api.updatePage({ 
    params: { id: pageId },
    body: { data: { title }, tx: { transactionId, sourceId, changedField: 'title' } },
    signal, // Pass abort signal to fetch
  })
);
```

**Key behaviors:**
- Sends request IMMEDIATELY (no latency for user)
- If request is in-flight and user edits again → in-flight request cancelled
- AbortController propagates to fetch, stopping network request
- Cancelled transactions marked as such (not 'failed')
- Server only processes the latest request

#### Option B: Entity-level mutex (for discrete actions)

Best for: Toggle switches, explicit save buttons, non-typing interactions.

```typescript
// Note: Mutex pattern can be implemented if needed
// Currently we use React Query's mutation state instead
const mutatingEntities = new Map<string, Promise<unknown>>();

/**
 * Ensure only one mutation runs at a time per entity.
 * Subsequent mutations wait for in-flight mutation to complete.
 */
export async function withMutationLock<T>(
  entityKey: string,
  mutation: () => Promise<T>
): Promise<T> {
  // Wait for any in-flight mutation on same entity
  const existing = mutatingEntities.get(entityKey);
  if (existing) {
    await existing.catch(() => {}); // Ignore errors, we just need to wait
  }
  
  // Run our mutation with lock
  const promise = mutation();
  mutatingEntities.set(entityKey, promise);
  
  try {
    return await promise;
  } finally {
    mutatingEntities.delete(entityKey);
  }
}
```

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

**Solution**: Queue stream messages during hydration. See `useLiveStream` hook in which uses `isHydrating` ref and `queuedMessages` to defer message processing until initial queries complete.

### Stream offset store (offline)

The stream offset must be persisted to survive tab closure. Without this, users who close their browser and return later would start from `'now'` and miss all changes made while away.

```typescript
// frontend/src/query/realtime/offset-store.ts
// (Actual implementation uses Zustand + Dexie)

interface OffsetEntry {
  orgId: string;
  offset: string;
  updatedAt: number;
}

class SyncDatabase extends Dexie {
  offsets!: Dexie.Table<OffsetEntry, string>;
  outbox!: Dexie.Table<OutboxEntry, string>;  // Same DB for both
  
  constructor() {
    super('cella-sync');
    this.version(1).stores({
      offsets: 'orgId',
      outbox: '[entityType+entityId+field]',
    });
  }
}

const db = new SyncDatabase();

/**
 * Persisted stream offset store.
 * Stores last received activityId per org.
 */
export const offsetStore = {
  async get(orgId: string): Promise<string | null> {
    const entry = await db.offsets.get(orgId);
    return entry?.offset ?? null;
  },
  
  async set(orgId: string, offset: string): Promise<void> {
    await db.offsets.put({
      orgId,
      offset,
      updatedAt: Date.now(),
    });
  },
  
  async clear(orgId: string): Promise<void> {
    await db.offsets.delete(orgId);
  },
};
```

### Field-level mutation outbox (offline)

**Scenario**: User offline, edits page 3 times:
```
Time 1: Update title → Mutation A queued (field: 'title', txId: A)
Time 2: Update content → Mutation B queued (field: 'content', txId: B)
Time 3: Update title again → Mutation C queued (field: 'title', txId: C)
```

**Field-Level Solution**: Queue per-field, squash same-field changes:

> **Note**: The actual implementation uses React Query's mutation cache with
> `squashPendingMutation()` from `query/offline/squash-utils.ts` rather than
> a separate IndexedDB outbox. See DEC-24 in SYNC_ENGINE_REQUIREMENTS.md.

```typescript
// Conceptual model (implemented via React Query mutation cache)
interface OutboxEntry {
  entityType: string;
  entityId: string;
  field: string;                  // Which field this mutation changes
  transactionId: string;          // Transaction ID for this mutation
  expectedTransactionId: string | null;  // For conflict detection
  value: unknown;                 // New value for this field
  status: 'pending' | 'sending' | 'conflicted';
  conflict?: {                    // Populated when upstream reveals conflict
    serverValue: unknown;
    serverTransactionId: string;
  };
  createdAt: number;
  updatedAt: number;
}

class FieldMutationOutbox {
  private entries: Map<string, OutboxEntry> = new Map();
  
  /**
   * Add mutation to outbox. Key is entityId:field.
   * Same-field mutations squash (keep latest value).
   */
  add(mutation: FieldMutation): void {
    const key = `${mutation.entityType}:${mutation.entityId}:${mutation.field}`;
    const existing = this.entries.get(key);
    
    if (existing) {
      // Squash: same field updated again, keep latest value
      existing.value = mutation.value;
      existing.transactionId = mutation.transactionId;
      existing.updatedAt = Date.now();
      // Keep original expectedTransactionId (what we originally expected)
    } else {
      // New entry for this field
      this.entries.set(key, {
        ...mutation,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
  
  /**
   * Check for conflicts when upstream message arrives.
   */
  checkUpstreamConflict(entityId: string, field: string, serverValue: unknown, serverTxId: string): void {
    const key = `*:${entityId}:${field}`;
    for (const [entryKey, entry] of this.entries) {
      if (entryKey.endsWith(`:${entityId}:${field}`)) {
        // We have a queued mutation for this field!
        entry.status = 'conflicted';
        entry.conflict = { serverValue, serverTransactionId: serverTxId };
      }
    }
  }
  
  /**
   * Flush pending entries when back online (after upstream pull).
   * Skip conflicted entries - they need user resolution.
   */
  async flush(): Promise<void> {
    for (const [key, entry] of this.entries) {
      if (entry.status === 'pending') {
        entry.status = 'sending';
        try {
          await this.sendMutation(entry);
          this.entries.delete(key);
        } catch (error) {
          if (isConflictError(error)) {
            entry.status = 'conflicted';
            entry.conflict = error.conflict;
          } else {
            entry.status = 'pending'; // Retry later
          }
        }
      }
    }
  }
  
  /**
   * Get all conflicted entries for resolution UI.
   */
  getConflicted(): OutboxEntry[] {
    return [...this.entries.values()].filter(e => e.status === 'conflicted');
  }
}
```

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
```typescript
class FieldMutationOutbox {
  add(mutation: MutationEntry): void {
    // Check for pending create of same entity
    const createKey = `${mutation.entityType}:${mutation.entityId}`;
    const pendingCreate = this.entries.get(createKey);
    
    if (pendingCreate?.type === 'create' && mutation.type === 'update') {
      // Merge update into pending create
      pendingCreate.data = { ...pendingCreate.data, ...mutation.data };
      pendingCreate.updatedAt = Date.now();
      return;
    }
    
    if (pendingCreate?.type === 'create' && mutation.type === 'delete') {
      // Cancel both - entity never reached server
      this.entries.delete(createKey);
      return;
    }
    
    // Standard add/squash logic for updates
    const key = this.getKey(mutation);
    const existing = this.entries.get(key);
    
    if (existing && mutation.type === 'update') {
      // Squash: same field updated again
      existing.data = mutation.data;
      existing.transactionId = mutation.transactionId;
      existing.updatedAt = Date.now();
    } else {
      this.entries.set(key, { ...mutation, createdAt: Date.now(), updatedAt: Date.now() });
    }
  }
}
```

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

**Leader Election** (Web Locks API):

```typescript
// frontend/src/query/realtime/tab-coordinator.ts
class TabCoordinator {
  private isLeader = false;
  private channel = new BroadcastChannel('cella-sync');
  private leaderCallbacks: (() => void)[] = [];
  
  async init(): Promise<void> {
    // Try to acquire leader lock
    navigator.locks.request(
      'cella-sync-leader',
      { mode: 'exclusive' },
      async (lock) => {
        if (lock) {
          this.isLeader = true;
          this.leaderCallbacks.forEach(cb => cb());
          
          // Hold lock until tab closes
          await new Promise(() => {}); // Never resolves
        }
      }
    );
    
    // Listen for broadcasts from leader
    this.channel.onmessage = (event) => {
      if (!this.isLeader) {
        this.handleBroadcast(event.data);
      }
    };
  }
  
  /**
   * Broadcast message to all tabs (leader only).
   */
  broadcast(message: StreamMessage): void {
    if (this.isLeader) {
      this.channel.postMessage(message);
    }
  }
  
  onBecomeLeader(callback: () => void): void {
    this.leaderCallbacks.push(callback);
    if (this.isLeader) callback();
  }
}

// Usage in stream hook
const coordinator = useTabCoordinator();

useEffect(() => {
  coordinator.onBecomeLeader(() => {
    // Only leader opens SSE connection
    const eventSource = new EventSource(`/api/stream/${orgId}?live=sse`);
    eventSource.onmessage = (e) => {
      const event = JSON.parse(e.data);
      applyEventToCache(queryClient, event);
      coordinator.broadcast(event); // Share with other tabs
    };
  });
}, []);
```

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
