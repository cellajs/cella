# Offline mutation queue plan

> **Status**: Under consideration. Hybrid approach: creates/deletes in arrays, updates remain singular.

This document describes the offline mutation queue pattern using React Query's mutation cache. For the main sync engine architecture, see [HYBRID_SYNC_ENGINE_PLAN.md](./HYBRID_SYNC_ENGINE_PLAN.md).

## Design rationale

**Updates are different from creates/deletes:**
- Updates have field-level conflict detection (requires `expectedTransactionId` per field)
- Updates benefit from strong typing (specific entity schema)
- Updates are the most latency-sensitive (user is actively editing)
- Updates rarely need batching (except offline flush, handled separately)

**Creates/deletes are simpler:**
- No field-level conflicts (entity doesn't exist yet, or is being removed)
- Idempotent by nature (same ID = same result)
- Often batched (bulk import, multi-select delete)
- Less typing complexity (full entity or just ID)

**Key insight**: With upstream-first (pull before push), creates and deletes should **always succeed** if client is caught up. Conflicts only occur for concurrent updates to existing entities.

---

## Schema

### Creates: Array format

```typescript
// POST /sync/creates
interface CreateRequest {
  operations: CreateOperation[];
}

interface CreateOperation {
  entityType: RealtimeEntityType;
  entityId: string;              // Client-generated
  data: Record<string, unknown>; // Full initial entity data
  tx: TxRequest;                 // Includes transactionGroupId (same for all ops in batch)
}

interface CreateResponse {
  results: CreateResult[];
}

interface CreateResult {
  entityType: RealtimeEntityType;
  entityId: string;
  status: 'success' | 'duplicate' | 'error';
  data?: Entity;                 // Full entity on success
  tx: TxResponse;
  error?: { code: string; message: string };
}
```

**Idempotency**: If `entityId` already exists with same `transactionId`, return `duplicate` with existing entity (not an error).

### Deletes: Array format

```typescript
// POST /sync/deletes
interface DeleteRequest {
  operations: DeleteOperation[];
}

interface DeleteOperation {
  entityType: RealtimeEntityType;
  entityId: string;
  tx: TxRequest;                 // Includes transactionGroupId (same for all ops in batch)
}

interface DeleteResponse {
  results: DeleteResult[];
}

interface DeleteResult {
  entityType: RealtimeEntityType;
  entityId: string;
  status: 'success' | 'not_found' | 'error';
  tx: TxResponse;
  error?: { code: string; message: string };
}
```

**Idempotency**: If entity doesn't exist, return `not_found` (not an error). Client treats as success—entity is gone, which is the goal.

### Why `transactionGroupId` is client-generated at flush time

The `transactionGroupId` groups operations for SSE delivery—all creates/deletes in a batch arrive as one SSE message. It's generated **at flush time** (not per-mutation at creation time):

1. **Mutations accumulate over time** - User creates 3 pages over 10 minutes while offline
2. **Flush collects all pending** - On reconnect, all 3 are collected for one request
3. **Client generates `transactionGroupId`** - One ID for this flush, added to each operation's `tx`
4. **Server passes through to CDC** - Activities include the group ID, CDC buffers and delivers as batch

If assigned per-mutation at creation time, each would get a different group ID, resulting in 3 separate SSE messages instead of 1.

**TxRequest** (sent by client):
```typescript
interface TxRequest {
  transactionId: string;           // Per-operation, HLC format
  sourceId: string;                // Per-tab, stable
  transactionGroupId?: string;     // Per-flush, HLC format (optional for single updates)
  changedField?: string | null;    // For updates only
  expectedTransactionId?: string;  // For conflict detection
}
```

**Why client-generated?**
- Keeps `tx` schema consistent—client controls all transaction metadata
- Server stays stateless—just passes `transactionGroupId` through to activities
- Same HLC format as `transactionId` for consistency
- Optional for singular updates (no batching needed)

### Updates: Singular (unchanged from current)

```typescript
// PUT /page/{id} (existing pattern)
interface UpdateRequest {
  data: Partial<Entity>;         // Changed fields
  tx: TxRequest;                 // With expectedTransactionId for conflict detection
}

interface UpdateResponse {
  data: Entity;                  // Full updated entity
  tx: TxResponse;
}
```

Updates keep:
- Strong typing per entity
- Per-field conflict detection
- Simple request/response
- Existing mutation layer patterns

---

## Robustness guarantees

With upstream-first sync, creates and deletes are **non-conflicting** if client pulled before push:

| Operation | Scenario | Outcome |
|-----------|----------|---------|
| Create | Entity doesn't exist | ✅ Success |
| Create | Entity exists (same txId) | ✅ Duplicate (idempotent replay) |
| Create | Entity exists (different txId) | ⚠️ Race condition (very rare) |
| Delete | Entity exists | ✅ Success |
| Delete | Entity doesn't exist | ✅ Not found (treat as success) |
| Delete | Entity recreated after delete | N/A (client would see create in pull) |

**"Always proceed" semantics:**
- Creates: Insert if not exists, return existing if duplicate
- Deletes: Delete if exists, acknowledge if already gone
- No 409 conflicts for creates/deletes

**Updates remain conflict-aware** because:
- Two users can edit the same entity concurrently
- Field-level `expectedTransactionId` catches this
- Conflict resolution UI needed for real conflicts

---

## SSE: Server-side buffering at CDC

CDC Worker buffers operations by `transactionGroupId` before sending to API:

```
┌─────────────────────────────────────────────────────────────────┐
│ CDC Worker                                                       │
│                                                                  │
│  Logical Replication → Activity Insert                          │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ GroupBuffer                                              │    │
│  │                                                          │    │
│  │  grp_abc: [activity1, activity2, activity3]  (buffering) │    │
│  │  grp_xyz: [activity4]                        (buffering) │    │
│  │                                                          │    │
│  │  After 50ms of no new activities in group:               │    │
│  │  → Send batch to API via WebSocket                       │    │
│  │  → Clear buffer                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│         │                                                        │
│         ▼                                                        │
│  WebSocket.send({ transactionGroupId, activities: [...] })       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Buffer logic:**
```typescript
class GroupBuffer {
  private buffers = new Map<string, { activities: Activity[]; timer: NodeJS.Timeout }>();
  private readonly flushDelayMs = 50;

  add(activity: Activity) {
    const groupId = activity.tx?.transactionGroupId ?? 'ungrouped';
    
    let buffer = this.buffers.get(groupId);
    if (!buffer) {
      buffer = { activities: [], timer: null! };
      this.buffers.set(groupId, buffer);
    }
    
    // Reset timer on each new activity
    clearTimeout(buffer.timer);
    buffer.activities.push(activity);
    
    // Flush after 50ms of silence
    buffer.timer = setTimeout(() => this.flush(groupId), this.flushDelayMs);
  }
  
  private flush(groupId: string) {
    const buffer = this.buffers.get(groupId);
    if (!buffer) return;
    
    this.websocket.send({
      transactionGroupId: groupId === 'ungrouped' ? null : groupId,
      activities: buffer.activities
    });
    
    this.buffers.delete(groupId);
  }
}
```

**Why buffer at CDC, not API?**
- CDC already processes activities sequentially
- Single point of grouping logic
- API just fans out to SSE subscribers
- Simpler API (no buffering state)

---

## SSE format

```typescript
// SSE event data (always array, usually single item for updates)
interface StreamBatch {
  transactionGroupId: string | null;  // null for ungrouped single updates
  activities: StreamActivity[];
}

interface StreamActivity {
  action: 'create' | 'update' | 'delete';
  entityType: RealtimeEntityType;
  entityId: string;
  data: Entity | null;           // Full entity for create/update, null for delete
  field?: string;                // For updates: which field changed
  value?: unknown;               // For updates: new value
  activityId: number;            // Stream offset
  tx: TxStreamMessage;
  createdAt: string;
}
```

**Examples:**

Single update (ungrouped):
```typescript
data: {
  "transactionGroupId": null,
  "activities": [{
    "action": "update",
    "entityType": "page",
    "entityId": "pg_xyz",
    "data": { "id": "pg_xyz", "name": "Updated", ... },
    "field": "name",
    "value": "Updated",
    "activityId": 12345,
    "tx": { "transactionId": "tx-1", "sourceId": "tab-1" }
  }]
}
```

Batched creates (grouped):
```typescript
data: {
  "transactionGroupId": "grp_abc123",
  "activities": [
    { "action": "create", "entityType": "page", "entityId": "pg_1", "data": {...}, ... },
    { "action": "create", "entityType": "page", "entityId": "pg_2", "data": {...}, ... },
    { "action": "create", "entityType": "attachment", "entityId": "att_1", "data": {...}, ... }
  ]
}
```

---

## Endpoints summary

| Operation | Endpoint | Format | Conflicts? |
|-----------|----------|--------|------------|
| Create (batch) | `POST /sync/creates` | Array | No (idempotent) |
| Delete (batch) | `POST /sync/deletes` | Array | No (idempotent) |
| Update (single) | `PUT /{entityType}/{id}` | Object | Yes (field-level) |

---

## Frontend patterns: Mutation Cache as Queue

The offline queue leverages React Query's **mutation cache** as the pending operations store. Since the mutation cache is persisted to IndexedDB (via `persistQueryClientRestore`), pending operations survive browser restarts.

**Key insight**: Each pending operation is a paused mutation with a unique key. At flush time, we collect all paused mutations of a given type, extract their variables, and send a single batch request. The mutation cache provides persistence, retry logic, and DevTools visibility out of the box.

**Workaround note**: React Query doesn't officially support updating a mutation's variables after creation. We use `mutation.setState()` (undocumented but stable) plus `cache.notify()` to trigger persistence.

### Mutation key conventions

```typescript
// frontend/src/query/offline/pending-keys.ts

import type { RealtimeEntityType } from 'config';

/**
 * Unique mutation keys for pending operations.
 * Each pending op gets its own key so we can find/update it later.
 */
export const pendingMutationKeys = {
  // Individual pending creates (one mutation per entity)
  create: (entityType: RealtimeEntityType, entityId: string) =>
    ['pending', 'create', entityType, entityId] as const,

  // Individual pending deletes
  delete: (entityType: RealtimeEntityType, entityId: string) =>
    ['pending', 'delete', entityType, entityId] as const,

  // Individual pending updates (one per entity, not per field for simplicity)
  update: (entityType: RealtimeEntityType, entityId: string) =>
    ['pending', 'update', entityType, entityId] as const,

  // Flush mutations (the batch sends)
  flushCreates: ['sync', 'creates', 'flush'] as const,
  flushDeletes: ['sync', 'deletes', 'flush'] as const,
  flushUpdates: ['sync', 'updates', 'flush'] as const,
};

/**
 * Filter pattern for finding all pending mutations of a type.
 */
export const pendingFilters = {
  allCreates: { mutationKey: ['pending', 'create'], exact: false },
  allDeletes: { mutationKey: ['pending', 'delete'], exact: false },
  allUpdates: { mutationKey: ['pending', 'update'], exact: false },
};
```

### Types

```typescript
// frontend/src/query/offline/pending-types.ts

import type { RealtimeEntityType } from 'config';
import type { TxRequest } from '~/query/offline/hlc';

export interface PendingCreateVariables<TData = Record<string, unknown>> {
  entityType: RealtimeEntityType;
  entityId: string;
  data: TData;
  tx: TxRequest;
  createdAt: number;
}

export interface PendingDeleteVariables {
  entityType: RealtimeEntityType;
  entityId: string;
  tx: TxRequest;
  createdAt: number;
}

export interface PendingUpdateVariables<TData = Record<string, unknown>> {
  entityType: RealtimeEntityType;
  entityId: string;
  data: Partial<TData>;
  tx: TxRequest;
  createdAt: number;
}
```

### Core queue operations

```typescript
// frontend/src/query/offline/pending-queue.ts

import { type MutationCache, type QueryClient, type Mutation } from '@tanstack/react-query';
import type { RealtimeEntityType } from 'config';
import { pendingMutationKeys, pendingFilters } from './pending-keys';
import type { PendingCreateVariables, PendingDeleteVariables, PendingUpdateVariables } from './pending-types';
import { createId } from '~/lib/nanoid';
import type { TxRequest } from './hlc';

// ═══════════════════════════════════════════════════════════════════════════
// Workaround: Update mutation variables + trigger persistence
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update a mutation's variables and trigger cache persistence.
 * Uses undocumented but stable `setState()` + `cache.notify()`.
 */
const updateMutationVariables = <TVariables>(
  cache: MutationCache,
  mutation: Mutation<unknown, unknown, TVariables>,
  updater: (prev: TVariables) => TVariables,
): void => {
  const currentState = mutation.state;
  const newVariables = updater(currentState.variables as TVariables);
  
  // setState is internal but stable across RQ versions
  (mutation as unknown as { setState: (s: typeof currentState) => void }).setState({
    ...currentState,
    variables: newVariables,
  });
  
  // Trigger persistence by notifying the cache
  cache.notify({ type: 'updated', mutation });
};

// ═══════════════════════════════════════════════════════════════════════════
// Add pending operations (creates paused mutations)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add a pending create mutation (paused, won't execute until flush).
 */
export const addPendingCreate = <TData>(
  queryClient: QueryClient,
  entityType: RealtimeEntityType,
  entityId: string,
  data: TData,
  tx: TxRequest,
): void => {
  const cache = queryClient.getMutationCache();
  const variables: PendingCreateVariables<TData> = {
    entityType,
    entityId,
    data,
    tx,
    createdAt: Date.now(),
  };

  // Build a paused mutation (won't execute until we call execute())
  const mutation = cache.build(queryClient, {
    mutationKey: pendingMutationKeys.create(entityType, entityId),
    mutationFn: async () => {
      // Never called directly - flush collects variables and batches
      throw new Error('Individual creates should not execute - use flush');
    },
  });

  // Set initial state as paused with variables
  (mutation as unknown as { setState: (s: unknown) => void }).setState({
    ...mutation.state,
    variables,
    status: 'pending',
    isPaused: true,
  });

  cache.notify({ type: 'updated', mutation });
};

/**
 * Add a pending delete mutation.
 */
export const addPendingDelete = (
  queryClient: QueryClient,
  entityType: RealtimeEntityType,
  entityId: string,
  tx: TxRequest,
): void => {
  const cache = queryClient.getMutationCache();
  const variables: PendingDeleteVariables = {
    entityType,
    entityId,
    tx,
    createdAt: Date.now(),
  };

  const mutation = cache.build(queryClient, {
    mutationKey: pendingMutationKeys.delete(entityType, entityId),
    mutationFn: async () => {
      throw new Error('Individual deletes should not execute - use flush');
    },
  });

  (mutation as unknown as { setState: (s: unknown) => void }).setState({
    ...mutation.state,
    variables,
    status: 'pending',
    isPaused: true,
  });

  cache.notify({ type: 'updated', mutation });
};

/**
 * Add a pending update, or merge into pending create if entity not yet created.
 * Returns { merged: true } if merged, { merged: false } if queued as update.
 */
export const addPendingUpdate = <TData>(
  queryClient: QueryClient,
  entityType: RealtimeEntityType,
  entityId: string,
  data: Partial<TData>,
  tx: TxRequest,
): { merged: true } | { merged: false } => {
  const cache = queryClient.getMutationCache();

  // Check if this entity has a pending create
  const pendingCreate = cache.find({
    mutationKey: pendingMutationKeys.create(entityType, entityId),
  });

  if (pendingCreate && pendingCreate.state.isPaused) {
    // Entity not yet created on server → merge update into create data
    updateMutationVariables(cache, pendingCreate, (prev: PendingCreateVariables) => ({
      ...prev,
      data: { ...prev.data, ...data },
    }));
    return { merged: true };
  }

  // Entity exists on server → queue as separate update
  const variables: PendingUpdateVariables<TData> = {
    entityType,
    entityId,
    data,
    tx,
    createdAt: Date.now(),
  };

  // Check if there's already a pending update for this entity
  const existingUpdate = cache.find({
    mutationKey: pendingMutationKeys.update(entityType, entityId),
  });

  if (existingUpdate && existingUpdate.state.isPaused) {
    // Merge into existing pending update
    updateMutationVariables(cache, existingUpdate, (prev: PendingUpdateVariables) => ({
      ...prev,
      data: { ...prev.data, ...data },
      tx, // Use latest tx
    }));
  } else {
    // Create new pending update mutation
    const mutation = cache.build(queryClient, {
      mutationKey: pendingMutationKeys.update(entityType, entityId),
      mutationFn: async () => {
        throw new Error('Individual updates should not execute - use flush');
      },
    });

    (mutation as unknown as { setState: (s: unknown) => void }).setState({
      ...mutation.state,
      variables,
      status: 'pending',
      isPaused: true,
    });

    cache.notify({ type: 'updated', mutation });
  }

  return { merged: false };
};

// ═══════════════════════════════════════════════════════════════════════════
// Get pending operations (for flush)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all pending creates, optionally filtered by entity type.
 */
export const getPendingCreates = (
  queryClient: QueryClient,
  entityType?: RealtimeEntityType,
): PendingCreateVariables[] => {
  const cache = queryClient.getMutationCache();
  const mutations = cache.findAll(pendingFilters.allCreates);

  return mutations
    .filter(m => m.state.isPaused && m.state.variables)
    .map(m => m.state.variables as PendingCreateVariables)
    .filter(v => !entityType || v.entityType === entityType)
    .sort((a, b) => a.createdAt - b.createdAt);
};

/**
 * Get all pending deletes, optionally filtered by entity type.
 */
export const getPendingDeletes = (
  queryClient: QueryClient,
  entityType?: RealtimeEntityType,
): PendingDeleteVariables[] => {
  const cache = queryClient.getMutationCache();
  const mutations = cache.findAll(pendingFilters.allDeletes);

  return mutations
    .filter(m => m.state.isPaused && m.state.variables)
    .map(m => m.state.variables as PendingDeleteVariables)
    .filter(v => !entityType || v.entityType === entityType)
    .sort((a, b) => a.createdAt - b.createdAt);
};

/**
 * Get all pending updates, optionally filtered by entity type.
 */
export const getPendingUpdates = (
  queryClient: QueryClient,
  entityType?: RealtimeEntityType,
): PendingUpdateVariables[] => {
  const cache = queryClient.getMutationCache();
  const mutations = cache.findAll(pendingFilters.allUpdates);

  return mutations
    .filter(m => m.state.isPaused && m.state.variables)
    .map(m => m.state.variables as PendingUpdateVariables)
    .filter(v => !entityType || v.entityType === entityType)
    .sort((a, b) => a.createdAt - b.createdAt);
};

// ═══════════════════════════════════════════════════════════════════════════
// Remove completed operations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Remove successfully processed creates from mutation cache.
 */
export const removeSuccessfulCreates = (
  queryClient: QueryClient,
  successfulEntityIds: Set<string>,
): void => {
  const cache = queryClient.getMutationCache();
  const mutations = cache.findAll(pendingFilters.allCreates);

  for (const mutation of mutations) {
    const vars = mutation.state.variables as PendingCreateVariables | undefined;
    if (vars && successfulEntityIds.has(vars.entityId)) {
      cache.remove(mutation);
    }
  }
};

/**
 * Remove successfully processed deletes from mutation cache.
 */
export const removeSuccessfulDeletes = (
  queryClient: QueryClient,
  successfulEntityIds: Set<string>,
): void => {
  const cache = queryClient.getMutationCache();
  const mutations = cache.findAll(pendingFilters.allDeletes);

  for (const mutation of mutations) {
    const vars = mutation.state.variables as PendingDeleteVariables | undefined;
    if (vars && successfulEntityIds.has(vars.entityId)) {
      cache.remove(mutation);
    }
  }
};

/**
 * Remove a specific pending update by entity.
 */
export const removePendingUpdate = (
  queryClient: QueryClient,
  entityType: RealtimeEntityType,
  entityId: string,
): void => {
  const cache = queryClient.getMutationCache();
  const mutation = cache.find({
    mutationKey: pendingMutationKeys.update(entityType, entityId),
  });
  if (mutation) {
    cache.remove(mutation);
  }
};

/**
 * Check if an entity is pending creation.
 */
export const isPendingCreate = (
  queryClient: QueryClient,
  entityType: RealtimeEntityType,
  entityId: string,
): boolean => {
  const cache = queryClient.getMutationCache();
  const mutation = cache.find({
    mutationKey: pendingMutationKeys.create(entityType, entityId),
  });
  return !!mutation && mutation.state.isPaused;
};

/**
 * Get total count of all pending operations.
 */
export const getPendingCount = (queryClient: QueryClient): number => {
  const cache = queryClient.getMutationCache();
  const creates = cache.findAll(pendingFilters.allCreates).filter(m => m.state.isPaused);
  const deletes = cache.findAll(pendingFilters.allDeletes).filter(m => m.state.isPaused);
  const updates = cache.findAll(pendingFilters.allUpdates).filter(m => m.state.isPaused);
  return creates.length + deletes.length + updates.length;
};
```

### Flush hooks (array-formatted batch requests)

At flush time, we collect all paused mutations of each type, extract their variables, and send a single batch request.

```typescript
// frontend/src/query/offline/use-flush-pending.ts

import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { syncCreates, syncDeletes } from '~/api.gen';
import {
  getPendingCreates,
  getPendingDeletes,
  getPendingUpdates,
  removeSuccessfulCreates,
  removeSuccessfulDeletes,
  removePendingUpdate,
  pendingMutationKeys,
} from './pending-queue';
import type { PendingUpdateVariables } from './pending-types';
import { createTransactionId } from './hlc';

/**
 * Hook to flush all pending creates to the server.
 * Collects all paused create mutations → single POST /sync/creates with array.
 */
export const useFlushCreates = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: pendingMutationKeys.flushCreates,
    mutationFn: async () => {
      // 1. Collect all pending creates from mutation cache
      const pending = getPendingCreates(queryClient);
      if (pending.length === 0) return { results: [] };

      // 2. Generate transactionGroupId for this flush (same for all ops)
      const transactionGroupId = createTransactionId();

      // 3. Build array-formatted request body with shared transactionGroupId
      const operations = pending.map(op => ({
        entityType: op.entityType,
        entityId: op.entityId,
        data: op.data,
        tx: { ...op.tx, transactionGroupId },  // Add group ID to each op's tx
      }));

      // 4. Single batch request with array
      const result = await syncCreates({ body: { operations } });

      // 5. Remove successful creates from mutation cache
      //    (duplicates also count as success - idempotent)
      const successIds = new Set(
        result.results
          .filter(r => r.status === 'success' || r.status === 'duplicate')
          .map(r => r.entityId),
      );
      removeSuccessfulCreates(queryClient, successIds);

      return result;
    },
  });
};

/**
 * Hook to flush all pending deletes to the server.
 * Collects all paused delete mutations → single POST /sync/deletes with array.
 */
export const useFlushDeletes = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: pendingMutationKeys.flushDeletes,
    mutationFn: async () => {
      const pending = getPendingDeletes(queryClient);
      if (pending.length === 0) return { results: [] };

      // Generate transactionGroupId for this flush (same for all ops)
      const transactionGroupId = createTransactionId();

      const operations = pending.map(op => ({
        entityType: op.entityType,
        entityId: op.entityId,
        tx: { ...op.tx, transactionGroupId },  // Add group ID to each op's tx
      }));

      const result = await syncDeletes({ body: { operations } });

      // not_found counts as success (entity already gone = goal achieved)
      const successIds = new Set(
        result.results
          .filter(r => r.status === 'success' || r.status === 'not_found')
          .map(r => r.entityId),
      );
      removeSuccessfulDeletes(queryClient, successIds);

      return result;
    },
  });
};

/**
 * Hook to flush all pending updates to the server.
 * Updates are sent one at a time (singular format, may have conflicts).
 */
export const useFlushUpdates = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: pendingMutationKeys.flushUpdates,
    mutationFn: async () => {
      const pending = getPendingUpdates(queryClient);
      if (pending.length === 0) return { results: [] };

      const results: Array<{
        entityType: string;
        entityId: string;
        success: boolean;
        conflict?: unknown;
      }> = [];

      // Updates sent one at a time (not batched) for conflict detection
      for (const op of pending) {
        try {
          // PUT /{entityType}/{id} with singular format
          await updateEntityByType(op.entityType, op.entityId, op.data, op.tx);
          results.push({ entityType: op.entityType, entityId: op.entityId, success: true });
          removePendingUpdate(queryClient, op.entityType, op.entityId);
        } catch (err) {
          if (isConflictError(err)) {
            results.push({
              entityType: op.entityType,
              entityId: op.entityId,
              success: false,
              conflict: err.serverValue,
            });
            // Keep in mutation cache for conflict resolution UI
          } else {
            throw err; // Network error, stop flush
          }
        }
      }

      return { results };
    },
  });
};

/**
 * Hook to flush all pending operations on reconnect.
 * Order: creates → updates → deletes
 */
export const useFlushOnReconnect = () => {
  const flushCreates = useFlushCreates();
  const flushUpdates = useFlushUpdates();
  const flushDeletes = useFlushDeletes();

  useEffect(() => {
    const handleOnline = async () => {
      try {
        // Order matters: creates first (so updates can reference them)
        await flushCreates.mutateAsync();
        await flushUpdates.mutateAsync();
        await flushDeletes.mutateAsync();
      } catch (err) {
        console.error('Flush on reconnect failed:', err);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushCreates, flushUpdates, flushDeletes]);
};

/**
 * Hook to get total pending operations count (for UI badge).
 */
export const usePendingCount = () => {
  const queryClient = useQueryClient();
  return getPendingCount(queryClient);
};
```

### Entity-specific mutation hooks (example: page)

Each entity module uses the shared queue functions with entity-specific types:

```typescript
// frontend/src/modules/page/query.ts (relevant parts)

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addPendingCreate,
  addPendingUpdate,
  addPendingDelete,
} from '~/query/offline/pending-queue';
import { useFlushCreates, useFlushUpdates, useFlushDeletes } from '~/query/offline/use-flush-pending';
import { createOptimisticEntity, useMutateQueryData } from '~/query/basic';
import { createTxForCreate, createTxForUpdate, createTxForDelete } from '~/query/offline/hlc';

// ═══════════════════════════════════════════════════════════════════════════
// Page create mutation
// ═══════════════════════════════════════════════════════════════════════════

export const usePageCreateMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);
  const flushCreates = useFlushCreates();

  return useMutation({
    mutationKey: keys.create,
    mutationFn: async (data: CreatePageInput) => {
      const entityId = generateEntityId();
      const tx = createTxForCreate();

      // 1. Add paused mutation to mutation cache
      addPendingCreate(queryClient, 'page', entityId, data, tx);

      // 2. Optimistic update to entity query cache
      const optimisticPage = createOptimisticEntity(zPage, { ...data, id: entityId });
      mutateCache.create([optimisticPage]);

      // 3. Flush immediately if online (batch send)
      if (navigator.onLine) {
        await flushCreates.mutateAsync();
      }

      return { entityId, tx };
    },
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// Page update mutation (with merge-into-pending-create logic)
// ═══════════════════════════════════════════════════════════════════════════

export const usePageUpdateMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);
  const flushUpdates = useFlushUpdates();
  const flushCreates = useFlushCreates();

  return useMutation({
    mutationKey: keys.update,
    mutationFn: async ({ id, data }: { id: string; data: UpdatePageInput }) => {
      const tx = createTxForUpdate('page', id, data, pageTrackedFields);

      // 1. Add to queue (auto-merges if entity is pending create)
      const result = addPendingUpdate(queryClient, 'page', id, data, tx);

      // 2. Optimistic update to entity query cache
      const previousPage = findPageInListCache(id);
      if (previousPage) {
        mutateCache.update([{ ...previousPage, ...data, modifiedAt: new Date().toISOString() }]);
      }

      // 3. Flush immediately if online
      if (navigator.onLine) {
        if (result.merged) {
          // Merged into pending create - flush creates to send merged data
          await flushCreates.mutateAsync();
        } else {
          await flushUpdates.mutateAsync();
        }
      }

      return result;
    },
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// Page delete mutation
// ═══════════════════════════════════════════════════════════════════════════

export const usePageDeleteMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);
  const flushDeletes = useFlushDeletes();

  return useMutation({
    mutationKey: keys.delete,
    mutationFn: async (pages: Page[]) => {
      // Add paused delete mutations for each page
      for (const page of pages) {
        const tx = createTxForDelete();
        addPendingDelete(queryClient, 'page', page.id, tx);
      }

      // Optimistic remove from entity query cache
      mutateCache.remove(pages);

      // Flush immediately if online (batch send)
      if (navigator.onLine) {
        await flushDeletes.mutateAsync();
      }

      return { count: pages.length };
    },
  });
};
```

---

## Scenario walkthrough: 3 pending creates, edit one, add fourth

This scenario demonstrates the mutation cache pattern with array-formatted flush.

**Initial state** (user offline, 3 pages created):
```typescript
// Mutation cache has 3 paused mutations, each with unique key:
MutationCache: {
  ['pending', 'create', 'page', 'pg_1']: { 
    status: 'pending', isPaused: true,
    variables: { entityId: 'pg_1', data: { name: 'Page 1' }, tx: {...} }
  },
  ['pending', 'create', 'page', 'pg_2']: { 
    status: 'pending', isPaused: true,
    variables: { entityId: 'pg_2', data: { name: 'Page 2' }, tx: {...} }
  },
  ['pending', 'create', 'page', 'pg_3']: { 
    status: 'pending', isPaused: true,
    variables: { entityId: 'pg_3', data: { name: 'Page 3' }, tx: {...} }
  },
}

// Query cache has optimistic entities:
QueryCache['pages']: [
  { id: 'pg_1', name: 'Page 1', ... },
  { id: 'pg_2', name: 'Page 2', ... },
  { id: 'pg_3', name: 'Page 3', ... },
]
```

**User edits Page 2** → `addPendingUpdate` finds `pg_2` in pending creates:
```typescript
// 1. Find mutation by key
const mutation = cache.find({ mutationKey: ['pending', 'create', 'page', 'pg_2'] });
// Found! Entity still pending creation.

// 2. Merge update into create's variables (using setState workaround)
updateMutationVariables(cache, mutation, (prev) => ({
  ...prev,
  data: { ...prev.data, name: 'Updated Page 2' },  // ← Merged!
}));

// 3. Trigger persistence via cache.notify()

// Mutation cache now:
MutationCache: {
  ['pending', 'create', 'page', 'pg_1']: { variables: { data: { name: 'Page 1' } } },
  ['pending', 'create', 'page', 'pg_2']: { variables: { data: { name: 'Updated Page 2' } } },  // ← Updated!
  ['pending', 'create', 'page', 'pg_3']: { variables: { data: { name: 'Page 3' } } },
}

// No separate update mutation created - merged into existing create.
```

**User creates Page 4** → `addPendingCreate` adds new mutation:
```typescript
// Build new paused mutation
const mutation = cache.build(queryClient, {
  mutationKey: ['pending', 'create', 'page', 'pg_4'],
  mutationFn: async () => { throw new Error('Use flush'); },
});

// Set paused state with variables
mutation.setState({
  variables: { entityId: 'pg_4', data: { name: 'Page 4' }, tx: {...} },
  status: 'pending',
  isPaused: true,
});

// Trigger persistence
cache.notify({ type: 'updated', mutation });

// Mutation cache now has 4 paused create mutations:
MutationCache: {
  ['pending', 'create', 'page', 'pg_1']: { variables: { data: { name: 'Page 1' } } },
  ['pending', 'create', 'page', 'pg_2']: { variables: { data: { name: 'Updated Page 2' } } },
  ['pending', 'create', 'page', 'pg_3']: { variables: { data: { name: 'Page 3' } } },
  ['pending', 'create', 'page', 'pg_4']: { variables: { data: { name: 'Page 4' } } },  // ← New!
}
```

**User comes back online** → `useFlushOnReconnect` triggers flush:
```typescript
// useFlushCreates.mutateAsync() executes:

// 1. Collect all pending creates from mutation cache
const pending = getPendingCreates(queryClient);
// Returns 4 operations, sorted by createdAt

// 2. Generate transactionGroupId for this flush
const transactionGroupId = createTransactionId();  // e.g., 'grp_abc123'

// 3. Build array-formatted request body with shared transactionGroupId
const operations = [
  { entityType: 'page', entityId: 'pg_1', data: { name: 'Page 1' }, tx: {..., transactionGroupId} },
  { entityType: 'page', entityId: 'pg_2', data: { name: 'Updated Page 2' }, tx: {..., transactionGroupId} },
  { entityType: 'page', entityId: 'pg_3', data: { name: 'Page 3' }, tx: {..., transactionGroupId} },
  { entityType: 'page', entityId: 'pg_4', data: { name: 'Page 4' }, tx: {..., transactionGroupId} },
];

// 4. Single batch POST request
const result = await syncCreates({ body: { operations } });
// POST /sync/creates with 4 operations, all sharing same transactionGroupId

// 5. Server responds with results
result = {
  results: [
    { entityId: 'pg_1', status: 'success', data: {...}, tx: {...} },
    { entityId: 'pg_2', status: 'success', data: {...}, tx: {...} },
    { entityId: 'pg_3', status: 'success', data: {...}, tx: {...} },
    { entityId: 'pg_4', status: 'success', data: {...}, tx: {...} },
  ]
};

// 6. Remove successful mutations from cache
removeSuccessfulCreates(queryClient, new Set(['pg_1', 'pg_2', 'pg_3', 'pg_4']));

// Mutation cache is now empty (all creates processed):
MutationCache: {}
```

**Result**: Single network call with array of 4 creates, shared `transactionGroupId`, `pg_2` has merged data, all confirmed. ✅

---

## Why Mutation Cache as Queue works

| Concern | How Mutation Cache handles it |
|---------|-------------------------------|
| **Persistence** | Mutation cache persisted via `persistQueryClientRestore` |
| **Accumulation while offline** | Each create/delete is a paused mutation with unique key |
| **Edit pending create** | `cache.find()` by key, merge via `setState()` + `notify()` |
| **Optimistic updates** | Standard `setQueryData` on entity query cache (separate) |
| **Flush at send time** | `cache.findAll()` collects all paused mutations → array request |
| **Retry logic** | Flush mutation (not individual paused ones) uses RQ retry |
| **DevTools visibility** | Paused mutations visible in React Query DevTools |
| **Reusability** | Queue functions work across all entity modules |

---

## Key implementation notes

1. **Unique mutation keys** - Each pending op gets `['pending', type, entityType, entityId]` key
2. **Paused mutations** - Individual creates/deletes are paused (`isPaused: true`), never execute directly
3. **Flush mutation** - Separate mutation (`flushCreates`) collects variables and sends batch
4. **Variable updates** - Use `setState()` + `cache.notify()` workaround (undocumented but stable)
5. **Merge into pending create** - `addPendingUpdate` checks for existing create, merges if found
6. **Array format** - Creates/deletes use `POST /sync/{creates|deletes}` with `operations[]` array
7. **Singular format** - Updates remain `PUT /{entityType}/{id}` for conflict detection
8. **Ordering** - `createdAt` timestamp in variables ensures FIFO within each type
9. **Idempotency** - `duplicate` and `not_found` statuses treated as success

---

## File organization

```
frontend/src/query/offline/
├── pending-keys.ts        # Mutation key conventions, filter patterns
├── pending-types.ts       # PendingCreateVariables, etc.
├── pending-queue.ts       # Queue operations (add, get, remove, merge)
├── use-flush-pending.ts   # Flush hooks (creates, deletes, updates)
├── hlc.ts                 # Existing: HLC, sourceId, createTxForCreate, etc.
├── squash-utils.ts        # Existing: squashPendingMutation
└── field-transaction-store.ts  # Existing: field-level tx tracking

frontend/src/query/
├── basic.ts               # Existing: createEntityKeys, useMutateQueryData, etc.
└── mutation-registry.ts   # Existing: addMutationRegistrar

frontend/src/modules/page/
└── query.ts               # Entity-specific: usePageCreateMutation, etc.
                           # Uses functions from query/offline/pending-queue.ts
```

---

## Pros and cons

| Aspect | Pros | Cons |
|--------|------|------|
| **Type safety** | Updates keep strong typing per entity | Creates use `Record<string, unknown>` |
| **Conflict handling** | Updates have clear conflict path; creates/deletes never conflict | Two different patterns to understand |
| **Batching** | Creates/deletes batch naturally; updates stay simple | Three endpoints instead of one |
| **SSE grouping** | CDC buffering keeps API simple | CDC has more responsibility |
| **Robustness** | Creates/deletes always proceed (idempotent) | Must trust upstream-first guarantee |
| **Offline persistence** | Mutation cache already persisted | Uses `setState()` workaround (undocumented) |
| **React Query integration** | Everything stays in RQ ecosystem; visible in DevTools | Paused mutations are unconventional |
| **Debugging** | Mutations visible per-entity; batches have `transactionGroupId` | Mixed patterns in logs |

---

## Why this approach works

1. **Updates keep current pattern** - No migration for update logic, conflict detection, types
2. **Creates/deletes are naturally idempotent** - No conflict handling needed
3. **Clear separation** - Batch for bulk ops, singular for edits
4. **Client-generated `transactionGroupId`** - Generated at flush time, included in each op's `tx`, server passes through
5. **CDC handles SSE buffering** - Groups activities by `transactionGroupId`, delivers as single SSE batch
6. **Mutation Cache as Queue** - Individual paused mutations with unique keys, collected at flush
7. **Single source of truth** - React Query mutation cache holds pending ops, persisted automatically
8. **Array format on wire** - Single network call for creates/deletes, reduced overhead
9. **Merge optimization** - Edits to pending creates merge in-place, never create separate updates
