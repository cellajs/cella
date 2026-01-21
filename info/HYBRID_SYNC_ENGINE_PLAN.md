# Cella hybrid sync engine plan

> **CRITICAL**:
Whenever you change the plan, iterate over the requirements and decisions document to confirm they still are consistent with the plan and whether to extend this document: [SYNC_ENGINE_REQUIREMENTS.md](./SYNC_ENGINE_REQUIREMENTS.md) - Design decisions, invariants, and testable requirements

> **Existing archicture**:
It is important to know Cella's base architecture and especially to realize the dynamic nature of the entity model:  Cella as a template has a composition of entities but a 'fork' of can have a different and extended composition: [ARCHITECTURE.md](./ARCHITECTURE.md)

**Terminology**:
The sync engine uses precise vocabulary to avoid confusion. See [SYNC_ENGINE_REQUIREMENTS.md#terminology](./SYNC_ENGINE_REQUIREMENTS.md#terminology) for the authoritative glossary covering:

## Summary

This document outlines a plan to build a **hybrid sync engine** that extends existing **OpenAPI + React Query** infrastructure with sync and offline capabilities. This engine is - *currently* - designed to be a integral part of cella and its entity model. The approach is "hybrid" because the default is standard REST/OpenAPI endpoints while product entity modules *can* be enhanced with transaction tracking, offline support, and live stream for realtime sync. 

| `opMode` | Features | Example |
|--------|----------|---------|
| **basic** | REST CRUD, server-generated IDs | Context entities (`organization`) |
| **offline** | + `{ data, tx }` wrapper, client IDs, transaction tracking, offline queue, conflict detection | Product entities (`page`, `attachment`) |
| **realtime** | + Live stream (SSE), live cache updates, multi-tab leader election | Daily-use (eg. `task`, not in cella) |

> This plan focuses on upgrading product entities from **basic** → **synced** → **realtime**.

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
- **Progressive enhancement** - REST for context entities; product entities add optimistic updates → offline → realtime.

### Architecture
- **Leverage CDC Worker** - Use pg `activitiesTable` as durable activity log (no separate transaction storage).
- **Live stream** - SSE streaming backed by CDC Worker + postgres NOTIFY for realtime sync (`realtime` opMode only).
- **Separation of concerns** - LIST endpoints handle queries/filtering; live stream is dumb, just provides new data.
- **React Query as merge point** - Both initial load and live stream updates feed into the same cache.
- **Two paths for entity data** - Live updates get entity data from CDC Worker NOTIFY; catch-up queries JOIN activities with entity tables.

### Sync mechanics
- **Client-generated IDs** - Product entities use client-generated transaction IDs for determinism.
- **Upstream-first sync** - Pull before push (see [online vs offline sync](./SYNC_ENGINE_REQUIREMENTS.md#online-vs-offline-sync)).
- **Hybrid logical clocks (HLC)** - Transaction IDs use HLC for causality-preserving, sortable timestamps.
- **Offline mutation queue** - Persist pending mutations to IndexedDB, replay on reconnect.
- **Persisted stream offset** - Store last received `activityId` in IndexedDB per org, so closing browser doesn't lose position.
- **Field-level tracking** - One mutation = one transaction = one field change. The `data` object uses standard entity update shape; `tx.changedField` declares which single field is tracked for conflicts (see DEC-18).
- **Merge strategy** - LWW (server wins) as default, resolution UI for fields needing user input.
- **Single-writer multi-tab** - One leader tab owns SSE connection and broadcasts to followers.

### Type safety

Having backend, frontend, CDC, config in one repo puts us in an excellent position to provide end-to-end type safety across the entire 'sync engine flow'. 

- **Prevent type assertions** - Avoid `as`, `as unknown as`, and `!` assertions. They break the compile-time safety that catches sync bugs.
- **Use generics over casts** - For dynamic entity types, use discriminated unions and generic functions. 

### Basic layer to build on top of

```
┌─────────────────────────────────────────────────────────────┐
│                     React Components                         │
│              useQuery / useSuspenseQuery                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              TanStack Query                                  │
│            - Query caching                                   │
│            - Optimistic mutations via onMutate               │
│            - Persisted to IndexedDB via Dexie                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    REST API (Hono + OpenAPI)                 │
│              (Standard request/response cycle)               │
└─────────────────────────────────────────────────────────────┘
```


## Upstream-first sync pattern

> "Pull before push" - client must be caught up before sending mutations.

See [terminology: online vs offline sync](./SYNC_ENGINE_REQUIREMENTS.md#online-vs-offline-sync) for the full explanation.

**Key points:**
- Optimistic updates are immediate and unconditional (instant UX)
- "Upstream-first" controls *when mutations are sent*, not when user sees changes
- Online: stream keeps client current, conflicts are rare (~90%+ of usage)
- Offline: mutations queue locally, conflicts resolved client-side on reconnect 

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


---

## Architecture design

### Transaction tracking schema

**Conflict reduction strategy** (three layers):

1. **Upstream-first** - Pull before push eliminates ~90% of potential conflicts (see [terminology](./SYNC_ENGINE_REQUIREMENTS.md#online-vs-offline-sync))

2. **Field-level tracking** - Conflicts scoped to individual fields. Two users editing different fields = no conflict.

3. **Merge** - For same-field conflicts: LWW (server wins) → resolution UI (user decides)

When offline, conflict likelihood grows with duration, but the rich client enables graceful resolution before pushing.

**Entity row structure** - Single transient `tx` JSONB column:

```typescript
// In product entity tables (pages, attachments, etc.)
// This is TRANSIENT - written by handler, read by CDC Worker, overwritten on next mutation
tx: jsonb('tx').$type<{
  transactionId: string;   // Current mutation's transaction ID (max 32 chars)
  sourceId: string;        // Tab/instance that made this mutation (max 64 chars)
  changedField: string | null;  // Which field this mutation changes (max 64 chars)
}>();
```

**Why "transient"?**
- These columns are only populated during mutation
- CDC Worker reads them and stores in activitiesTable
- They get overwritten on next mutation (no history on entity)
- The entity table is NOT the source of truth for 'sync state'


### Leveraging existing Change Data Capture Worker

Cella already has a robust CDC Worker system with `activitiesTable`. Extend it for transaction tracking:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend: Create page                                                │
│ const transactionId = nanoid();                                      │
│ api.createPage({ body: { data, tx: { transactionId, sourceId, changedField: null } } }) │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Backend handler                                                      │
│ const { data, tx } = ctx.req.valid('json');                          │
│ INSERT INTO pages (..., tx = { transactionId, sourceId, ... })       │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PostgreSQL logical replication → CDC Worker                         │
│ Extracts transactionId from row.sync_transaction_id                  │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ activitiesTable (Extended)                                           │
│ { type: 'page.created', entityId: 'abc', transactionId: 'xyz123',   │
│   sourceId: 'src_001', changedKeys: null }                           │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Stream Endpoint delivers message with full entity data               │
│ SSE: { action: 'create', entity: {...}, transactionId: 'xyz123' }    │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend: Reconcile pending transactions                             │
│ if (message.transactionId === pendingTx.id) { confirm(); }           │
└─────────────────────────────────────────────────────────────────────┘
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

### Extended CDC Worker context extraction

```typescript
// cdc/src/utils/extract-activity-context.ts - additions
export interface ActivityContext {
  // ... existing
  transactionId: string | null;  // NEW
  sourceId: string | null;       // NEW
  changedField: string | null;   // NEW
}

export function extractActivityContext(
  entry: TableRegistryEntry,
  row: Record<string, unknown>,
  action: 'create' | 'update' | 'delete',
): ActivityContext {
  // ... existing extraction

  // NEW
  const txData = getRowValue(row, 'tx') as { transactionId?: string; sourceId?: string; changedField?: string } | null;
  const transactionId = txData?.transactionId ?? null;
  const sourceId = txData?.sourceId ?? null;
  const changedField = txData?.changedField ?? null;

  return {
    // ... existing
    transactionId,
    sourceId,
    changedField,
  };
}
```

### Frontend mutation pattern with transactions

Extend the current `useAttachmentCreateMutation` pattern from `frontend/src/modules/attachments/query.ts`:

```typescript
// frontend/src/modules/attachments/query.ts - with sync tracking
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Attachment, CreateAttachmentData } from '~/api.gen';
import { createAttachment } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { sourceId, createTransactionId } from '~/lib/sync/source-id';
import { useTransactionManager } from '~/lib/sync/use-transaction-manager';
import { createEntityKeys } from '../entities/create-query-keys';

const keys = createEntityKeys<AttachmentFilters>('attachment');

/**
 * Custom hook to create attachments with optimistic updates and transaction tracking.
 * Extends the existing pattern with sync metadata for stream confirmation.
 */
export const useAttachmentCreateMutation = (orgIdOrSlug: string) => {
  const qc = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);
  const { trackTransaction } = useTransactionManager();

  const pendingTxRef = useRef<string | null>(null);

  return useMutation<
    Attachment[], 
    ApiError, 
    CreateAttachmentData['body'], 
    { optimisticAttachments: Attachment[]; transactionId: string }
  >({
    mutationKey: keys.create,
    
    mutationFn: async (body) => {
      // transactionId is set in onMutate before mutationFn runs
      const transactionId = pendingTxRef.current;
      if (!transactionId) throw new Error('Transaction ID not set');
      
      return createAttachment({ 
        path: { orgIdOrSlug }, 
        body: {
          data: body,
          tx: { transactionId, sourceId },
        },
      });
    },

    onMutate: async (newAttachments) => {
      const transactionId = createTransactionId();
      pendingTxRef.current = transactionId;
      
      // Cancel outgoing refetches (same as existing pattern)
      await qc.cancelQueries({ queryKey: keys.list.base });

      // Type guard: ensure attachments have required fields
      // (Transloadit provides IDs, so this validates rather than asserts)
      const optimisticAttachments = newAttachments.filter(
        (a): a is Attachment => 'id' in a && typeof a.id === 'string'
      );

      // Track pending transaction for stream confirmation
      trackTransaction(transactionId, {
        type: 'create',
        entityType: 'attachment',
        entityIds: optimisticAttachments.map(a => a.id),
        status: 'pending',
      });

      // Add to cache optimistically (same as existing pattern)
      mutateCache.create(optimisticAttachments);

      return { optimisticAttachments, transactionId };
    },

    onError: (_err, _newAttachments, context) => {
      // Remove optimistic data on error (same as existing pattern)
      if (context?.optimisticAttachments) {
        mutateCache.remove(context.optimisticAttachments);
      }
      if (context?.transactionId) {
        trackTransaction(context.transactionId, { status: 'failed' });
      }
    },

    onSuccess: (createdAttachments, _variables, context) => {
      // Replace optimistic with real data (same as existing pattern)
      if (context?.optimisticAttachments) {
        mutateCache.remove(context.optimisticAttachments);
      }
      mutateCache.create(createdAttachments);
      
      // Mark as sent - final 'confirmed' status set when stream message arrives
      if (context?.transactionId) {
        trackTransaction(context.transactionId, { status: 'sent' });
      }
    },

    onSettled: () => {
      // Always refetch to ensure cache is in sync (same as existing pattern)
      qc.invalidateQueries({ queryKey: keys.list.base });
    },
  });
};
```

**Key differences from base pattern:**
- Generates `transactionId` in `onMutate` 
- Includes `{ data, tx }` wrapper in API body
- Tracks transaction lifecycle: `pending` → `sent` → `confirmed` (via live stream)
- Existing optimistic update patterns (`mutateCache.create/remove`) remain unchanged

### Realtime sync via live stream

**Architecture: LIST for initial load, live stream for deltas**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Initial Load:              2. Subscribe to Updates:                  │
│     React Query                  Live Stream                             │
│     ┌──────────────┐               ┌──────────────────┐                 │
│     │ useQuery(    │               │ stream.subscribe │                 │
│     │   pagesQuery │               │   offset: 'now'  │◄─── Start now   │
│     │ )            │               │                  │     (skip hist) │
│     └──────┬───────┘               └────────┬─────────┘                 │
│            │                                │                            │
│            ▼                                ▼                            │
│     GET /pages?q=X&sort=Y          GET /{org}/live?sse                  │
│     (full query power)              (just deltas, no filtering)         │
│            │                                │                            │
│            ▼                                ▼                            │
│     ┌──────────────────────────────────────────────────┐                │
│     │              React Query Cache                    │                │
│     │  pagesData = [...pages from LIST]                 │                │
│     │                  ↑                                │                │
│     │  stream.onMessage → update/insert/remove in cache │                │
│     └──────────────────────────────────────────────────┘                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key insight: Separation of concerns**

| Concern | LIST endpoint | Stream endpoint |
|---------|---------------|-----------------|
| **Initial state** | ✅ Full query (filter, sort, paginate) | ❌ Not its job |
| **Real-time deltas** | ❌ Polling only | ✅ Push changes |
| **Authorization** | ✅ Org membership | ✅ Same check |
| **Entity fetching** | ✅ Query + transform | ✅ Reuse same logic |

**Stream architecture: CDC Worker → NOTIFY → API → SSE fan-out**

Instead of each SSE connection polling the database, leverage the CDC worker that already processes all changes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Push-based stream architecture                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PostgreSQL                                                                  │
│  ┌─────────────────────┐                                                    │
│  │ Logical Replication │                                                    │
│  │ (entity changes)    │                                                    │
│  └──────────┬──────────┘                                                    │
│             │                                                                │
│             ▼                                                                │
│  ┌─────────────────────┐     ┌─────────────────────┐                        │
│  │    CDC Worker       │────>│  activitiesTable    │                        │
│  │                     │     │  (INSERT)           │                        │
│  │  After INSERT:      │     └─────────────────────┘                        │
│  │  pg_notify(         │                                                    │
│  │   'cella_activities'│                                                    │
│  │    {orgId, entity}  │                                                    │
│  │  )                  │                                                    │
│  └──────────┬──────────┘                                                    │
│             │                                                                │
│             │ NOTIFY 'cella_activities'                                      │
│             ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    API Server (Hono)                             │        │
│  │                                                                  │        │
│  │  ┌─────────────────────┐                                        │        │
│  │  │ ActivityBus (single │◄─── One LISTEN for ALL orgs            │        │
│  │  │ LISTEN connection)  │     (Activitybus also used              │        │
│  │  └──────────┬──────────┘      for API internal emits)           │        │
│  │             │ Emits ActivityEvent                                │        │
│  │             ▼                                                    │        │
│  │  ┌─────────────────────┐                                        │        │
│  │  │ StreamSubscriber    │  Map<orgId, Set<LiveStreamConnection>> │        │
│  │  │ Manager             │                                        │        │
│  │  │ org-123: [stream1,  │  Fan-out: O(1) lookup + O(subscribers) │        │
│  │  │           stream2]  │  broadcast per org                     │        │
│  │  │ org-456: [stream3]  │                                        │        │
│  │  └──────────┬──────────┘                                        │        │
│  │             │                                                    │        │
│  │             ▼                                                    │        │
│  │  ┌─────────────────────────────────────────────────────┐        │        │
│  │  │ SSE Stream 1 │ SSE Stream 2 │ SSE Stream 3 │ ...    │        │        │
│  │  │ (org-123)    │ (org-123)    │ (org-456)    │        │        │        │
│  │  └──────────────┴──────────────┴──────────────┴────────┘        │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why this is better:**
- **One DB connection** for LISTEN via ActivityBus vs N polling queries
- **Instant delivery** - no 500ms poll delay
- **Scales with orgs** not with subscribers, multi-tenant security through existing middleware
- **CDC Worker already has the data** - no round-trip through database

**Stream filtering**: Client filters and dedupes. Stream delivers all org changes to simplify server implementation and allow client-side flexibility for filtering by entity type or other criteria.

**CDC worker: NOTIFY after activity insert**

```typescript
// cdc/src/handlers/activity-notify.ts
import { sql } from 'drizzle-orm';

interface NotifyPayload {
  orgId: string;
  activityId: number;
  entityType: EntityType;
  entityId: string;
  action: ActivityAction;
  transactionId: string | null;
  sourceId: string | null;
  changedField: string | null;
  entity: Record<string, unknown> | null;  // Full entity data from replication
}

/**
 * CDC Worker already has the entity data from logical replication.
 * Include it in the NOTIFY payload to avoid extra DB fetch by API server.
 */
async function notifyActivity(
  activity: ActivityInsert,
  activityId: number,
  entityData: Record<string, unknown> | null,  // From replication row
): Promise<void> {
  const payload: NotifyPayload = {
    orgId: activity.organizationId,
    activityId,
    entityType: activity.entityType,
    entityId: activity.entityId,
    action: activity.action,
    transactionId: activity.sync?.transactionId ?? null,
    sourceId: activity.sync?.sourceId ?? null,
    changedField: activity.sync?.changedField ?? null,
    entity: entityData,  // Include full entity - no extra fetch needed!
  };
  
  // PostgreSQL NOTIFY has 8KB limit - handle large entities gracefully
  const payloadStr = JSON.stringify(payload);
  if (payloadStr.length > 7500) {
    // For oversized payloads, send without entity data
    // API server will fetch on-demand (rare case)
    payload.entity = null;
  }
  
  // Use same channel as existing trigger (cella_activities) - see DEC-11
  await db.execute(sql`SELECT pg_notify('cella_activities', ${JSON.stringify(payload)})`);
}

// Usage in CDC Worker insert handler:
async function handleInsert(row: Record<string, unknown>, activity: ActivityInsert) {
  const [inserted] = await db.insert(activitiesTable).values(activity).returning();
  
  // Pass entity data directly - CDC Worker already has it from replication!
  await notifyActivity(activity, inserted.id, row);
}
```

**Why CDC Worker can include entity data:**
- Logical replication delivers full row data to CDC Worker
- No extra database query needed
- Reduces latency (one less round-trip)
- 8KB NOTIFY limit handled gracefully (fallback for large entities)

**Rejected alternative: PostgreSQL trigger on activities table**

> ⚠️ This approach was considered but rejected. See DEC-11 in [SYNC_ENGINE_REQUIREMENTS.md](./SYNC_ENGINE_REQUIREMENTS.md).
>
> A database trigger on the activities table cannot include entity data because the trigger only has access to the activities row, not the original entity. The CDC Worker has access to the entity from replication and can include it directly in the NOTIFY payload.

```sql
-- REJECTED: This trigger cannot include entity data!
-- Kept here for documentation purposes only.
-- NOTE: Actual existing trigger in 0002_activity_notify_trigger.sql uses 'cella_activities' channel
CREATE OR REPLACE FUNCTION notify_activity() RETURNS trigger AS $$
BEGIN
  -- BUG: No entity data available here - trigger only sees activities row
  PERFORM pg_notify('cella_activities', json_build_object(
    'orgId', NEW.organization_id,
    'activityId', NEW.id,
    'entityType', NEW.entity_type,
    'entityId', NEW.entity_id,
    'action', NEW.action
    -- NOTE: Cannot include 'entity' - data not available in trigger context
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_notify
  AFTER INSERT ON activities
  FOR EACH ROW EXECUTE FUNCTION notify_activity();
```

**API server: Stream subscriber manager**

```typescript
// backend/src/lib/stream/stream-subscribers.ts
// NOTE: This subscribes to ActivityBus, not directly to LISTEN
import type { Pool, PoolClient } from 'pg';
import type { ProductEntityType } from 'config';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { isPermissionAllowed } from '#/permissions';

interface Subscriber {
  stream: LiveStreamConnection;
  entityTypes: ProductEntityType[] | null;  // null = all product entity types
  cursor: number;
  userId: string;
  userSystemRole: 'admin' | 'user';          // From getContextUserSystemRole()
  memberships: MembershipBaseModel[];        // User's memberships for permission checks
}

interface ActivityNotification {
  orgId: string;
  activityId: number;
  entityType: ProductEntityType;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  transactionId: string | null;
  sourceId: string | null;
  changedField: string | null;
  entity: Record<string, unknown> | null;
}

class StreamSubscriberManager {
  private subscribers = new Map<string, Set<Subscriber>>();
  private unsubscribeFromActivityBus: (() => void) | null = null;
  
  async initialize(activityBus: ActivityBus): Promise<void> {
    // Subscribe to ActivityBus instead of maintaining own LISTEN connection
    // ActivityBus already handles the LISTEN for 'cella_activities' channel
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
    
    // Entity data already included from CDC Worker - no extra fetch needed!
    // Only fetch if entity was omitted (oversized payload fallback)
    let enriched = payload.entity 
      ? payload 
      : await enrichActivityWithEntity(payload.activityId);
    if (!enriched) return;
    
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
    
    // Build entity object for permission check (matches SubjectForPermission shape)
    const entity = {
      entityType: payload.entityType,
      id: payload.entityId,
      organizationId: payload.orgId,
      // Add other context IDs if entity has them (from payload.entity)
      ...(payload.entity && 'projectId' in payload.entity 
        ? { projectId: payload.entity.projectId as string } 
        : {}),
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
// backend/src/modules/streams/stream-handlers.ts
import { OpenAPIHono } from '@hono/zod-openapi';
import type { ProductEntityType } from 'config';
import { streamSSE } from 'hono/streaming';
import { 
  type Env, 
  getContextMemberships, 
  getContextOrganization, 
  getContextUser,
  getContextUserSystemRole,
} from '#/lib/context';
import { streamSubscriberManager } from '#/lib/stream/stream-subscribers';
import { getLatestActivityId, fetchAndEnrichActivities } from '#/lib/stream/activity-fetcher';
import streamRoutes from '#/modules/streams/stream-routes';

const app = new OpenAPIHono<Env>();

const streamHandlers = app
  /**
   * SSE stream for realtime entity updates.
   * Authorization via org guard middleware (same as REST endpoints).
   */
  .openapi(streamRoutes.subscribeToStream, async (ctx) => {
    const { offset, live, entityTypes: entityTypesParam } = ctx.req.valid('query');
    
    const entityTypes = entityTypesParam?.split(',').filter(Boolean) as ProductEntityType[] | null;
    
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
import { and, eq, gt, inArray } from 'drizzle-orm';
import type { ProductEntityType } from 'config';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { isPermissionAllowed } from '#/permissions';

interface FetchActivitiesParams {
  orgId: string;
  cursor: number;
  entityTypes: ProductEntityType[] | null;
  memberships: MembershipBaseModel[];
  userSystemRole: 'admin' | 'user';
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
  // This differs from live updates where CDC Worker includes entity data in NOTIFY payload.
  // See DEC-11, DEC-15, and STREAM-030 in SYNC_ENGINE_REQUIREMENTS.md for rationale.
  
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

**Performance characteristics:**

| Metric | Polling (old) | NOTIFY + fan-out (new) |
|--------|---------------|------------------------|
| DB queries/sec (100 subscribers) | 200 (100 × 2/sec) | ~0 (only catch-up, large entity fallback) |
| Entity fetches per change | N/A | 0 (CDC Worker includes data) or 1 (oversized fallback) |
| Latency | 0-500ms (poll interval) | <10ms (instant push) |
| Scales with | Subscribers × poll rate | Changes × subscribers per org |
| DB connections | 1 per query | 1 LISTEN (persistent) |

**Key optimization**: CDC Worker includes entity data in NOTIFY payload (it already has it from replication), so API server typically does zero DB queries for live updates. Only catch-up queries (which JOIN activities with entity tables) and rare oversized entity fallbacks require fetches.

> **Entity data paths** (see DEC-15 in SYNC_ENGINE_REQUIREMENTS.md):
> - **Live updates**: Entity data from CDC Worker NOTIFY payload → zero extra queries
> - **Catch-up**: JOIN activities with entity tables → one query with JOIN
> - **Oversized fallback**: Fetch entity by ID → one extra query per message (rare)

**Security & authorization considerations:**

The push-based architecture shifts the authorization boundary:

```
BEFORE (polling):  User → API (auth) → DB query → Response
AFTER (push):      CDC Worker (no auth) → NOTIFY → API → Fan-out (auth here!)
```

| Concern | Risk level | Mitigation |
|---------|------------|------------|
| **NOTIFY payload visibility** | Medium | CDC Worker runs on private network; any DB LISTEN sees all payloads |
| **Org-level auth** | ✅ Handled | Org guard middleware validates membership before stream registration |
| **Entity-level ACLs** | ✅ Handled | `isPermissionAllowed()` called in `broadcast()` using subscriber's memberships |
| **System admin bypass** | ✅ Handled | `userSystemRole === 'admin'` check mirrors REST handler pattern |
| **CDC Worker has no user context** | ✅ By design | CDC Worker is data-plane; API server is auth-plane; separation is correct |
| **Data in transit** | Low | Internal service communication; use TLS if CDC/API on separate hosts |

**Key security principles:**
1. **CDC Worker is trusted** - It runs in your infrastructure, reads from replication slot
2. **NOTIFY channel is internal** - Only API server(s) should LISTEN (via ActivityBus)
3. **Authorization happens at fan-out** - `StreamSubscriberManager.broadcast()` uses `isPermissionAllowed()` 
4. **Reuses existing permission logic** - Same `accessPolicies` config from `permissions-config.ts`

**How it aligns with Cella's permission system:**

```typescript
// permissions-config.ts defines what roles can do what
export const accessPolicies = configureAccessPolicies(hierarchy, appConfig.entityTypes, ({ subject, contexts }) => {
  switch (subject.name) {
    case 'attachment':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1, search: 1 });
      contexts.organization.member({ create: 1, read: 1, update: 0, delete: 1, search: 1 });
      break;
    // ...
  }
});

// Stream uses same isPermissionAllowed() as REST handlers:
// - getValidProductEntity() uses it for single entity access
// - splitByAllowance() uses it for batch filtering  
// - StreamSubscriberManager.broadcast() uses it for stream filtering
```

**Stream message payload** (uses tx wrapper):

```typescript
// Matches createStreamMessageSchema output
interface StreamMessage<T = Entity> {
  data: T | null;                  // Full entity data (null if deleted)
  tx: {
    transactionId: string | null; // For transaction confirmation
    sourceId: string | null;      // "Is this mine?" check
    action: 'create' | 'update' | 'delete';
    activityId: number;           // Stream offset for resumption
  };
  // Additional fields (not in tx wrapper, but useful)
  entityType: string;              // 'page' | 'attachment'
  entityId: string;
  changedKeys: string[] | null;    // Which fields changed (for updates)
  createdAt: string;               // Activity timestamp
}
```

**Frontend: Stream + React Query integration**

```typescript
// frontend/src/lib/sync/use-entity-stream.ts
export function useEntityStream(
  orgIdOrSlug: string,
  options?: {
    entityTypes?: string[];
    onMessage?: (message: StreamMessage) => void;
  }
) {
  const queryClient = useQueryClient();
  const isOnline = useOnlineManager((s) => s.isOnline);
  
  // Persisted offset - survives tab closure (see OFFLINE-0)
  const offsetRef = useRef<string | null>(null);
  const debouncedSaveOffset = useDebouncedCallback(
    (offset: string) => offsetStore.set(orgIdOrSlug, offset),
    5000 // Max 1 write per 5 seconds
  );
  
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
        
        // Update React Query cache
        applyMessageToCache(queryClient, message);
        
        options?.onMessage?.(message);
      });
      
      return () => eventSource.close();
    };
    
    const cleanup = initOffset();
    return () => { cleanup.then(fn => fn?.()); };
  }, [orgIdOrSlug, isOnline]);
}

/**
 * Apply stream message to React Query cache.
 */
function applyMessageToCache(queryClient: QueryClient, message: StreamMessage) {
  const { action, entityType, entityId } = message;
  const entity = message.data;
  
  // Update detail cache
  if (action === 'delete') {
    queryClient.removeQueries({ queryKey: [entityType, entityId] });
  } else if (entity) {
    queryClient.setQueryData([entityType, entityId], entity);
  }
  
  // Update list caches
  queryClient.setQueriesData(
    { queryKey: [entityType, 'list'] },
    (oldData: InfiniteData<Entity[]> | undefined) => {
      if (!oldData) return oldData;
      return updateListCache(oldData, action, entityId, entity);
    }
  );
}
```

**Sync confirmation via stream messages**:

```typescript
// Transaction is confirmed when it appears in the stream
eventSource.addEventListener('change', (e) => {
  const message: StreamMessage = JSON.parse(e.data);
  
  if (message.tx.transactionId && pendingTransactions.has(message.tx.transactionId)) {
    trackTransaction(message.tx.transactionId, { status: 'confirmed' });
    pendingTransactions.delete(message.tx.transactionId);
  }
});
```

### Field-level conflict detection

Conflict detection queries activitiesTable to check if a specific field was modified since the client last saw it:

```typescript
// backend/src/lib/sync/conflict-detection.ts
import { db } from '~/db';
import { activitiesTable } from '~/db/schema';
import { and, eq, desc, isNotNull } from 'drizzle-orm';

interface ConflictCheckParams {
  entityType: string;
  entityId: string;
  changedField: string;
  expectedTransactionId: string | null;
}

/**
 * Check if a field has been modified since the client last saw it.
 * Returns conflict info if the field's last transaction doesn't match expected.
 */
export async function checkFieldConflict({
  entityType,
  entityId,
  changedField,
  expectedTransactionId,
}: ConflictCheckParams): Promise<{ hasConflict: boolean; serverTransactionId: string | null }> {
  // Find the most recent transaction that touched this field
  const [latest] = await db
    .select({ sync: activitiesTable.sync })
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.entityType, entityType),
        eq(activitiesTable.entityId, entityId),
        sql`${activitiesTable.sync}->>'changedField' = ${changedField}`,
        sql`${activitiesTable.sync}->>'transactionId' IS NOT NULL`
      )
    )
    .orderBy(desc(activitiesTable.id))
    .limit(1);

  const serverTransactionId = latest?.sync?.transactionId ?? null;

  // No conflict if:
  // 1. Field has never been changed (serverTransactionId is null)
  // 2. Field's last change matches what client expected
  const hasConflict = 
    serverTransactionId !== null && 
    serverTransactionId !== expectedTransactionId;

  return { hasConflict, serverTransactionId };
}
```

**Frontend: One mutation per field change**:

```typescript
// Frontend: Include expected transaction for specific field
async function updatePageTitle(pageId: string, title: string) {
  const expectedTransactionId = getExpectedTransactionId(pageId, 'title');
  
  return api.updatePage({
    body: {
      data: { title },
      sync: {
        transactionId: createTransactionId(),
        sourceId,
        changedField: 'title',
        expectedTransactionId,
      },
    },
    params: { pageId },
  });
}
```

**Backend: Field-level conflict check + transient `tx` column**:

```typescript
// Backend: Verify no concurrent modifications to this field
app.openapi(routes.updatePage, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const { data, tx } = ctx.req.valid('json');
  
  // 1. Conflict detection (if expectedTransactionId provided)
  if (tx?.expectedTransactionId && tx?.changedField) {
    const { hasConflict, serverTransactionId } = await checkFieldConflict({
      entityType: 'page',
      entityId: id,
      changedField: tx.changedField,
      expectedTransactionId: tx.expectedTransactionId,
    });
    
    if (hasConflict) {
      return ctx.json({
        error: 'conflict',
        code: 'FIELD_CONFLICT',
        field: tx.changedField,
        expectedTransactionId: tx.expectedTransactionId,
        serverTransactionId,
        message: `Field "${tx.changedField}" was modified by another user`,
      }, 409);
    }
  }
  
  // 2. Apply update with transient tx JSONB (CDC Worker will read this)
  const [page] = await db.update(pagesTable)
    .set({
      ...data,
      // Transient tx column (written here, read by CDC Worker)
      tx: tx ? { 
        transactionId: tx.transactionId, 
        sourceId: tx.sourceId, 
        changedField: tx.changedField 
      } : null,
      modifiedAt: new Date(),
      modifiedBy: ctx.get('user').id,
    })
    .where(eq(pagesTable.id, id))
    .returning();
  
  return ctx.json({ data: page, tx: { transactionId: tx?.transactionId ?? null } });
});
```

**Key insight**: Two users editing different fields = no conflict. Only same-field concurrent edits trigger 409.

### Idempotency via activitiesTable

```typescript
// backend/src/lib/idempotency.ts

/**
 * Check if a transaction has already been processed.
 * Uses the CDC Worker-populated activitiesTable as the source of truth.
 */
export async function isTransactionProcessed(
  db: DbClient,
  transactionId: string,
): Promise<boolean> {
  const existing = await db.select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(eq(activitiesTable.transactionId, transactionId))
    .limit(1);
  
  return existing.length > 0;
}

/**
 * Get the entity created/modified by a transaction.
 */
export async function getEntityByTransaction(
  db: DbClient,
  transactionId: string,
): Promise<{ entityType: string; entityId: string } | null> {
  const [activity] = await db.select({
    entityType: activitiesTable.entityType,
    entityId: activitiesTable.entityId,
  })
    .from(activitiesTable)
    .where(eq(activitiesTable.transactionId, transactionId))
    .limit(1);
  
  return activity ?? null;
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

## Existing infrastructure to upgrade

The sync engine builds on existing Cella infrastructure. These components need upgrades rather than replacement.

| Component | Current Location | Current Purpose | Upgrade Needed |
|-----------|------------------|-----------------|----------------|
| **ActivityBus** | `backend/src/lib/event-bus.ts` → `activity-bus.ts` | LISTENs to `cella_activities`, emits typed events | Rename file; extend `ActivityEvent` with optional `entity` field |
| **Database Trigger** | `backend/drizzle/0002_activity_notify_trigger.sql` | Sends `pg_notify` on activities INSERT | Keep as-is (fallback for basic mode) |
| **CDC Worker** | `cdc/src/worker.ts`, `cdc/src/handlers/*` | Logical replication → activities table | Add NOTIFY call with entity data on same channel |
| **SSE Endpoint** | `backend/src/modules/me/me-handlers.ts` | Generic user SSE at `/me/sse` | Reference for new org-scoped stream endpoint |

### Out-of-scope: Existing SSE code

> ⚠️ **Do not modify** the existing SSE infrastructure during sync engine work. Consolidation is future work.

The following code is **out-of-scope** and should be ignored:

| Component | Location | Why Out-of-Scope |
|-----------|----------|------------------|
| `/me/sse` endpoint | `backend/src/modules/me/me-handlers.ts` | User-scoped, not org-scoped |
| `sendSSE`, `sendSSEByUserIds` | `backend/src/lib/sse.ts` | Uses `streams` Map keyed by userId |
| `useSSE`, `useTypedSSE` | `frontend/src/modules/common/sse/` | Tied to user SSE connection |
| `SSEContext`, `SSEProvider` | `frontend/src/modules/common/sse/` | Provides user EventSource |
| `SSEEventsMap` events | `frontend/src/modules/common/sse/index.tsx` | `membership_*`, `entity_*` for context entities |

**The sync engine creates a separate org-scoped stream** (`/organizations/:orgId/stream`) that:
- Uses ActivityBus (which LISTENs to `cella_activities`)
- Is keyed by orgId, not userId
- Includes transaction tracking and entity data
- Targets product entities, not context entities

**Future consolidation work** (not in this plan):
- Migrate context entity SSE to use ActivityBus
- Unify `useSSE` and live stream hooks
- Single SSE connection strategy

### Data flow (current vs. upgraded)

**Current flow (trigger-only):**
```
Entity mutation → CDC Worker → activitiesTable INSERT → Trigger → pg_notify('cella_activities', activity) → ActivityBus → handlers
```

**Upgraded flow (CDC Worker + entity data):**
```
Entity mutation → CDC Worker → activitiesTable INSERT → Trigger (activity-only, fallback)
                    ↓
                 CDC Worker also calls → pg_notify('cella_activities', { activity, entity }) → ActivityBus → live stream
```

Both payloads arrive on the same channel. ActivityBus handles both gracefully - existing handlers continue to work with activity-only payloads, while live stream uses entity data when present.

---

## Implementation todos list

The tasks below are organized by component. Use this dependency graph to determine implementation order:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Implementation Dependencies                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Schema & Migrations ─────┬──────────────────────────────────────────────►  │
│                            │                                                 │
│   Infrastructure: ActivityBus─(can be done in parallel)─────────────────►    │
│                            │                                                 │
│                            ▼                                                 │
│   CDC Worker ──────────────┬──(depends on both Schema + ActivityBus)─────►   │
│                            │                                                 │
│                            ▼                                                 │
│   Stream Endpoint ─────────┼─────────────────────────────────────────────►   │
│                            │                                                 │
│   ─────────────────────────┼───────────────────────────────────────────────  │
│                            │                                                 │
│   Sync Schemas ────────────┼─────────────────────────────────────────────►   │
│                            │                                                 │
│                            ▼                                                 │
│   Backend Handlers ────────┼─────────────────────────────────────────────►   │
│                            │                                                 │
│   ─────────────────────────┼───────────────────────────────────────────────  │
│                            │                                                 │
│   Frontend: Sync Primitives┼─────────────────────────────────────────────►   │
│                            │                                                 │
│                            ▼                                                 │
│   Frontend: Mutation Hooks─┼─────────────────────────────────────────────►   │
│                            │                                                 │
│                            ▼                                                 │
│   Frontend: Stream Hook ───┼─────────────────────────────────────────────►   │
│                            │                                                 │
│                            ▼                                                 │
│   Offline & Conflicts ─────┼─────────────────────────────────────────────►   │
│                            │                                                 │
│                            ▼                                                 │
│   Multi-Tab Coordination ──┴─────────────────────────────────────────────►   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Schema & migrations

- [ ] **SCHEMA-1** Add transient `tx` column to product entity schemas
  - Files: `backend/src/db/schema/pages.ts`, `attachments.ts`
  - Column: `tx` JSONB containing `{ transactionId, sourceId, changedField }`
  - Add expression index if needed: `CREATE INDEX ON pages ((tx->>'transactionId'))`
  - Create migration

- [ ] **SCHEMA-2** Extend `activitiesTable` with `tx` JSONB column
  - File: `backend/src/db/schema/activities.ts`
  - Add: `tx` JSONB column (null for non-synced entities)
  - Add expression indexes: `(tx->>'transactionId')`, composite for field conflict queries
  - Keep existing `changedKeys` column unchanged (different purpose)

---

### Infrastructure: ActivityBus upgrade

Rename and upgrade the existing EventBus to ActivityBus to handle entity data from CDC Worker. See DEC-20.

- [ ] **INFRA-AB-1** Rename EventBus to ActivityBus
  - Rename file: `backend/src/lib/event-bus.ts` → `activity-bus.ts`
  - Update all imports across codebase
  - Extend `ActivityEvent` interface with `entity?: Record<string, unknown> | null`
  - Existing fields remain unchanged for backward compatibility

- [ ] **INFRA-AB-2** Update ActivityBus payload parsing
  - File: `backend/src/lib/activity-bus.ts`
  - Parse `entity` field from NOTIFY payload when present
  - Gracefully handle payloads without `entity` (trigger-only)
  - No behavior change for existing handlers

- [ ] **INFRA-AB-3** Add tests for dual payload handling
  - Location: `backend/tests/activity-bus.test.ts`
  - Test: Trigger payload (activity-only) emits event with `entity: undefined`
  - Test: CDC Worker payload (activity + entity) emits event with `entity: {...}`
  - Test: Existing handlers continue to work

- [ ] **INFRA-AB-4** Document ActivityBus upgrade
  - Location: `backend/src/lib/activity-bus.ts` (JSDoc comments)
  - Explain dual-source architecture (trigger vs. CDC Worker)
  - Reference DEC-11 and DEC-20

---

### CDC Worker

- [ ] **CDC-1** Update CDC Worker context extraction for field-level
  - File: `cdc/src/utils/extract-activity-context.ts`
  - Read `tx` JSONB from replicated row (requires SCHEMA-1 migration)
  - Extract `transactionId` from `tx.transactionId`
  - Extract `sourceId` from `tx.sourceId`
  - Extract `changedField` from `tx.changedField`

- [ ] **CDC-2** Update CDC Worker handlers to include field-level info
  - Files: `cdc/src/handlers/insert.ts`, `update.ts`, `delete.ts`
  - Include `transactionId`, `sourceId`, `changedField` in activity record
  - Set `changedField` to `null` or `'*'` for insert/delete
  - **Depends on**: SCHEMA-2 migration (adds `tx` JSONB column to activitiesTable)

- [ ] **CDC-3** Add NOTIFY hook to CDC Worker (for live updates)
  - Location: `cdc/src/handlers/activity-notify.ts`
  - Call `pg_notify('cella_activities', payload)` after activity INSERT (see DEC-11)
  - **MUST use same channel as trigger** (`cella_activities`) - see CDC-021
  - Include entity data in payload from replication row (see CDC-019)
  - Handle 8KB limit: set `entity: null` for oversized payloads (see CDC-020)
  - No migration needed - NOTIFY channel created automatically

---

### Stream endpoint (backend)

- [ ] **STREAM-1** Create activity fetcher utility (for catch-up)
  - Location: `backend/src/lib/stream/activity-fetcher.ts`
  - `fetchActivitiesWithEntityData({ orgId, cursor, entityTypes })` - JOINs activities with entity tables (see DEC-15, STREAM-030)
  - Uses `isPermissionAllowed()` for entity-level filtering (same pattern as `splitByAllowance`)
  - `getLatestActivityId(orgId)` - for `offset=now`
  - `fetchEntityById(entityType, entityId)` - fallback for activity notifications without entity data

- [ ] **STREAM-2** Create stream subscriber manager
  - Location: `backend/src/lib/stream/stream-subscribers.ts`
  - Subscribes to unified ActivityBus for `cella_activities` notifications (see DEC-20)
  - Routes notifications to correct org subscribers based on `notification.organizationId`
  - Subscriber includes `memberships: MembershipBaseModel[]` and `userSystemRole`
  - `checkEntityAccess()` uses `isPermissionAllowed()` - same logic as REST handlers
  - Entity data comes from `notification.entity`; fallback fetch if null (see STREAM-040 to STREAM-043)

- [ ] **STREAM-3** Create stream endpoint handler
  - Location: `backend/src/modules/streams/stream-handlers.ts`
  - Use Cella context helpers: `getContextUser`, `getContextOrganization`, `getContextMemberships`
  - Apply org guard middleware (same as REST endpoints)
  - Catch-up: fetch activities with entity data via JOIN (see STREAM-030 to STREAM-035)
  - Live: register with stream subscriber manager for push updates

- [ ] **STREAM-4** Add stream routes + OpenAPI schema
  - Location: `backend/src/modules/streams/stream-routes.ts`
  - Define route with `@hono/zod-openapi` (consistent with other modules)
  - Mount in `backend/src/routes.ts` with org guard
  - Initialize stream subscriber manager on server start (subscribes to ActivityBus)

---

### Transaction schemas (backend)

- [ ] **TX-SCHEMA-1** Create tx wrapper schemas
  - Location: `backend/src/modules/sync/schema.ts`
  - `txRequestSchema` with `transactionId`, `sourceId`, `changedField`, `expectedTransactionId`
  - `txResponseSchema`, `txStreamMessageSchema` with `changedField`
  - Factory functions for wrapping entity schemas

---

### Backend handlers

- [ ] **HANDLER-1** Create field-level conflict detection utility
  - Location: `backend/src/lib/sync/conflict-detection.ts`
  - `checkFieldConflict({ entityType, entityId, changedField, expectedTransactionId })`
  - Query activitiesTable for field's latest transaction

- [ ] **HANDLER-2** Create idempotency utilities
  - Location: `backend/src/lib/idempotency.ts`
  - `isTransactionProcessed()` - check activitiesTable
  - `getEntityByTransaction()` - lookup entity by transaction

- [ ] **HANDLER-3** Upgrade existing page handlers for sync support
  - File: `backend/src/modules/pages/pages-handlers.ts`
  - **Upgrade existing endpoints** (createPage, updatePage, deletePage) - do NOT create separate synced endpoints
  - Request schema requires `{ data, tx }` wrapper - `tx` is mandatory (DEC-19)
  - Extract `{ data, tx }` from validated body (no detection logic needed)
  - Check field conflict if `expectedTransactionId` provided
  - Set transient `tx` JSONB: `{ transactionId, sourceId, changedField }`
  - Reference: DEC-19, API-001, API-001a
  - Return `{ data, tx }` wrapper in response

  ```typescript
  // Example: Product entity handler - tx wrapper is REQUIRED
  app.openapi(routes.createPageRoute, async (ctx) => {
    // Schema guarantees { data, tx } shape - no detection needed
    const { data, tx } = ctx.req.valid('json');
    
    const page = await insertPage({
      ...data,
      tx: {
        transactionId: tx.transactionId,
        sourceId: tx.sourceId,
        changedField: tx.changedField,
      },
    });
    
    return ctx.json({ data: page, tx: { transactionId: tx.transactionId } }, 201);
  });
  ```

- [ ] **HANDLER-4** Apply same pattern to attachments handlers

---

### Frontend: Sync primitives

- [ ] **FE-SYNC-1** Create sync primitives module
  - Location: `frontend/src/lib/sync/hlc.ts`
  - Export `sourceId` const (generated with `crypto.randomUUID()` on module load)
  - Create HLC instance with `nodeId = sourceId`
  - Export `createTransactionId()` using HLC (format: `{wallTime}.{logical}.{nodeId}`)
  - Export `parseTransactionId()` and `compareTransactionIds()` utilities
  - Consider using `hlc-ts` library or implement HLC manually

- [ ] **FE-SYNC-2** Create transaction manager hook
  - Location: `frontend/src/lib/sync/use-transaction-manager.ts`
  - Track pending transactions in memory + IndexedDB
  - States: `pending` → `sent` → `confirmed` | `failed`

- [ ] **FE-SYNC-3** Create field transaction tracking
  - Location: `frontend/src/lib/sync/field-transactions.ts`
  - Map of `entityId:field → transactionId` (what's the last tx I saw for this field?)
  - `getExpectedTransactionId(entityId, field)` - for conflict detection
  - `setFieldTransactionId(entityId, field, transactionId)` - updated from stream messages
  - `updateFieldTransactionsFromEntity(entityId, fieldTxMap)` - batch update

- [ ] **FE-SYNC-4** Create unified network status service (see DEC-16, NET-001 to NET-010)
  - Location: `frontend/src/lib/sync/network-status.ts` (Zustand store)
  - Replace `useOnlineManager` hook from `frontend/src/hooks/use-online-manager.tsx`
  - Enhance existing `use-network-status.ts` hook to use the store
  - **Basic detection**: `navigator.onLine` + browser events
  - **Verified connectivity**: Periodic health check to `/api/health`
  - **Latency**: `'high'` or `'low'` based on health check response time (threshold ~500ms)
  - **Future**: Auto-enable offline mode for high latency connections
  - Deprecate `useOnlineManager`, migrate all usages to new store
  - Update TanStack Query's `onlineManager.setEventListener()` to use this store

---

### Frontend: Mutation hooks

- [ ] **FE-MUT-1** Update `usePageCreateMutation`
  - File: `frontend/src/modules/pages/query.ts`
  - Generate transaction ID in `onMutate`
  - Use `{ data, tx }` wrapper with `changedField: null` (create = all fields)
  - Track with transaction manager

- [ ] **FE-MUT-2** Update `usePageUpdateMutation` for field-level
  - One mutation = one field change (see DEC-18 for data structure)
  - `data` object uses standard entity update shape: `{ name: 'New title' }`
  - `tx.changedField` declares the target: `changedField: 'name'`
  - Include `expectedTransactionId` from field transaction tracking
  - Example: `{ data: { name: 'New title' }, tx: { transactionId, sourceId, changedField: 'name', expectedTransactionId } }`

- [ ] **FE-MUT-3** Update `usePageDeleteMutation`
  - Use `changedField: null` for deletes

- [ ] **FE-MUT-4** Apply same pattern to attachments module

---

### Frontend: Stream hook

- [ ] **FE-STREAM-1** Create frontend stream hook
  - Location: `frontend/src/lib/sync/use-entity-stream.ts`
  - EventSource subscription with offset tracking
  - Update field transaction tracking from stream messages
  - Apply messages to React Query cache

- [ ] **FE-STREAM-2** Create cache update utilities
  - Location: `frontend/src/lib/sync/apply-message-to-cache.ts`
  - Handle create/update/delete for detail and list queries
  - Support infinite query data structure (same pattern as existing mutations)

- [ ] **FE-STREAM-3** Add transaction status UI indicators
  - Hook: `useTransactionStatus(transactionId)`
  - Visual states: pending spinner, syncing, confirmed checkmark, failed error
  - Confirm via stream message matching

---

### Offline & conflict resolution

- [ ] **OFFLINE-0** Persist stream offset to IndexedDB
  - Location: `frontend/src/lib/sync/offset-store.ts`
  - Store last received `activityId` per org
  - Read on SSE connect (fallback to `'now'` if not found)
  - Write on each stream message (debounced, max 1 write per 5s)
  - Use same IndexedDB database as mutation outbox
  - **Critical for offline**: Without this, closing tab loses position and user misses all changes

- [ ] **OFFLINE-1** Add field-level transaction tracking to offline executor
  - File: `frontend/src/modules/attachments/offline/executor.ts`
  - Include `transactionId`, `changedField` in persisted mutations
  - Same transaction ID across retries (idempotency)

- [ ] **OFFLINE-2** Implement per-field mutation outbox
  - Location: `frontend/src/lib/sync/mutation-outbox.ts`
  - Queue mutations per field (not per entity)
  - **Squash same-field changes** (keep only latest value for each field)
  - Different fields queue separately
  - Include `changedField` and `expectedTransactionId` in each queued item

- [ ] **OFFLINE-3** Implement upstream-first sync flow
  - On reconnect: pull latest from stream BEFORE pushing queued mutations
  - Detect conflicts between queued mutations and upstream changes
  - Mark conflicted mutations (same field changed server-side)

- [ ] **OFFLINE-4** Create client-side conflict detection
  - Location: `frontend/src/lib/sync/conflict-detection.ts`
  - When stream message arrives, check for queued mutations on same field
  - Mark queued mutation as `conflicted` with server value
  - Mutation stays in queue until explicitly resolved

- [ ] **OFFLINE-5** Create conflict resolution UI
  - Location: `frontend/src/modules/sync/conflict-dialog.tsx`
  - Show side-by-side: your value vs server value
  - Actions: Keep Mine (rebase), Keep Server (discard), Merge Manually
  - Badge indicator on entities with unresolved conflicts

- [ ] **OFFLINE-6** Create rollback strategy
  - Individual rollback: remove single failed transaction
  - Cascade rollback: remove dependent transactions
  - Notify user of rollback with context

- [ ] **OFFLINE-7** Add transaction log viewer (debug mode)
  - Enable via `VITE_DEBUG_MODE=true`
  - Show pending/confirmed/failed/conflicted transactions
  - Show activitiesTable entries for debugging

---

### Multi-tab coordination

- [ ] **TAB-1** Create tab coordinator
  - Location: `frontend/src/lib/sync/tab-coordinator.ts`
  - Leader election using Web Locks API
  - BroadcastChannel for cross-tab messaging
  - Heartbeat/lease renewal (handle background throttling)

- [ ] **TAB-2** Implement single-writer pattern
  - Only leader tab opens SSE connection
  - Leader broadcasts stream messages to follower tabs
  - Followers apply broadcasts to their React Query cache

- [ ] **TAB-3** Handle leader handoff
  - Detect leader tab close/crash
  - New leader election with visibility preference (foreground wins)
  - Resume SSE from last known offset

- [ ] **TAB-4** Add leader status indicator (debug mode)
  - Show which tab is leader
  - Show broadcast message count
  - Show SSE connection status

---

## Technical specifications

### Transaction ID format (hybrid logical clock)

Cella uses **Hybrid Logical Clocks (HLC)** for transaction IDs. HLC combines physical timestamps with logical counters to provide:

- **Causality preservation**: If event A causes B, then HLC(A) < HLC(B)
- **Lexicographic sortability**: String comparison matches temporal order
- **Clock skew tolerance**: Logical counter handles same-millisecond events
- **Human readability**: Timestamps are visible for debugging

**Format**: `{wallTime}.{logical}.{nodeId}` (~32 chars)

```typescript
// frontend/src/lib/sync/hlc.ts
import { HLC } from 'hlc-ts'; // or implement manually

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

Product entity tables have a single transient JSONB column for transaction metadata:

```typescript
// In backend/src/db/schema/pages.ts (and other product entities)
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

### Transaction wrapper schema (replaces HTTP headers)

**Better DX**: Instead of custom HTTP headers, use typed `{ data, tx }` wrapper for mutations.

| Operation | Request | Response | Notes |
|-----------|---------|----------|-------|
| GET | Flat params | `Entity[]` / `Entity` | No tx - resolve conflicts client-side |
| POST/PATCH/DELETE | `{ data, tx }` | `{ data, tx }` | Server tracks transaction + source + changedField |
| Stream message | N/A | `{ data, tx }` | Includes sourceId, changedField for "is this mine?" |

**Transaction metadata schemas:**

```typescript
// backend/src/modules/sync/schema.ts
export const txRequestSchema = z.object({
  transactionId: z.string().describe('Unique mutation ID (client-generated)'),
  sourceId: z.string().describe('Tab/instance ID - origin of mutation'),
  changedField: z.string().nullable().describe('Which field this mutation changes (null for create/delete)'),
  expectedTransactionId: z.string().nullable().optional()
    .describe('Expected last transaction ID for this field (for conflict detection)'),
});

export const txResponseSchema = z.object({
  transactionId: z.string().nullable(),
});

export const txStreamMessageSchema = z.object({
  transactionId: z.string().nullable(),
  sourceId: z.string().nullable(),
  changedField: z.string().nullable(),
  action: z.enum(['create', 'update', 'delete']),
  activityId: z.number().describe('Stream offset for resumption'),
});

// Factory functions for wrapping entity schemas
export const createTxMutationSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({ data: dataSchema, tx: txRequestSchema }); // tx is REQUIRED for product entities

export const createTxResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({ data: dataSchema, tx: txResponseSchema });

export const createStreamMessageSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({ data: dataSchema.nullable(), tx: txStreamMessageSchema });
```

**Key additions for field-level tracking:**
- `changedField` - identifies which field was mutated (enables per-field LWW)
- `expectedTransactionId` - for conflict detection ("I expect this field's last tx to be X")

### Source identifier & transaction factory

**Single module for sync primitives** - consolidates `sourceId` and transaction ID generation:

```typescript
// frontend/src/lib/sync/source-id.ts
import { nanoid } from 'nanoid';

/** Unique identifier for this browser tab (generated once per page load) */
export const sourceId = crypto.randomUUID();

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

### Conflict resolution strategy

**Three-layer conflict reduction** 

1. Upstream-first → ~90% avoided (online users are always current)
2. Field-level tracking → different fields = no conflict
3. Merge → LWW (server wins) or resolution UI for same-field conflicts

**When conflicts DO occur** (same field edited while offline or during brief pull-push window):

```typescript
// Server returns 409 with field-specific info
interface FieldConflictResponse {
  error: 'conflict';
  code: 'FIELD_CONFLICT';
  field: string;                        // Which field conflicted
  expectedTransactionId: string;        // What client expected
  serverTransactionId: string;          // What server has
  message: string;
}
```

**Client-side conflict detection (upstream pull)**:

When pulling upstream changes, detect conflicts with queued mutations locally:

```typescript
// When stream message arrives, check for conflicts with queued mutations
function handleUpstreamMessage(message: StreamMessage) {
  const { entityId, changedField, transactionId } = message.sync;
  const serverData = message.data;
  
  // Check if we have a queued mutation for this field
  const queued = outbox.find(m => 
    m.entityId === entityId && m.field === changedField
  );
  
  if (queued && serverData && changedField) {
    // Conflict! The field we wanted to change was modified server-side
    queued.status = 'conflicted';
    queued.conflict = {
      serverValue: serverData[changedField],
      serverTransactionId: transactionId,
    };
    // UI will show conflict indicator, mutation stays in queue until resolved
  }
  
  // Update field transaction tracking regardless
  if (changedField) {
    setFieldTransactionId(entityId, changedField, transactionId);
  }
}
```

**Conflict resolution UI**:

```typescript
function ConflictDialog({ entityId, field, yourValue, serverValue, onResolve }) {
  return (
    <Dialog>
      <DialogHeader>Sync Conflict</DialogHeader>
      <DialogContent>
        <p>The "{field}" field was modified while you were offline.</p>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Your version</Label><ValuePreview value={yourValue} /></div>
          <div><Label>Server version</Label><ValuePreview value={serverValue} /></div>
        </div>
      </DialogContent>
      <DialogFooter>
        <Button onClick={() => onResolve('keep-server')}>Keep Server Version</Button>
        <Button onClick={() => onResolve('keep-mine')}>Keep My Version</Button>
        <Button onClick={() => openMergeEditor()}>Merge Manually</Button>
      </DialogFooter>
    </Dialog>
  );
}

function resolveConflict(queued, resolution, mergedValue?) {
  switch (resolution) {
    case 'keep-mine':
      // Rebase: update expectedTx to current server state, keep our value
      queued.expectedTransactionId = queued.conflict.serverTransactionId;
      queued.status = 'pending';
      delete queued.conflict;
      break;
    case 'keep-server':
      // Discard our queued mutation entirely
      outbox.remove(queued);
      break;
    case 'merge':
      // User provided a merged value
      queued.value = mergedValue;
      queued.expectedTransactionId = queued.conflict.serverTransactionId;
      queued.status = 'pending';
      delete queued.conflict;
      break;
  }
}
```

**Key insight**: Client knows about conflicts BEFORE attempting to push (upstream-first). This enables better UX than server 409s.

### Activity table query patterns

```typescript
// Is this transaction already processed? (idempotency)
SELECT id FROM activities 
WHERE sync->>'transactionId' = $1 
LIMIT 1;

// Get full history for an entity
SELECT * FROM activities 
WHERE entity_type = 'page' AND entity_id = $1 
ORDER BY created_at;

// All activities by a source (debugging)
SELECT * FROM activities 
WHERE sync->>'sourceId' = $1 
ORDER BY created_at DESC 
LIMIT 100;

// Recent activities for organization (activity feed)
SELECT * FROM activities 
WHERE organization_id = $1 
ORDER BY created_at DESC 
LIMIT 50;

// Find entity by transaction
SELECT entity_type, entity_id FROM activities 
WHERE sync->>'transactionId' = $1 
LIMIT 1;
```

### Mutation blocking pattern (jitter prevention)

**Problem**: Rapid consecutive mutations to the same entity cause "jittery" UI:
1. User updates page (mutation A sending...)
2. User updates same page again (mutation B)
3. Optimistic update B applied
4. Mutation A response arrives → may conflict with optimistic B

**Solution: Entity-level mutex**

```typescript
// frontend/src/lib/sync/mutation-lock.ts
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

// Usage in mutation hook
const usePageUpdateMutation = () => {
  return useMutation({
    mutationFn: async (data) => {
      const entityKey = `page:${data.id}`;
      return withMutationLock(entityKey, () => api.updatePage(data));
    },
  });
};
```

**Alternative: Debounce for rapid edits (typing)**

```typescript
// For content editing, debounce before sending
const debouncedUpdate = useDebouncedCallback(
  (pageId: string, updates: Partial<Page>) => {
    updateMutation.mutate({ pageId, ...updates });
  },
  300 // Wait 300ms after last keystroke
);
```

### Hydrate barrier (race prevention)

**Problem**: Stream messages arriving before initial LIST query completes can cause data regression:
1. User opens app, LIST query starts fetching
2. Stream connects with `offset=now`
3. Stream message arrives (newer data)
4. LIST response arrives (older snapshot!)
5. User sees data regress to older state

**Solution: Queue stream messages during hydration**

```typescript
// frontend/src/lib/sync/use-entity-stream.ts
export function useEntityStream(orgIdOrSlug: string) {
  const queryClient = useQueryClient();
  const queuedMessages = useRef<StreamMessage[]>([]);
  const isHydrating = useRef(true);
  
  // Track when initial queries complete
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.status === 'success') {
        // Initial hydration complete, flush queued messages
        if (isHydrating.current) {
          isHydrating.current = false;
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
    if (isHydrating.current) {
      // Queue messages during initial load
      queuedMessages.current.push(message);
      return;
    }
    applyMessageToCache(queryClient, message);
  }, [queryClient]);
  
  // ... EventSource setup using handleStreamMessage
}
```

**Hydration Detection**: Use React Query's `isFetching` state or track first successful fetch per query key.

### Stream offset store (offline)

The stream offset must be persisted to survive tab closure. Without this, users who close their browser and return later would start from `'now'` and miss all changes made while away.

```typescript
// frontend/src/lib/sync/offset-store.ts
import Dexie from 'dexie';

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

```typescript
// frontend/src/lib/sync/mutation-outbox.ts
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
// frontend/src/lib/sync/tab-coordinator.ts
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

## Migration path

### For existing entities

- **Add transient `tx` column** (non-breaking)
   - Add `tx` JSONB column (nullable)
   - No indexes needed (transient column, overwritten each mutation)
   - Optionally add expression index: `CREATE INDEX ON pages ((tx->>'transactionId'))`

- **Extend activitiesTable** (non-breaking)
   - Add `tx` JSONB column (nullable) containing `{ transactionId, sourceId, changedField }`
   - Add expression indexes on `(tx->>'transactionId')` and composite for field conflict queries

- **Update CDC handlers**
   - Extract transaction info when available
   - Backwards compatible: old rows without transactions still work

- **Update backend handlers incrementally**
   - Add tx wrapper `{ data, tx }` to tracked entity routes
   - Old clients need updating (breaking change for tracked entities)

- **Update frontend mutation hooks**
   - Add transaction tracking
   - Use tx wrapper in request/response

### For new product entities

Use the `createSyncedEntity` factory (Phase 7) or follow this checklist:

- Add transient `tx` JSONB column to schema (see SCHEMA-1)
- Register table in CDC tracked tables
- Create mutation hooks with transaction tracking
- Use `useEntityStream` hook if realtime sync needed
- Add to offline executor if offline support needed

---

## Future enhancements

### Sync engine abstraction (phase 7)

```typescript
// frontend/src/lib/sync/create-synced-entity.ts
interface SyncEntityConfig<T> {
  name: string;
  schema: z.ZodSchema<T>;
  mode: 'rest' | 'stream';  // 'stream' = Live stream SSE (realtime opMode)
  offlineEnabled: boolean;
  conflictResolution: 'lww' | 'optimistic-lock';
}

function createSyncedEntity<T>(config: SyncEntityConfig<T>) {
  return {
    queryOptions: createQueryOptions(config),
    useCreate: createCreateMutation(config),
    useUpdate: createUpdateMutation(config),
    useDelete: createDeleteMutation(config),
    useTransactionStatus: createTransactionStatusHook(config),
    useStream: config.mode === 'stream' ? createStreamHook(config) : undefined,
  };
}

// Usage
const pageSync = createSyncedEntity({
  name: 'page',
  schema: zPage,
  mode: 'stream',
  offlineEnabled: true,
  conflictResolution: 'optimistic-lock',
});

export const { queryOptions, useCreate, useUpdate, useDelete } = pageSync;
```

### PostgreSQL LISTEN/NOTIFY for instant updates

> **Note**: This section describes the core LISTEN/NOTIFY pattern that is now the primary architecture (not a future enhancement). See DEC-10, DEC-11, and DEC-15 in SYNC_ENGINE_REQUIREMENTS.md for the design decisions.

The CDC worker includes entity data directly in the NOTIFY payload, avoiding extra fetches:

```typescript
// CDC handler: NOTIFY with entity data from replication row
const payload = {
  orgId, entityType, entityId, action, transactionId,
  entity: entityFromReplicationRow,  // Included directly - no fetch needed!
};

// Handle 8KB limit
if (JSON.stringify(payload).length > 7500) {
  payload.entity = null;  // Fallback: subscriber will fetch
}

// Use same channel as existing trigger (cella_activities) - see DEC-11
await db.execute(sql`NOTIFY cella_activities, ${JSON.stringify(payload)}`);

// API server: ActivityBus receives NOTIFY, StreamSubscriberManager handles fan-out
// Entity data comes from NOTIFY payload (zero extra queries for most events)
```

---

## References

### External documentation
- [TanStack DB Persistence Plan](https://github.com/TanStack/db/issues/865#issuecomment-3699913289) - Multi-tab coordination, hydrate barrier, leader election patterns
- [Hono SSE Streaming](https://hono.dev/docs/helpers/streaming#stream-sse) - SSE helper docs
- [LiveStore Syncing](https://docs.livestore.dev/reference/syncing/) - Push/pull sync patterns (research reference)
- [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) - Browser leader election

### Cella internal
- [backend/src/db/schema/activities.ts](../backend/src/db/schema/activities.ts) - Activities table schema (durable log)
- [cdc/](../cdc/) - CDC worker and handlers
- [cdc/src/worker.ts](../cdc/src/worker.ts) - PostgreSQL logical replication worker
- [frontend/src/modules/pages/query.ts](../frontend/src/modules/pages/query.ts) - Current mutation pattern
- [frontend/src/modules/attachments/README.md](../frontend/src/modules/attachments/README.md) - Sync architecture

---

## Appendix A: Comparison matrix

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
| Realtime Updates | ✅ WebSocket | ✅ WebSocket/Broadcast | ✅ | ✅ Shapes | ✅ SSE + NOTIFY |
| Multi-Tab Sync | ✅ SharedWorker | ✅ BroadcastChannel | ✅ | ✅ | ✅ Leader election |
| Bundle Size | Large (SQLite WASM) | 5.4-12.1kB | ~50kB | ~30kB | ~5kB (hooks only) |
| React Integration | Custom hooks | ✅ ui-react module | ✅ | ✅ TanStack | ✅ TanStack Query |
| OpenAPI Compatible | ❌ Bypasses REST | ❌ | ❌ | ❌ | ✅ Extends REST |
| Progressive Adoption | ❌ All-or-nothing | ⚠️ | ⚠️ | ⚠️ | ✅ REST → Sync |
| Devtools | ✅ Custom | ✅ Inspector | ⚠️ | ⚠️ | ✅ React Query Devtools |
| Undo/Redo | ✅ | ✅ Checkpoints | ✅ Eventlog | ❌ | ⚠️ Via activities |
| Broader scope use | N/A (own infra) | N/A | N/A | ❌ | ✅ ActivityBus can support API internals |

---

## Appendix B: Schema changes summary

### Product entity tables (pages, attachments)

```sql
-- Add transaction tracking (simple VARCHAR columns)
ALTER TABLE pages ADD COLUMN last_transaction_id VARCHAR;
ALTER TABLE pages ADD COLUMN last_source_id VARCHAR;

-- Index for conflict detection / idempotency
CREATE INDEX idx_pages_last_transaction_id ON pages (last_transaction_id);
```

### Activities table

```sql
-- Add transaction and source tracking
ALTER TABLE activities ADD COLUMN transaction_id VARCHAR;
ALTER TABLE activities ADD COLUMN source_id VARCHAR;

-- Indexes for lookups
CREATE INDEX idx_activities_transaction_id ON activities (transaction_id);
CREATE INDEX idx_activities_source_id ON activities (source_id);
```

---

## Appendix C: Example migration

### Before (current pattern)

```typescript
// frontend/src/modules/pages/query.ts
export const usePageCreateMutation = () => {
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationFn: (body) => createPage({ body }),
    onMutate: async (newData) => {
      const optimistic = createOptimisticEntity(zPage, newData);
      mutateCache.create([optimistic]);
      return { optimistic };
    },
    // ... error handling
  });
};
```

### After (with transaction tracking)

See [Frontend mutation pattern with transactions](#frontend-mutation-pattern-with-transactions) for the complete pattern.

Key differences:
- Import `sourceId` and `createTransactionId` from `~/lib/sync/source-id`
- `onMutate` generates `transactionId` and returns `{ input, transactionId, optimisticEntity }`
- `mutationFn` receives the onMutate return and sends `{ data, tx }` wrapper
- Track transaction lifecycle: `pending` → `sent` → `confirmed` (via stream)

---

## Acknowledgements

This sync engine design draws from established patterns in distributed systems and local-first software. Key influences:
- [ElectricSQL](https://electric-sql.com/) - Shape-based sync, PostgreSQL logical replication
- [LiveStore](https://livestore.io/) - SQLite-based sync with reactive queries, event sourcing
- [TinyBase](https://tinybase.org/) - Reactive data store with sync, CRDT support, and persistence
- [Last-Write-Wins (LWW)](https://en.wikipedia.org/wiki/Eventual_consistency) - Simple resolution for opaque values
- [Hybrid Logical Clocks (HLC)](https://cse.buffalo.edu/tech-reports/2014-04.pdf) - Kulkarni et al., causality-preserving timestamps

---

*This document will be updated as implementation progresses.*
