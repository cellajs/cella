# Cella hybrid sync engine plan

## Summary

This document outlines a plan to build a lightweight hybrid sync engine that extends Cella's existing OpenAPI + React Query infrastructure with optional sync and offline capabilities for product entities. The approach is "hybrid" because it maintains standard REST/OpenAPI endpoints as the default while allowing product entities to 'upgrade' with enhanced sync and offline features.

| Tier | Features | Example |
|------|----------|---------|
| **Basic** | REST CRUD, server-generated IDs | Context entities (organizations) |
| **Synced** | + Client IDs, transaction tracking, IndexedDB persistence, mutation queue | Product entities (pages, attachments) |
| **Realtime** | + Transaction Stream SSE, live cache updates, multi-tab coordination | Heavy-use product entities |


> This plan focuses on upgrading product entities from **Basic** → **Synced** → **Realtime**.


## Problem statement

Several sync solutions exist (Electric SQL, TinyBase, LiveStore, Liveblocks, etc.), but none align well for a hybrid approach:

| Concern | External services | Built-in approach |
|---------|-------------------|-------------------|
| **OpenAPI contract** | Bypassed - sync happens outside REST | Extends existing endpoints with `{ data, sync }` wrapper |
| **Authorization** | Requires re-implementing permission logic | Reuses `isPermissionAllowed()` and existing guards |
| **Schema ownership** | Sync layer often dictates schema patterns | Drizzle/zod schemas remain authoritative |
| **Audit trail** | Not covered in general | Activities already recorded through Change Data Capture (CDC) |
| **Opt-in complexity** | All-or-nothing adoption | Progressive: REST → Tracked → Offline → Realtime |
| **React Query base layer** | New reactive layer | Builds on existing TanStack Query cache |

Cella's existing infrastructure provides 70% of what's needed:

- ✅ `activitiesTable` - act as durable change log
- ✅ CDC worker - Already captures entity changes via logical replication  
- ✅ React Query - Optimistic updates, cache management, persistence
- ✅ Permission system - `isPermissionAllowed()` for entity-level ACLs
- ✅ OpenAPI + Zod - Type-safe request/response contracts

## Core concepts

**Design philosophy**
- **OpenAPI-first** - All features work through the existing OpenAPI infrastructure.
- **React Query base** - Build on top of, not around, TanStack Query.
- **Progressive enhancement** - Add optimistic updates → add offline → add realtime.

**Architecture**
- **Leverage CDC** - Use pg `activitiesTable` as durable event log (no separate transaction storage).
- **Transaction stream** - SSE streaming backed by CDC worker + postgres NOTIFY for realtime sync.
- **Separation of concerns** - LIST endpoints handle queries/filtering; Stream is dumb, just provides new data.
- **React Query as merge point** - Both initial load and stream updates feed into the same cache.

**Sync mechanics**
- **Client-generated IDs** - Product entities use client-generated transaction IDs for determinism.
- **Upstream-first sync** - Pull before push; client must be caught up before sending mutations. This provides temporal ordering - your mutation is always based on latest state.
- **Hybrid logical clocks (HLC)** - Transaction IDs use HLC for causality-preserving, sortable timestamps.
- **Offline mutation queue** - Persist pending mutations to IndexedDB, replay on reconnect.
- **Field-level tracking** - One mutation = one transaction = one field change. Conflicts are scoped per-field, not per-entity.
- **Merge strategy** - When upstream changes conflict with pending local mutations: (1) try CRDT merge for compatible types (text, counters, sets), (2) fall back to LWW for opaque values, (3) show a generic resolution UI if user intervention needed.
- **Single-writer multi-tab** - One leader tab owns SSE connection and broadcasts to followers.

** OpenAPI + React Query infra to build on top of:

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

> "Upstream events always need to be pulled before a client can push its own events to preserve a global total order of events."

Optimistic updates are immediate and unconditional. "Upstream-first" controls *when mutations are sent to server*, not when the user sees their change. This gives instant UX while maintaining sync guarantees.

- **Global total order** - All clients see events in the same order
- **No stale writes** - Client has latest state before mutating
- **Solve conflicts locally** - Merge (CRDT/LWW/UI) happens in frontend when pulling upstream reveals conflicts with pending local mutations 

**How it works in Cella:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Upstream-First Mutation Flow                      │
├─────────────────────────────────────────────────────────────────────────┤
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
│     │               ├── OK ──► Confirm via stream event                  │
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
└─────────────────────────────────────────────────────────────────────────┘
```


---

## Architecture design

### Transaction tracking schema (field-level)

**Conflict reduction strategy**:

Conflicts are minimized through two complementary approaches:

- **Upstream-first sync**: Clients must pull latest server state before pushing mutations. This eliminates most conflicts because the client is working with current data. Only truly concurrent edits (made during the brief window between pull and push) can conflict.

- **Field-level tracking**: When conflicts do occur, they're scoped to individual fields. Two users editing different fields simultaneously = no conflict.

- **Merge strategy**: For same-field conflicts, try CRDT merge for compatible types (text, counters, sets), fall back to LWW for opaque values (enums, foreign keys), and show resolution UI when user intervention is needed.

Together, these make conflicts rare in practice: upstream-first handles 90%+ of cases, field-level tracking handles most of the remainder, and the tiered merge strategy handles the rest gracefully.

**Entity row structure** - Three transient sync columns:

```typescript
// In product entity tables (pages, attachments, etc.)
// These are TRANSIENT - written by handler, read by CDC, overwritten on next mutation
syncTransactionId: varchar('sync_transaction_id', { length: 32 });  // Current mutation's transaction ID
syncSourceId: varchar('sync_source_id', { length: 64 });           // Tab/instance that made this mutation
syncChangedField: varchar('sync_changed_field', { length: 64 });   // Which field this mutation changes
```

**Why "transient"?**
- These columns are only populated during mutation
- CDC reads them and stores in activitiesTable
- They get overwritten on next mutation (no history on entity)
- The entity table is NOT the source of truth for sync state
- activitiesTable has complete field-level audit trail

**Benefits**:
- **Field-level conflicts** - Two users editing different fields = no conflict
- **Tiered merge strategy** - Try CRDT merge for compatible types, fall back to LWW for opaque values, show resolution UI when needed
- **Clean entity schema** - Sync state lives in activities, not entity
- **Full history** - activitiesTable has complete field-level audit trail

### Leveraging existing CDC infrastructure

Cella already has a robust CDC system with `activitiesTable`. Extend it for transaction tracking:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend: Create Page                                                │
│ const transactionId = nanoid();                                      │
│ api.createPage({ body: { data: {...}, sync: { transactionId, sourceId } } }) │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Backend Handler                                                      │
│ const { data, sync } = ctx.req.valid('json');                        │
│ INSERT INTO pages (..., last_transaction_id = sync.transactionId)    │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PostgreSQL Logical Replication → CDC Worker                         │
│ Extracts transactionId from row.lastTransactionId                    │
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
│ Stream Endpoint delivers event with full entity data                 │
│ SSE event: { action: 'create', entity: {...}, transactionId: 'xyz123' }│
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend: Reconcile pending transactions                             │
│ if (event.transactionId === pendingTx.id) { confirm(); }             │
└─────────────────────────────────────────────────────────────────────┘
```

### Extended activitiesTable schema

```typescript
// backend/src/db/schema/activities.ts - additions
export const activitiesTable = pgTable('activities', {
  // ... existing columns
  
  // NEW: Field-level transaction tracking for sync/optimistic matching
  transactionId: varchar('transaction_id', { length: 32 }),  // From entity's sync_transaction_id column
  sourceId: varchar('source_id', { length: 64 }),            // Tab/instance identifier
  changedField: varchar('changed_field', { length: 64 }),    // Which field was changed (for field-level LWW)
  
}, (table) => [
  // ... existing indexes
  index('idx_activities_transaction_id').on(table.transactionId),
  index('idx_activities_source_id').on(table.sourceId),
  // Fast lookup: "what's the latest transaction for this entity+field?"
  index('idx_activities_field_tx').on(table.entityType, table.entityId, table.changedField),
]);
```

### Extended CDC context extraction

```typescript
// cdc/src/utils/extract-activity-context.ts - additions
export interface ActivityContext {
  // ... existing
  transactionId: string | null;  // NEW
  sourceId: string | null;       // NEW
  changedField: string | null;   // NEW: Field-level tracking
}

export function extractActivityContext(
  entry: TableRegistryEntry,
  row: Record<string, unknown>,
  action: 'create' | 'update' | 'delete',
): ActivityContext {
  // ... existing extraction

  // NEW: Read transient sync columns (written by handler, read here)
  const transactionId = getRowValue(row, 'sync_transaction_id') ?? null;
  const sourceId = getRowValue(row, 'sync_source_id') ?? null;
  const changedField = getRowValue(row, 'sync_changed_field') ?? null;

  return {
    // ... existing
    transactionId,
    sourceId,
    changedField,
  };
}
```

**Handling different actions:**

| Action | changedField | Notes |
|--------|--------------|-------|
| `insert` | `null` or `'*'` | Entire entity is new |
| `update` | Specific field name | From `sync_changed_field` column |
| `delete` | `null` or `'*'` | Entire entity removed |

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

  return useMutation<
    Attachment[], 
    ApiError, 
    CreateAttachmentData['body'], 
    { optimisticAttachments: Attachment[]; transactionId: string }
  >({
    mutationKey: keys.create,
    
    mutationFn: async (body) => {
      // Note: transactionId is added in onMutate and passed via context
      // The actual API call includes sync metadata
      return createAttachment({ 
        path: { orgIdOrSlug }, 
        body: {
          data: body,
          sync: {
            transactionId: (qc.getMutationDefaults(keys.create) as any)?.transactionId,
            sourceId,
          },
        },
      });
    },

    onMutate: async (newAttachments) => {
      const transactionId = createTransactionId();
      
      // Cancel outgoing refetches (same as existing pattern)
      await qc.cancelQueries({ queryKey: keys.list.base });

      // Attachments already have IDs from Transloadit
      const optimisticAttachments = newAttachments as Attachment[];

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
      
      // Mark as sent - final 'confirmed' status set when stream event arrives
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
- Includes `{ data, sync }` wrapper in API body
- Tracks transaction lifecycle: `pending` → `sent` → `confirmed` (via stream)
- Existing optimistic update patterns (`mutateCache.create/remove`) remain unchanged

### Realtime sync via transaction stream

**Architecture: LIST for initial load, stream for deltas**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Initial Load:              2. Subscribe to Updates:                  │
│     React Query                  Transaction Stream                      │
│     ┌──────────────┐               ┌──────────────────┐                 │
│     │ useQuery(    │               │ stream.subscribe │                 │
│     │   pagesQuery │               │   offset: 'now'  │◄─── Start now   │
│     │ )            │               │                  │     (skip hist) │
│     └──────┬───────┘               └────────┬─────────┘                 │
│            │                                │                            │
│            ▼                                ▼                            │
│     GET /pages?q=X&sort=Y          GET /stream/{org}?live=sse           │
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

**Stream architecture: CDC → NOTIFY → API → SSE fan-out**

Instead of each SSE connection polling the database, leverage the CDC worker that already processes all changes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Push-based stream architecture                        │
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
│  │    'activity',      │                                                    │
│  │    {orgId, ...}     │                                                    │
│  │  )                  │                                                    │
│  └──────────┬──────────┘                                                    │
│             │                                                                │
│             │ NOTIFY 'activity'                                              │
│             ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    API Server (Hono)                             │        │
│  │                                                                  │        │
│  │  ┌─────────────────────┐                                        │        │
│  │  │ Single LISTEN conn  │◄─── One listener for ALL orgs          │        │
│  │  │ for 'activity'      │                                        │        │
│  │  └──────────┬──────────┘                                        │        │
│  │             │                                                    │        │
│  │             ▼                                                    │        │
│  │  ┌─────────────────────┐                                        │        │
│  │  │ SubscriberRegistry  │  Map<orgId, Set<SSEStream>>            │        │
│  │  │                     │                                        │        │
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
- **One DB connection** for LISTEN vs N polling queries
- **Instant delivery** - no 500ms poll delay
- **Scales with orgs** not with subscribers
- **CDC already has the data** - no round-trip through database

**Stream filtering**: Client filters and dedupes. Stream delivers all org changes to simplify server implementation and allow client-side flexibility for filtering by entity type or other criteria.

**CDC worker: NOTIFY after activity insert**

```typescript
// cdc/src/handlers/activity-notify.ts
import { sql } from 'drizzle-orm';

interface NotifyPayload {
  orgId: string;
  activityId: number;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  transactionId: string | null;
  sourceId: string | null;
  changedField: string | null;
  entity: Record<string, unknown> | null;  // Full entity data from replication
}

/**
 * CDC already has the entity data from logical replication.
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
    transactionId: activity.transactionId ?? null,
    sourceId: activity.sourceId ?? null,
    changedField: activity.changedField ?? null,
    entity: entityData,  // Include full entity - no extra fetch needed!
  };
  
  // PostgreSQL NOTIFY has 8KB limit - handle large entities gracefully
  const payloadStr = JSON.stringify(payload);
  if (payloadStr.length > 7500) {
    // For oversized payloads, send without entity data
    // API server will fetch on-demand (rare case)
    payload.entity = null;
  }
  
  await db.execute(sql`SELECT pg_notify('activity', ${JSON.stringify(payload)})`);
}

// Usage in CDC insert handler:
async function handleInsert(row: Record<string, unknown>, activity: ActivityInsert) {
  const [inserted] = await db.insert(activitiesTable).values(activity).returning();
  
  // Pass entity data directly - CDC already has it from replication!
  await notifyActivity(activity, inserted.id, row);
}
```

**Why CDC can include entity data:**
- Logical replication delivers full row data to CDC
- No extra database query needed
- Reduces latency (one less round-trip)
- 8KB NOTIFY limit handled gracefully (fallback for large entities)

**Alternative: PostgreSQL trigger** (if CDC shouldn't know about notifications)

```sql
-- Run once as migration
CREATE OR REPLACE FUNCTION notify_activity() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('activity', json_build_object(
    'orgId', NEW.organization_id,
    'activityId', NEW.id,
    'entityType', NEW.entity_type,
    'entityId', NEW.entity_id,
    'action', NEW.action
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_notify
  AFTER INSERT ON activities
  FOR EACH ROW EXECUTE FUNCTION notify_activity();
```

**API server: Subscriber registry + LISTEN**

Uses Cella's existing permission system (`isPermissionAllowed`, `MembershipBaseModel`) for authorization during fan-out.

```typescript
// backend/src/lib/stream/subscriber-registry.ts
import type { Pool, PoolClient } from 'pg';
import type { ProductEntityType } from 'config';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { isPermissionAllowed } from '#/permissions';

interface Subscriber {
  stream: SSEStream;
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

class SubscriberRegistry {
  private subscribers = new Map<string, Set<Subscriber>>();
  private listenClient: PoolClient | null = null;
  
  async initialize(pool: Pool): Promise<void> {
    // Dedicated connection for LISTEN (doesn't return to pool)
    this.listenClient = await pool.connect();
    
    await this.listenClient.query('LISTEN activity');
    
    this.listenClient.on('notification', async (msg) => {
      if (msg.channel !== 'activity') return;
      
      const payload: ActivityNotification = JSON.parse(msg.payload!);
      await this.broadcast(payload);
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
    
    // Entity data already included from CDC - no extra fetch needed!
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

export const subscriberRegistry = new SubscriberRegistry();
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
import { subscriberRegistry } from '#/lib/stream/subscriber-registry';
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
        const unsubscribe = subscriberRegistry.subscribe(orgId, {
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
  
  const activities = await db
    .select()
    .from(activitiesTable)
    .where(and(...filters))
    .orderBy(activitiesTable.id)
    .limit(100);
  
  // Filter by permissions (system admins see all)
  if (userSystemRole === 'admin') {
    return activities;
  }
  
  // For each activity, check if user can read the entity
  return activities.filter((activity) => {
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
| Entity fetches per change | N/A | 0 (CDC includes data) or 1 (oversized fallback) |
| Latency | 0-500ms (poll interval) | <10ms (instant push) |
| Scales with | Subscribers × poll rate | Changes × subscribers per org |
| DB connections | 1 per query | 1 LISTEN (persistent) |

**Key optimization**: CDC includes entity data in NOTIFY payload (it already has it from replication), so API server typically does zero DB queries for live events. Only catch-up queries and rare oversized entity fallbacks require fetches.

**Security & authorization considerations:**

The push-based architecture shifts the authorization boundary:

```
BEFORE (polling):  User → API (auth) → DB query → Response
AFTER (push):      CDC (no auth) → NOTIFY → API → Fan-out (auth here!)
```

| Concern | Risk level | Mitigation |
|---------|------------|------------|
| **NOTIFY payload visibility** | Medium | CDC runs on private network; any DB LISTEN sees all payloads |
| **Org-level auth** | ✅ Handled | Org guard middleware validates membership before stream registration |
| **Entity-level ACLs** | ✅ Handled | `isPermissionAllowed()` called in `broadcast()` using subscriber's memberships |
| **System admin bypass** | ✅ Handled | `userSystemRole === 'admin'` check mirrors REST handler pattern |
| **CDC has no user context** | ✅ By design | CDC is data-plane; API server is auth-plane; separation is correct |
| **Data in transit** | Low | Internal service communication; use TLS if CDC/API on separate hosts |

**Key security principles:**
1. **CDC is trusted** - It runs in your infrastructure, reads from replication slot
2. **NOTIFY channel is internal** - Only API server(s) should LISTEN
3. **Authorization happens at fan-out** - `SubscriberRegistry.broadcast()` uses `isPermissionAllowed()` 
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
// - SubscriberRegistry.broadcast() uses it for stream filtering
```

**Stream event payload** (uses sync wrapper):

```typescript
// Matches createStreamEventSchema output
interface StreamEvent<T = Entity> {
  data: T | null;                  // Full entity data (null if deleted)
  sync: {
    transactionId: string | null; // For transaction confirmation
    sourceId: string | null;      // "Is this mine?" check
    action: 'create' | 'update' | 'delete';
    activityId: number;           // Stream offset for resumption
  };
  // Additional fields (not in sync wrapper, but useful)
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
    onEvent?: (event: StreamEvent) => void;
  }
) {
  const queryClient = useQueryClient();
  const isOnline = useOnlineManager((s) => s.isOnline);
  const offsetRef = useRef<string>('now');
  
  useEffect(() => {
    if (!isOnline || !orgIdOrSlug) return;
    
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
    });
    
    eventSource.addEventListener('change', (e) => {
      const event: StreamEvent = JSON.parse(e.data);
      offsetRef.current = e.lastEventId;
      
      // Update React Query cache
      applyEventToCache(queryClient, event);
      
      options?.onEvent?.(event);
    });
    
    return () => eventSource.close();
  }, [orgIdOrSlug, isOnline]);
}

/**
 * Apply stream event to React Query cache.
 */
function applyEventToCache(queryClient: QueryClient, event: StreamEvent) {
  const { action, entityType, entityId, entity } = event;
  
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

**Sync confirmation via stream events**:

```typescript
// Transaction is confirmed when it appears in the stream
eventSource.addEventListener('change', (e) => {
  const event: StreamEvent = JSON.parse(e.data);
  
  if (event.transactionId && pendingTransactions.has(event.transactionId)) {
    trackTransaction(event.transactionId, { status: 'confirmed' });
    pendingTransactions.delete(event.transactionId);
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
    .select({ transactionId: activitiesTable.transactionId })
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.entityType, entityType),
        eq(activitiesTable.entityId, entityId),
        eq(activitiesTable.changedField, changedField),
        isNotNull(activitiesTable.transactionId)
      )
    )
    .orderBy(desc(activitiesTable.id))
    .limit(1);

  const serverTransactionId = latest?.transactionId ?? null;

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

**Backend: Field-level conflict check + transient sync columns**:

```typescript
// Backend: Verify no concurrent modifications to this field
app.openapi(routes.updatePage, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const { data, sync } = ctx.req.valid('json');
  
  // 1. Conflict detection (if expectedTransactionId provided)
  if (sync?.expectedTransactionId && sync?.changedField) {
    const { hasConflict, serverTransactionId } = await checkFieldConflict({
      entityType: 'page',
      entityId: id,
      changedField: sync.changedField,
      expectedTransactionId: sync.expectedTransactionId,
    });
    
    if (hasConflict) {
      return ctx.json({
        error: 'conflict',
        code: 'FIELD_CONFLICT',
        field: sync.changedField,
        expectedTransactionId: sync.expectedTransactionId,
        serverTransactionId,
        message: `Field "${sync.changedField}" was modified by another user`,
      }, 409);
    }
  }
  
  // 2. Apply update with transient sync columns (CDC will read these)
  const [page] = await db.update(pagesTable)
    .set({
      ...data,
      // Transient sync columns (written here, read by CDC)
      syncTransactionId: sync?.transactionId ?? null,
      syncSourceId: sync?.sourceId ?? null,
      syncChangedField: sync?.changedField ?? null,
      modifiedAt: new Date(),
      modifiedBy: ctx.get('user').id,
    })
    .where(eq(pagesTable.id, id))
    .returning();
  
  return ctx.json({ data: page, sync: { transactionId: sync?.transactionId ?? null } });
});
```

**Key insight**: Two users editing different fields = no conflict. Only same-field concurrent edits trigger 409.

### Idempotency via activitiesTable

```typescript
// backend/src/lib/idempotency.ts

/**
 * Check if a transaction has already been processed.
 * Uses the CDC-populated activitiesTable as the source of truth.
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
  const { data, sync } = ctx.req.valid('json');
  const { transactionId, sourceId } = sync;
  
  if (await isTransactionProcessed(db, transactionId)) {
    // Idempotent: return existing entity
    const ref = await getEntityByTransaction(db, transactionId);
    if (ref) {
      const [existing] = await db.select()
        .from(pagesTable)
        .where(eq(pagesTable.id, ref.entityId));
      
      return ctx.json({ data: existing, sync: { transactionId } });
    }
  }
  
  // First time - process normally
  // ...
});
```

---

## Implementation TODO list

### Phase 1: Schema & CDC extensions (foundation)

- [ ] **1.1** Add transient sync columns to product entity schemas
  - Files: `backend/src/db/schema/pages.ts`, `attachments.ts`
  - Columns: `sync_transaction_id` (VARCHAR 32), `sync_source_id` (VARCHAR 64), `sync_changed_field` (VARCHAR 64)
  - Create migration

- [ ] **1.2** Extend `activitiesTable` with field-level tracking columns
  - File: `backend/src/db/schema/activities.ts`
  - Add: `transactionId`, `sourceId`, `changedField` columns
  - Add indexes: `transaction_id`, `source_id`, composite `(entity_type, entity_id, changed_field)`

- [ ] **1.3** Update CDC context extraction for field-level
  - File: `cdc/src/utils/extract-activity-context.ts`
  - Extract `transactionId` from `sync_transaction_id` column
  - Extract `sourceId` from `sync_source_id` column
  - Extract `changedField` from `sync_changed_field` column

- [ ] **1.4** Update CDC handlers to include field-level info
  - Files: `cdc/src/handlers/insert.ts`, `update.ts`, `delete.ts`
  - Include `transactionId`, `sourceId`, `changedField` in activity record
  - Set `changedField` to `null` or `'*'` for insert/delete

### Phase 2: Frontend transaction infrastructure

- [ ] **2.1** Create sync primitives module
  - Location: `frontend/src/lib/sync/hlc.ts`
  - Export `sourceId` const (generated with `crypto.randomUUID()` on module load)
  - Create HLC instance with `nodeId = sourceId`
  - Export `createTransactionId()` using HLC (format: `{wallTime}.{logical}.{nodeId}`)
  - Export `parseTransactionId()` and `compareTransactionIds()` utilities
  - Consider using `hlc-ts` library or implement HLC manually

- [ ] **2.2** Create transaction manager hook
  - Location: `frontend/src/lib/sync/use-transaction-manager.ts`
  - Track pending transactions in memory + IndexedDB
  - States: `pending` → `sent` → `confirmed` | `failed`

- [ ] **2.3** Create field transaction tracking
  - Location: `frontend/src/lib/sync/field-transactions.ts`
  - Map of `entityId:field → transactionId` (what's the last tx I saw for this field?)
  - `getExpectedTransactionId(entityId, field)` - for conflict detection
  - `setFieldTransactionId(entityId, field, transactionId)` - updated from stream events
  - `updateFieldTransactionsFromEntity(entityId, fieldTxMap)` - batch update

- [ ] **2.4** Create sync wrapper schemas
  - Location: `backend/src/modules/sync/schema.ts`
  - `syncRequestSchema` with `transactionId`, `sourceId`, `changedField`, `expectedTransactionId`
  - `syncResponseSchema`, `syncStreamEventSchema` with `changedField`
  - Factory functions for wrapping entity schemas

### Phase 3: Mutation hook updates

- [ ] **3.1** Update `usePageCreateMutation`
  - File: `frontend/src/modules/pages/query.ts`
  - Generate transaction ID in `onMutate`
  - Use `{ data, sync }` wrapper with `changedField: null` (create = all fields)
  - Track with transaction manager

- [ ] **3.2** Update `usePageUpdateMutation` for field-level
  - One mutation = one field change
  - Include `changedField` and `expectedTransactionId` in sync
  - Get expectedTransactionId from field transaction tracking

- [ ] **3.3** Update `usePageDeleteMutation`
  - Use `changedField: null` for deletes

- [ ] **3.4** Apply same pattern to attachments module

### Phase 4: Backend handler updates

- [ ] **4.1** Create field-level conflict detection utility
  - Location: `backend/src/lib/sync/conflict-detection.ts`
  - `checkFieldConflict({ entityType, entityId, changedField, expectedTransactionId })`
  - Query activitiesTable for field's latest transaction

- [ ] **4.2** Create idempotency utilities
  - Location: `backend/src/lib/idempotency.ts`
  - `isTransactionProcessed()` - check activitiesTable
  - `getEntityByTransaction()` - lookup entity by transaction

- [ ] **4.3** Update page handlers for field-level sync
  - File: `backend/src/modules/pages/pages-handlers.ts`
  - Extract `{ data, sync }` from validated body
  - Check field conflict if `expectedTransactionId` provided
  - Set transient sync columns: `syncTransactionId`, `syncSourceId`, `syncChangedField`
  - Implement idempotency check
  - Return `{ data, sync }` wrapper in response

- [ ] **4.4** Apply same pattern to attachments handlers

### Phase 5: Stream endpoint & realtime sync

- [ ] **5.1** Create activity fetcher utility
  - Location: `backend/src/lib/stream/activity-fetcher.ts`
  - `fetchAndEnrichActivities({ orgId, cursor, entityTypes, memberships, userSystemRole })`
  - Uses `isPermissionAllowed()` for entity-level filtering (same pattern as `splitByAllowance`)
  - `getLatestActivityId(orgId)` - for `offset=now`
  - `enrichActivityWithEntity(activityId)` - fallback for oversized NOTIFY payloads

- [ ] **5.2** Add NOTIFY hook to CDC worker
  - Location: `cdc/src/handlers/activity-notify.ts`
  - Call `pg_notify('activity', payload)` after activity INSERT
  - Include entity data in payload (CDC has it from replication)
  - Handle 8KB limit: omit entity for oversized payloads

- [ ] **5.3** Create subscriber registry with permission checks
  - Location: `backend/src/lib/stream/subscriber-registry.ts`
  - Subscriber includes `memberships: MembershipBaseModel[]` and `userSystemRole`
  - `checkEntityAccess()` uses `isPermissionAllowed()` - same logic as REST handlers
  - Single LISTEN connection for `activity` channel
  - Fan-out with per-subscriber permission filtering

- [ ] **5.4** Create stream endpoint handler
  - Location: `backend/src/modules/streams/stream-handlers.ts`
  - Use Cella context helpers: `getContextUser`, `getContextOrganization`, `getContextMemberships`
  - Apply org guard middleware (same as REST endpoints)
  - Catch-up from offset, then register with subscriber registry

- [ ] **5.5** Add stream routes + OpenAPI schema
  - Location: `backend/src/modules/streams/stream-routes.ts`
  - Define route with `@hono/zod-openapi` (consistent with other modules)
  - Mount in `backend/src/routes.ts` with org guard
  - Initialize `subscriberRegistry` on server start

- [ ] **5.6** Create frontend stream hook
  - Location: `frontend/src/lib/sync/use-entity-stream.ts`
  - EventSource subscription with offset tracking
  - Update field transaction tracking from stream events
  - Apply events to React Query cache

- [ ] **5.7** Create cache update utilities
  - Location: `frontend/src/lib/sync/apply-event-to-cache.ts`
  - Handle create/update/delete for detail and list queries
  - Support infinite query data structure (same pattern as existing mutations)

- [ ] **5.8** Add transaction status UI indicators
  - Hook: `useTransactionStatus(transactionId)`
  - Visual states: pending spinner, syncing, confirmed checkmark, failed error
  - Confirm via stream event matching

### Phase 6: Offline enhancement (field-level)

- [ ] **6.1** Add field-level transaction tracking to offline executor
  - File: `frontend/src/modules/attachments/offline/executor.ts`
  - Include `transactionId`, `changedField` in persisted mutations
  - Same transaction ID across retries (idempotency)

- [ ] **6.2** Implement per-field mutation outbox
  - Location: `frontend/src/lib/sync/mutation-outbox.ts`
  - Queue mutations per field (not per entity)
  - **Squash same-field changes** (keep only latest value for each field)
  - Different fields queue separately
  - Include `changedField` and `expectedTransactionId` in each queued item

- [ ] **6.3** Implement upstream-first sync flow
  - On reconnect: pull latest from stream BEFORE pushing queued mutations
  - Detect conflicts between queued mutations and upstream changes
  - Mark conflicted mutations (same field changed server-side)

- [ ] **6.4** Create client-side conflict detection
  - Location: `frontend/src/lib/sync/conflict-detection.ts`
  - When stream event arrives, check for queued mutations on same field
  - Mark queued mutation as `conflicted` with server value
  - Mutation stays in queue until explicitly resolved

- [ ] **6.5** Create conflict resolution UI
  - Location: `frontend/src/modules/sync/conflict-dialog.tsx`
  - Show side-by-side: your value vs server value
  - Actions: Keep Mine (rebase), Keep Server (discard), Merge Manually
  - Badge indicator on entities with unresolved conflicts

- [ ] **6.6** Create rollback strategy
  - Individual rollback: remove single failed transaction
  - Cascade rollback: remove dependent transactions
  - Notify user of rollback with context

- [ ] **6.7** Add transaction log viewer (debug mode)
  - Enable via `VITE_DEBUG_MODE=true`
  - Show pending/confirmed/failed/conflicted transactions
  - Show activitiesTable entries for debugging

### Phase 7: Multi-tab coordination

- [ ] **7.1** Create tab coordinator
  - Location: `frontend/src/lib/sync/tab-coordinator.ts`
  - Leader election using Web Locks API
  - BroadcastChannel for cross-tab messaging
  - Heartbeat/lease renewal (handle background throttling)

- [ ] **7.2** Implement single-writer pattern
  - Only leader tab opens SSE connection
  - Leader broadcasts stream events to follower tabs
  - Followers apply broadcasts to their React Query cache

- [ ] **7.3** Handle leader handoff
  - Detect leader tab close/crash
  - New leader election with visibility preference (foreground wins)
  - Resume SSE from last known offset

- [ ] **7.4** Add leader status indicator (debug mode)
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

### Entity transient sync columns

Product entity tables have three transient columns for sync metadata:

```typescript
// In backend/src/db/schema/pages.ts (and other product entities)
export const pages = pgTable('pages', {
  // ... existing columns ...
  
  // Transient sync metadata (written by handler, read by CDC, overwritten on next mutation)
  syncTransactionId: varchar('sync_transaction_id', { length: 32 }),
  syncSourceId: varchar('sync_source_id', { length: 64 }),
  syncChangedField: varchar('sync_changed_field', { length: 64 }),
});
```

**Why "transient"?**
- Written by handler during mutation
- Read by CDC to populate activitiesTable
- Overwritten on next mutation (no history preserved on entity)
- Entity table is NOT the source of truth for sync state
- activitiesTable has complete field-level audit trail

**Why not permanent columns like `lastTransactionId`?**
- Entity-level tracking causes false conflicts (two users editing different fields)
- Field-level requires history: "what was the last transaction for THIS field?"
- That history lives in activitiesTable, queried via `checkFieldConflict()`

### Sync wrapper schema (replaces HTTP headers)

**Better DX**: Instead of custom HTTP headers, use typed `{ data, sync }` wrapper for mutations.

| Operation | Request | Response | Notes |
|-----------|---------|----------|-------|
| GET | Flat params | `Entity[]` / `Entity` | No sync - resolve conflicts client-side |
| POST/PATCH/DELETE | `{ data, sync }` | `{ data, sync }` | Server tracks transaction + source + changedField |
| Stream event | N/A | `{ data, sync }` | Includes sourceId, changedField for "is this mine?" |

**Sync metadata schemas:**

```typescript
// backend/src/modules/sync/schema.ts
export const syncRequestSchema = z.object({
  transactionId: z.string().describe('Unique mutation ID (client-generated)'),
  sourceId: z.string().describe('Tab/instance ID - origin of mutation'),
  changedField: z.string().describe('Which field this mutation changes'),
  expectedTransactionId: z.string().nullable().optional()
    .describe('Expected last transaction ID for this field (for conflict detection)'),
});

export const syncResponseSchema = z.object({
  transactionId: z.string().nullable(),
});

export const syncStreamEventSchema = z.object({
  transactionId: z.string().nullable(),
  sourceId: z.string().nullable(),
  changedField: z.string().nullable(),
  action: z.enum(['create', 'update', 'delete']),
  activityId: z.number().describe('Stream offset for resumption'),
});

// Factory functions for wrapping entity schemas
export const createSyncedMutationSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({ data: dataSchema, sync: syncRequestSchema.optional() });

export const createSyncedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({ data: dataSchema, sync: syncResponseSchema });

export const createStreamEventSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({ data: dataSchema.nullable(), sync: syncStreamEventSchema });
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
| Mutation source | Sent in `sync.sourceId`, stored in `lastSourceId` column |
| "Is this mine?" | Compare stream event's `sourceId` to your own |
| Leader election | Unique per tab, elect one leader via Web Locks |

**Why not userId?** We have `userId` for audit ("who"). `sourceId` is for sync ("which instance+browserTab").

### Transaction lifecycle states

```
┌──────────┐    onMutate     ┌──────────┐    API success    ┌──────────┐
│  (none)  │ ───────────────>│ pending  │ ─────────────────>│   sent   │
└──────────┘                 └──────────┘                   └──────────┘
                                  │                              │
                                  │ API error                    │ Stream event
                                  ▼                              ▼
                             ┌──────────┐                   ┌───────────┐
                             │  failed  │                   │ confirmed │
                             └──────────┘                   └───────────┘
```

### Conflict resolution strategy (field-level)

**Conflict reduction through two layers:**

- **Upstream-first sync**: Pull latest before pushing → 90%+ of conflicts avoided
- **Field-level LWW**: Different fields = no conflict → most remaining conflicts avoided

**When conflicts DO occur** (rare: same field edited during brief pull-push window):

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
// When stream event arrives, check for conflicts with queued mutations
function handleUpstreamEvent(event: StreamEvent) {
  const { entityId, changedField, transactionId, data } = event.sync;
  
  // Check if we have a queued mutation for this field
  const queued = outbox.find(m => 
    m.entityId === entityId && m.field === changedField
  );
  
  if (queued) {
    // Conflict! The field we wanted to change was modified server-side
    queued.status = 'conflicted';
    queued.conflict = {
      serverValue: data[changedField],
      serverTransactionId: transactionId,
    };
    // UI will show conflict indicator, mutation stays in queue until resolved
  }
  
  // Update field transaction tracking regardless
  setFieldTransactionId(entityId, changedField, transactionId);
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
WHERE transaction_id = $1 
LIMIT 1;

// Get full history for an entity
SELECT * FROM activities 
WHERE entity_type = 'page' AND entity_id = $1 
ORDER BY created_at;

// All activities by a source (debugging)
SELECT * FROM activities 
WHERE source_id = $1 
ORDER BY created_at DESC 
LIMIT 100;

// Recent activities for organization (activity feed)
SELECT * FROM activities 
WHERE organization_id = $1 
ORDER BY created_at DESC 
LIMIT 50;

// Find entity by transaction
SELECT entity_type, entity_id FROM activities 
WHERE transaction_id = $1 
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

**Problem**: Stream events arriving before initial LIST query completes can cause data regression:
1. User opens app, LIST query starts fetching
2. Stream connects with `offset=now`
3. Stream event arrives (newer data)
4. LIST response arrives (older snapshot!)
5. User sees data regress to older state

**Solution: Queue stream events during hydration**

```typescript
// frontend/src/lib/sync/use-entity-stream.ts
export function useEntityStream(orgIdOrSlug: string) {
  const queryClient = useQueryClient();
  const queuedEvents = useRef<StreamEvent[]>([]);
  const isHydrating = useRef(true);
  
  // Track when initial queries complete
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.status === 'success') {
        // Initial hydration complete, flush queued events
        if (isHydrating.current) {
          isHydrating.current = false;
          for (const queuedEvent of queuedEvents.current) {
            applyEventToCache(queryClient, queuedEvent);
          }
          queuedEvents.current = [];
        }
      }
    });
    return unsubscribe;
  }, [queryClient]);
  
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    if (isHydrating.current) {
      // Queue events during initial load
      queuedEvents.current.push(event);
      return;
    }
    applyEventToCache(queryClient, event);
  }, [queryClient]);
  
  // ... EventSource setup using handleStreamEvent
}
```

**Hydration Detection**: Use React Query's `isFetching` state or track first successful fetch per query key.

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
   * Check for conflicts when upstream event arrives.
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
1. Come online → Pull stream events (upstream-first)
2. For each event: check if queued mutation conflicts
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
│  │ "cella-sync"    │     (broadcasts stream events to all tabs)             │
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
   * Broadcast event to all tabs (leader only).
   */
  broadcast(event: StreamEvent): void {
    if (this.isLeader) {
      this.channel.postMessage(event);
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

- **Add schema columns** (non-breaking)
   - Add `lastTransactionId` VARCHAR column with default `null`
   - Add `lastSourceId` VARCHAR column with default `null`
   - Add index on `lastTransactionId`

- **Extend activitiesTable** (non-breaking)
   - Add `transactionId`, `sourceId` columns (nullable)
   - Add indexes

- **Update CDC handlers**
   - Extract transaction info when available
   - Backwards compatible: old rows without transactions still work

- **Update backend handlers incrementally**
   - Add sync wrapper `{ data, sync }` to tracked entity routes
   - Old clients need updating (breaking change for tracked entities)

- **Update frontend mutation hooks**
   - Add transaction tracking
   - Use sync wrapper in request/response

### For new product entities

Use the `createSyncedEntity` factory (Phase 7) or follow this checklist:

- Add `lastTransactionId` and `lastSourceId` columns to schema
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
  mode: 'rest' | 'stream';  // 'stream' = Transaction Stream SSE
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

To reduce polling latency from 500ms to near-instant:

```typescript
// Backend: CDC handler also does NOTIFY
await db.execute(sql`NOTIFY entity_changes, ${JSON.stringify({ 
  orgId, entityType, entityId, action, transactionId 
})}`);

// Stream endpoint uses LISTEN instead of polling
async function streamWithNotify(ctx, org, cursor, entityTypes) {
  const client = await pool.connect();
  await client.query('LISTEN entity_changes');
  
  return streamSSE(ctx, async (stream) => {
    client.on('notification', async (msg) => {
      const payload = JSON.parse(msg.payload);
      if (payload.orgId === org.id && 
          (!entityTypes || entityTypes.includes(payload.entityType))) {
        const entity = await fetchEntity(payload.entityType, payload.entityId);
        await stream.writeSSE({
          event: 'change',
          data: JSON.stringify({ ...payload, entity }),
        });
      }
    });
  });
}
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

| Feature | TinyBase | LiveStore | Electric | Proposed hybrid |
|---------|----------|-----------|----------|-----------------|
| Installation | npm package | npm package | npm + sidecar | Cella template |
| Data Model | Key-value + Tables | Event Sourcing | Shapes | CRUD + Transactions |
| Local Storage | IndexedDB / OPFS / SQLite | SQLite WASM | TanStack DB | IndexedDB (Dexie + RQ) |
| Sync Protocol | CRDT (MergeableStore) | Push/Pull events | HTTP shapes | Transaction Stream SSE |
| Offline Writes | ✅ Native CRDT | ✅ Eventlog | ❌ | ✅ Mutation outbox |
| Merge Location | Client only (CRDT) | Client only | Client only | Client + Server |
| Optimistic Updates | ✅ Reactive listeners | ✅ Automatic | ⚠️ Patterns | ✅ Transaction-tracked |
| Conflict Resolution | CRDT auto-merge, field-level | Rebase, upstream-first, event-level | LWW | LWW, field-level, upstream-first |
| Transaction Tracking | ⚠️ Checkpoints (local) | ✅ Full eventlog | ❌ | ✅ Per-operation (persisted) |
| Audit Trail | ❌ | ✅ Eventlog | ❌ | ✅ activitiesTable |
| CDC Integration | N/A | N/A | ❌ | ✅ PostgreSQL replication |
| Realtime Updates | ✅ WebSocket/Broadcast | ✅ | ✅ Shapes | ✅ SSE + NOTIFY |
| Multi-Tab Sync | ✅ BroadcastChannel | ✅ | ✅ | ✅ Leader election |
| Bundle Size | 5.4-12.1kB | ~50kB | ~30kB | ~5kB (hooks only) |
| React Integration | ✅ ui-react module | ✅ | ✅ TanStack | ✅ TanStack Query |
| Schema Validation | ✅ Built-in + Zod | ⚠️ | ⚠️ | ✅ Zod (OpenAPI) |
| Devtools | ✅ Inspector | ⚠️ | ⚠️ | ✅ React Query Devtools |
| Undo/Redo | ✅ Checkpoints | ✅ Eventlog | ❌ | ⚠️ Via activities |

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
- `mutationFn` receives the onMutate return and sends `{ data, sync }` wrapper
- Track transaction lifecycle: `pending` → `sent` → `confirmed` (via stream)

---

*This document will be updated as implementation progresses.*
