# Smart Prefetch Implementation Plan

This document describes the implementation of cursor-based delta sync for efficient offline prefetch.

## Overview

Implement a smart prefetch system that:
- Uses `modifiedAfter` on list endpoints for delta fetches
- Stores sync cursors per entity-type per organization
- Merges delta results into existing React Query list cache
- Integrates with SSE catch-up for seamless online/offline transition

## Prerequisites

- Soft delete implemented (see [SOFT_DELETE_IMPLEMENTATION.md](./SOFT_DELETE_IMPLEMENTATION.md))
- All realtime entities have `modifiedAt` column properly updated

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Smart Prefetch Flow                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. App starts with offlineAccess enabled                                   │
│     │                                                                       │
│     ▼                                                                       │
│  2. Load stored sync cursors from localStorage                              │
│     { attachment: { org1: "2024-01-15T10:30:00Z" }, ... }                   │
│     │                                                                       │
│     ▼                                                                       │
│  3. For each menu item (organization):                                      │
│     │                                                                       │
│     ├─── Has cursor? ───► Delta fetch: GET /attachments?modifiedAfter=X    │
│     │                     └─► Returns: items (incl. deleted), syncCursor    │
│     │                                                                       │
│     └─── No cursor? ────► Full fetch: GET /attachments (paginated)         │
│                           └─► Returns: all items, syncCursor                │
│     │                                                                       │
│     ▼                                                                       │
│  4. Merge results into React Query cache                                    │
│     - Update existing items                                                 │
│     - Add new items                                                         │
│     - Remove soft-deleted items from visible list                           │
│     │                                                                       │
│     ▼                                                                       │
│  5. Store new sync cursor                                                   │
│     │                                                                       │
│     ▼                                                                       │
│  6. Connect to SSE stream (AppStream)                                       │
│     - Live updates maintain cache                                           │
│     - On disconnect: cursor saved                                           │
│     - On reconnect: delta fetch from cursor                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Sync Cursor Storage

### 1.1 Create Sync Cursor Store

```typescript
// frontend/src/query/offline/sync-cursors.ts

import { config } from 'config';

const STORAGE_KEY = 'cella:sync-cursors';
const VERSION = 1;

/**
 * Sync cursor storage structure.
 * Tracks last successful sync timestamp per entity-type per organization.
 */
interface SyncCursorStore {
  version: number;
  // Per entity-type, per organization: ISO timestamp cursor
  cursors: Record<string, Record<string, string>>;
  // Last global sync timestamp
  lastSyncAt: string | null;
}

/** Get the entire sync cursor store. */
export function getSyncCursorStore(): SyncCursorStore {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return createEmptyStore();
    
    const parsed = JSON.parse(stored) as SyncCursorStore;
    if (parsed.version !== VERSION) return createEmptyStore();
    
    return parsed;
  } catch {
    return createEmptyStore();
  }
}

function createEmptyStore(): SyncCursorStore {
  return { version: VERSION, cursors: {}, lastSyncAt: null };
}

/** Save the sync cursor store. */
function saveSyncCursorStore(store: SyncCursorStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/**
 * Get sync cursor for a specific entity-type and organization.
 * Returns ISO timestamp string or null if no cursor exists.
 */
export function getEntitySyncCursor(
  entityType: string, 
  organizationId: string
): string | null {
  const store = getSyncCursorStore();
  return store.cursors[entityType]?.[organizationId] ?? null;
}

/**
 * Set sync cursor for a specific entity-type and organization.
 */
export function setEntitySyncCursor(
  entityType: string,
  organizationId: string, 
  cursor: string
): void {
  const store = getSyncCursorStore();
  
  if (!store.cursors[entityType]) {
    store.cursors[entityType] = {};
  }
  
  store.cursors[entityType][organizationId] = cursor;
  store.lastSyncAt = new Date().toISOString();
  
  saveSyncCursorStore(store);
}

/**
 * Clear all sync cursors.
 * Call on logout or when cache is cleared.
 */
export function clearSyncCursors(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get time since last sync in milliseconds.
 * Returns null if never synced.
 */
export function getTimeSinceLastSync(): number | null {
  const store = getSyncCursorStore();
  if (!store.lastSyncAt) return null;
  return Date.now() - new Date(store.lastSyncAt).getTime();
}
```

### 1.2 Clear Cursors on Logout

```typescript
// frontend/src/modules/auth/sign-out.tsx

import { clearSyncCursors } from '~/query/offline/sync-cursors';

export async function signOut() {
  // ... existing logout logic ...
  
  // Clear sync cursors
  clearSyncCursors();
  
  // ... rest of logout ...
}
```

---

## Phase 2: Update Query Options for Delta Fetch

### 2.1 Add Delta Fetch Mode to Query Options

```typescript
// frontend/src/modules/attachment/query.ts

import { getEntitySyncCursor, setEntitySyncCursor } from '~/query/offline/sync-cursors';

type AttachmentsListParams = Omit<NonNullable<GetAttachmentsData['query']>, 'limit' | 'offset'> & {
  orgIdOrSlug: string;
  limit?: number;
  /** ISO timestamp - fetch only items modified after this time */
  modifiedAfter?: string;
};

/**
 * Infinite query options to get a paginated list of attachments.
 * When modifiedAfter is provided, fetches delta (including soft-deleted items).
 */
export const attachmentsQueryOptions = (params: AttachmentsListParams) => {
  const { 
    orgIdOrSlug, 
    modifiedAfter,
    q = '', 
    sort = 'createdAt', 
    order = 'desc', 
    limit: baseLimit = attachmentsLimit 
  } = params;

  const limit = String(baseLimit);
  const keyFilters = { orgIdOrSlug, q, sort, order };
  const queryKey = keys.list.filtered(keyFilters);
  const baseQuery = { q, sort, order, limit };

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));

      const result = await getAttachments({
        path: { orgIdOrSlug },
        query: { 
          ...baseQuery, 
          offset,
          // Pass modifiedAfter for delta fetch
          modifiedAfter,
        },
        signal,
      });

      // Store sync cursor from response
      if (result.syncCursor) {
        setEntitySyncCursor('attachment', orgIdOrSlug, result.syncCursor);
      }

      return result;
    },
    ...baseInfiniteQueryOptions,
  });
};

/**
 * Delta fetch query options - fetches only modified items since cursor.
 * Used by prefetch service, not for regular UI queries.
 */
export const attachmentsDeltaQueryOptions = (orgIdOrSlug: string) => {
  const cursor = getEntitySyncCursor('attachment', orgIdOrSlug);
  
  return queryOptions({
    queryKey: ['attachment', 'delta', orgIdOrSlug, cursor],
    queryFn: async ({ signal }) => {
      // If no cursor, this shouldn't be called - use full fetch instead
      if (!cursor) {
        throw new Error('No sync cursor - use full fetch');
      }
      
      const result = await getAttachments({
        path: { orgIdOrSlug },
        query: { 
          modifiedAfter: cursor,
          limit: '1000',  // Large limit for delta
        },
        signal,
      });

      // Store new cursor
      if (result.syncCursor) {
        setEntitySyncCursor('attachment', orgIdOrSlug, result.syncCursor);
      }

      return result;
    },
    staleTime: 0,  // Always refetch
    gcTime: 0,     // Don't cache delta queries
  });
};
```

---

## Phase 3: List Cache Merge Utilities

### 3.1 Create Cache Merge Utility

```typescript
// frontend/src/query/offline/merge-delta.ts

import type { InfiniteData } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';

interface EntityWithId {
  id: string;
  deletedAt?: string | null;
  modifiedAt?: string | null;
}

interface ListResponse<T> {
  items: T[];
  total: number;
  syncCursor?: string | null;
}

/**
 * Merge delta results into an existing infinite query list cache.
 * 
 * - Updates existing items with newer versions
 * - Adds new items (preserving sort order)
 * - Keeps soft-deleted items in cache (UI filters them out)
 * 
 * @param queryKey - Query key for the list cache
 * @param deltaItems - Items from delta fetch (modifiedAfter query)
 * @param sortFn - Optional sort function to maintain list order
 */
export function mergeDeltaIntoListCache<T extends EntityWithId>(
  queryKey: readonly unknown[],
  deltaItems: T[],
  sortFn?: (a: T, b: T) => number,
): void {
  const existingData = queryClient.getQueryData<InfiniteData<ListResponse<T>>>(queryKey);
  
  if (!existingData || !existingData.pages.length) {
    // No existing cache - nothing to merge into
    // The next regular query will populate the cache
    return;
  }

  // Build a map of delta items by ID for quick lookup
  const deltaMap = new Map(deltaItems.map(item => [item.id, item]));
  
  // Track which delta items were updates vs new items
  const updatedIds = new Set<string>();
  
  // Update existing pages
  const updatedPages = existingData.pages.map(page => {
    const updatedItems = page.items.map(item => {
      const deltaItem = deltaMap.get(item.id);
      if (deltaItem) {
        updatedIds.add(item.id);
        return deltaItem;  // Replace with newer version
      }
      return item;
    });
    
    return { ...page, items: updatedItems };
  });
  
  // Find new items (in delta but not in existing cache)
  const newItems = deltaItems.filter(item => !updatedIds.has(item.id));
  
  // Add new items to first page (or appropriate location based on sort)
  if (newItems.length > 0) {
    const firstPage = updatedPages[0];
    let mergedItems = [...firstPage.items, ...newItems];
    
    // Sort if sort function provided
    if (sortFn) {
      mergedItems = mergedItems.sort(sortFn);
    }
    
    updatedPages[0] = {
      ...firstPage,
      items: mergedItems,
      total: firstPage.total + newItems.length,
    };
  }
  
  // Update the cache
  queryClient.setQueryData<InfiniteData<ListResponse<T>>>(queryKey, {
    ...existingData,
    pages: updatedPages,
  });
  
  console.debug(`[mergeDelta] Merged ${deltaItems.length} items (${updatedIds.size} updates, ${newItems.length} new)`);
}

/**
 * Get sort function for common sort fields.
 */
export function getSortFn<T extends EntityWithId>(
  sort: string,
  order: 'asc' | 'desc' = 'desc',
): (a: T, b: T) => number {
  return (a, b) => {
    const aVal = (a as Record<string, unknown>)[sort];
    const bVal = (b as Record<string, unknown>)[sort];
    
    if (aVal === bVal) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    
    const comparison = aVal < bVal ? -1 : 1;
    return order === 'desc' ? -comparison : comparison;
  };
}
```

### 3.2 Create Entity-Specific Merge Functions

```typescript
// frontend/src/modules/attachment/cache.ts

import type { Attachment } from '~/api.gen';
import { attachmentQueryKeys } from './query';
import { mergeDeltaIntoListCache, getSortFn } from '~/query/offline/merge-delta';

/**
 * Merge attachment delta into list cache.
 */
export function mergeAttachmentDelta(
  orgIdOrSlug: string,
  deltaItems: Attachment[],
  sort: string = 'createdAt',
  order: 'asc' | 'desc' = 'desc',
): void {
  const queryKey = attachmentQueryKeys.list.filtered({ 
    orgIdOrSlug, 
    q: '', 
    sort: sort as 'name' | 'createdAt' | 'contentType', 
    order,
  });
  
  mergeDeltaIntoListCache(
    queryKey,
    deltaItems,
    getSortFn<Attachment>(sort, order),
  );
}
```

---

## Phase 4: Smart Prefetch Service

### 4.1 Create Prefetch Service

```typescript
// frontend/src/query/offline/prefetch-service.ts

import { appConfig } from 'config';
import type { UserMenuItem } from '~/modules/me/types';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers';
import { 
  getEntitySyncCursor, 
  setEntitySyncCursor,
  getTimeSinceLastSync,
} from './sync-cursors';
import { queryClient } from '~/query/query-client';
import { offlineQueryConfig, waitFor } from '~/query/provider';

// Import entity-specific query options and merge functions
import { attachmentsQueryOptions, attachmentsDeltaQueryOptions } from '~/modules/attachment/query';
import { mergeAttachmentDelta } from '~/modules/attachment/cache';
// ... import for other realtime entities

/** Prefetch progress callback */
type ProgressCallback = (progress: { current: number; total: number; entityType: string }) => void;

/** One hour in milliseconds */
const ONE_HOUR = 60 * 60 * 1000;

/**
 * Smart prefetch service for offline mode.
 * 
 * Uses cursor-based delta sync to minimize bandwidth:
 * - If recently synced (< 1 hour), skip prefetch
 * - If has cursor, fetch only modified items (delta)
 * - If no cursor, fetch full list
 */
export async function smartPrefetch(options?: {
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}): Promise<void> {
  const { onProgress, signal } = options ?? {};
  
  // Skip if recently synced
  const timeSinceSync = getTimeSinceLastSync();
  if (timeSinceSync !== null && timeSinceSync < ONE_HOUR) {
    console.debug('[smartPrefetch] Recently synced, skipping');
    return;
  }
  
  // Get menu structure (context entities user has access to)
  const menu = await getMenuData();
  const menuItems = Object.values(menu).flat().filter(item => !item.membership.archived);
  
  let current = 0;
  const total = menuItems.length;
  
  for (const item of menuItems) {
    if (signal?.aborted) {
      console.debug('[smartPrefetch] Aborted');
      return;
    }
    
    current++;
    onProgress?.({ current, total, entityType: item.entityType });
    
    await prefetchForMenuItem(item, signal);
    await waitFor(200);  // Rate limiting
  }
  
  console.debug(`[smartPrefetch] Completed: ${current} menu items`);
}

/**
 * Prefetch data for a single menu item (organization).
 */
async function prefetchForMenuItem(
  item: UserMenuItem,
  signal?: AbortSignal,
): Promise<void> {
  const orgId = item.id;
  
  // Prefetch each realtime entity type
  for (const entityType of appConfig.realtimeEntityTypes) {
    if (signal?.aborted) return;
    
    await prefetchEntityType(entityType, orgId, signal);
  }
}

/**
 * Prefetch a specific entity type for an organization.
 * Uses delta fetch if cursor exists, full fetch otherwise.
 */
async function prefetchEntityType(
  entityType: string,
  orgId: string,
  signal?: AbortSignal,
): Promise<void> {
  const cursor = getEntitySyncCursor(entityType, orgId);
  
  try {
    if (cursor) {
      // Delta fetch mode
      await prefetchDelta(entityType, orgId, cursor, signal);
    } else {
      // Full fetch mode
      await prefetchFull(entityType, orgId, signal);
    }
  } catch (error) {
    console.warn(`[smartPrefetch] Failed to prefetch ${entityType} for ${orgId}:`, error);
    // Continue with other entities
  }
}

/**
 * Delta fetch: get only modified items and merge into cache.
 */
async function prefetchDelta(
  entityType: string,
  orgId: string,
  cursor: string,
  signal?: AbortSignal,
): Promise<void> {
  console.debug(`[smartPrefetch] Delta fetch: ${entityType} for ${orgId} since ${cursor}`);
  
  switch (entityType) {
    case 'attachment': {
      const result = await queryClient.fetchQuery({
        ...attachmentsDeltaQueryOptions(orgId),
        signal,
      });
      
      if (result.items.length > 0) {
        mergeAttachmentDelta(orgId, result.items);
      }
      break;
    }
    
    // Add cases for other realtime entity types
    case 'page': {
      // Similar pattern for pages
      break;
    }
  }
}

/**
 * Full fetch: get all items (paginated) into cache.
 */
async function prefetchFull(
  entityType: string,
  orgId: string,
  signal?: AbortSignal,
): Promise<void> {
  console.debug(`[smartPrefetch] Full fetch: ${entityType} for ${orgId}`);
  
  switch (entityType) {
    case 'attachment': {
      await queryClient.prefetchInfiniteQuery({
        ...attachmentsQueryOptions({ orgIdOrSlug: orgId }),
        ...offlineQueryConfig,
        signal,
      });
      break;
    }
    
    // Add cases for other realtime entity types
    case 'page': {
      // Similar pattern for pages
      break;
    }
  }
}
```

### 4.2 Update Query Provider

```typescript
// frontend/src/query/provider.tsx

import { smartPrefetch } from '~/query/offline/prefetch-service';

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUserStore();
  const { offlineAccess } = useUIStore();
  
  // ... existing code ...

  // Smart prefetch effect
  useEffect(() => {
    if (!offlineAccess || !user) return;

    const abortController = new AbortController();

    // Run smart prefetch
    smartPrefetch({
      signal: abortController.signal,
      onProgress: ({ current, total, entityType }) => {
        console.debug(`[Prefetch] ${current}/${total}: ${entityType}`);
      },
    }).catch(error => {
      if (error.name !== 'AbortError') {
        console.error('[Prefetch] Failed:', error);
      }
    });

    return () => {
      abortController.abort();
    };
  }, [offlineAccess, user]);

  // ... rest of component ...
}
```

---

## Phase 5: SSE Stream Integration

### 5.1 Update AppStream Catch-Up

Simplify SSE catch-up to provide sync state instead of individual notifications:

```typescript
// backend/src/modules/me/me-handlers.ts

.openapi(meRoutes.stream, async (ctx) => {
  const { offset, live } = ctx.req.valid('query');
  const user = getContextUser();
  const memberships = getContextMemberships();
  const orgIds = new Set(memberships.map((m) => m.organizationId));

  // Get sync state for the user
  const syncState = await getUserSyncState(user.id, orgIds);

  // Non-streaming: return sync state directly
  if (live !== 'sse') {
    return ctx.json(syncState);
  }

  // SSE streaming mode
  return streamSSE(ctx, async (stream) => {
    // 1. Send sync-state event (replaces catch-up notifications)
    await stream.writeSSE({
      event: 'sync-state',
      data: JSON.stringify(syncState),
      id: syncState.cursor,
    });

    // 2. Send offset marker
    await writeOffset(stream, syncState.cursor);

    // 3. Register subscriber for live updates
    // ... existing subscriber registration ...
  });
});
```

### 5.2 New Sync State Response

```typescript
// backend/src/modules/me/stream/fetch-data.ts

export interface SyncState {
  /** Latest activity cursor for reconnection */
  cursor: string | null;
  /** Per-entity-type per-org: latest modifiedAt timestamp */
  entities: Record<string, Record<string, string>>;
}

/**
 * Get sync state for a user.
 * Returns cursors that client can use for delta fetch.
 */
export async function getUserSyncState(
  userId: string,
  orgIds: Set<string>,
): Promise<SyncState> {
  const orgIdArray = Array.from(orgIds);
  
  // Get latest activity for cursor
  const latestActivity = await getLatestUserActivityId(userId, orgIds);
  
  // Get per-entity-type per-org latest modifiedAt
  const entities: Record<string, Record<string, string>> = {};
  
  for (const entityType of appConfig.realtimeEntityTypes) {
    entities[entityType] = {};
    
    // Query latest modifiedAt per org for this entity type
    const table = getEntityTable(entityType);
    if (!table) continue;
    
    const results = await db
      .select({
        organizationId: table.organizationId,
        latestModified: sql<string>`MAX(${table.modifiedAt})`,
      })
      .from(table)
      .where(inArray(table.organizationId, orgIdArray))
      .groupBy(table.organizationId);
    
    for (const row of results) {
      if (row.latestModified) {
        entities[entityType][row.organizationId] = row.latestModified;
      }
    }
  }
  
  return { cursor: latestActivity, entities };
}
```

### 5.3 Frontend: Handle Sync State Event

```typescript
// frontend/src/query/realtime/app-stream.tsx

interface SyncStateEvent {
  cursor: string | null;
  entities: Record<string, Record<string, string>>;
}

export function useAppStream(options: UseAppStreamOptions = {}): UseAppStreamReturn {
  // ... existing code ...

  // Handle sync-state event (new)
  const handleSyncState = useCallback((event: MessageEvent) => {
    try {
      const syncState = JSON.parse(event.data) as SyncStateEvent;
      
      // Compare with stored cursors to determine what needs fetching
      for (const [entityType, orgCursors] of Object.entries(syncState.entities)) {
        for (const [orgId, serverCursor] of Object.entries(orgCursors)) {
          const localCursor = getEntitySyncCursor(entityType, orgId);
          
          if (!localCursor || serverCursor > localCursor) {
            // Server has newer data - trigger delta fetch
            triggerDeltaFetch(entityType, orgId);
          }
        }
      }
      
      console.debug('[AppStream] Processed sync-state:', syncState);
    } catch (error) {
      console.debug('[AppStream] Failed to parse sync-state:', error);
    }
  }, []);

  // Add sync-state handler to SSE
  const { state, eventSourceRef, connect, disconnect, reconnect } = useSSEConnection({
    url: `${appConfig.backendUrl}/me/stream`,
    enabled,
    withCredentials: true,
    initialOffset,
    handlers: {
      change: (e) => handleSSENotificationRef.current(e),
      offset: (e) => handleOffsetRef.current(e),
      'sync-state': (e) => handleSyncState(e),  // New handler
    },
    onStateChange,
    debugLabel,
  });
  
  // ... rest of hook ...
}

/**
 * Trigger a delta fetch for an entity type.
 * Called when sync-state indicates server has newer data.
 */
function triggerDeltaFetch(entityType: string, orgId: string): void {
  switch (entityType) {
    case 'attachment':
      queryClient.fetchQuery(attachmentsDeltaQueryOptions(orgId))
        .then(result => {
          if (result.items.length > 0) {
            mergeAttachmentDelta(orgId, result.items);
          }
        })
        .catch(console.error);
      break;
    
    // Add cases for other entity types
  }
}
```

---

## Phase 6: UI Integration

### 6.1 Filter Soft-Deleted Items in Lists

```typescript
// frontend/src/modules/attachment/table/attachment-table.tsx

const visibleItems = useMemo(
  () => items.filter(item => !item.deletedAt),
  [items]
);
```

### 6.2 Prefetch Progress Indicator (Optional)

```typescript
// frontend/src/modules/common/prefetch-indicator.tsx

import { useEffect, useState } from 'react';
import { smartPrefetch } from '~/query/offline/prefetch-service';
import { useUIStore } from '~/store/ui';

export function PrefetchIndicator() {
  const offlineAccess = useUIStore(state => state.offlineAccess);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  
  useEffect(() => {
    if (!offlineAccess) {
      setProgress(null);
      return;
    }
    
    const controller = new AbortController();
    
    smartPrefetch({
      signal: controller.signal,
      onProgress: ({ current, total }) => {
        setProgress({ current, total });
      },
    }).then(() => {
      setProgress(null);
    });
    
    return () => controller.abort();
  }, [offlineAccess]);
  
  if (!progress) return null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-background border rounded-lg p-3 shadow-lg">
      <div className="text-sm text-muted-foreground">
        Syncing for offline: {progress.current}/{progress.total}
      </div>
      <div className="h-1 bg-muted rounded-full mt-2">
        <div 
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>
    </div>
  );
}
```

---

## Testing Checklist

### Delta Sync
- [ ] First fetch stores syncCursor
- [ ] Subsequent fetch with cursor returns only modified items
- [ ] Delta includes soft-deleted items
- [ ] Delta merge updates existing items in cache
- [ ] Delta merge adds new items to cache
- [ ] Soft-deleted items filtered out in UI

### SSE Integration
- [ ] sync-state event received on connect
- [ ] Delta fetch triggered when server cursor ahead
- [ ] Live updates continue to work
- [ ] Reconnect uses stored cursor

### Offline Mode
- [ ] Prefetch runs on offlineAccess enable
- [ ] Progress shown to user
- [ ] Prefetch skipped if recently synced
- [ ] Prefetch aborted on offlineAccess disable

### Edge Cases
- [ ] Empty delta (no changes) handled correctly
- [ ] Large delta (> 1000 items) paginated
- [ ] Network error during delta fetch
- [ ] Cursor corruption/reset

---

## Migration Notes

1. **Deploy soft delete first** - See [SOFT_DELETE_IMPLEMENTATION.md](./SOFT_DELETE_IMPLEMENTATION.md)
2. **Deploy backend changes** - modifiedAfter, syncCursor in responses
3. **Deploy frontend changes** - cursor storage, delta fetch, cache merge
4. **Monitor** - Watch for cache merge issues, cursor drift

---

## Future Enhancements

1. **Selective sync** - Allow users to choose which orgs to sync offline
2. **Background sync** - Use Service Worker for periodic delta sync
3. **Conflict indicators** - Show when local edits conflict with server
4. **Compression** - gzip for large delta responses
5. **Binary protocol** - Consider MessagePack for delta payloads
