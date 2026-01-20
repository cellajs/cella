# Attachments Module

The attachments module is the **core reference implementation** for offline-first, sync-enabled product entities in Cella. It showcases how to build a local-first experience using TanStack DB, TanStack Offline Transactions, and Electric Sync.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          React Components                           │
│              useLiveQuery (TanStack DB reactive queries)            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TanStack DB Collection                           │
│        (Reactive/Relational Layer with optimistic updates)          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
┌─────────────────────────────────┐       ┌─────────────────────────────┐
│      Electric SQL Sync          │       │    Global Offline Executor  │
│  (Real-time sync from server)   │       │  (Single executor for all   │
└─────────────────────────────────┘       │   entities, one outbox)     │
                                          └─────────────────────────────┘
                                                        │
                                                        ▼
                                          ┌─────────────────────────────┐
                                          │      REST API Mutations     │
                                          │   (Backend sync via Hono)   │
                                          └─────────────────────────────┘
```

## Key Concepts

### Universal Patterns (Apply to all product entities)

These patterns work for any product entity (pages, documents, etc.):

1. **Electric Collections** - Real-time sync from PostgreSQL using shape-streams
2. **TanStack DB** - Reactive queries with `useLiveQuery` for instant UI updates
3. **Global Offline Executor** - Single executor in `~/query/global-executor.ts` handles all entities
4. **Transaction Metadata** - Org context passed via `transaction.metadata` for per-org entities
5. **Optimistic Updates** - Immediate UI feedback while mutations are queued

### Attachment-Specific Patterns (File handling only)

These patterns are **specific to attachments** and should NOT be copied for other entities:

1. **Dexie File Storage** - Separate IndexedDB for caching actual file blobs
2. **Local Attachments Collection** - localStorage-based collection for offline-created files
3. **File Upload Sync** - Transloadit upload sync for offline-created files
4. **Cached Image Management** - Pre-fetching and caching of attachment files for offline access

## File Structure

```
attachments/
├── types.ts                # TypeScript types for attachments
├── helpers.ts              # General attachment helpers
├── utils.ts                # Utility functions
│
├── sync/                   # [UNIVERSAL] Sync, offline, and query bridge
│   ├── index.ts            # Barrel exports
│   ├── collections.ts      # TanStack DB + Electric collections
│   ├── use-offline-attachments.ts  # React hook for offline CRUD (uses global executor)
│   └── query-bridge.ts     # React Query cache mirroring for offline fallback
│
├── dexie/                  # [ATTACHMENT-SPECIFIC] File blob storage
│   ├── attachments-db.ts   # Dexie database schema
│   └── storage-service.ts  # File caching service
│
├── hooks/                  # [ATTACHMENT-SPECIFIC] File sync hooks
│   └── use-dexie-local-sync.tsx  # Sync offline-created files to server
│
├── dialog/                 # UI components for attachment dialogs
│   ├── index.tsx
│   ├── handler.tsx
│   └── lib.tsx
│
├── render/                 # File rendering components
│   ├── index.tsx
│   ├── image.tsx
│   ├── audio.tsx
│   ├── video.tsx
│   └── pdf.tsx
│
└── table/                  # Data table components
    ├── index.tsx
    ├── attachments-bar.tsx
    ├── attachments-columns.tsx
    └── preview/
```

## Core Components Explained

### 1. Collections (`sync/collections.ts`)

The collections file sets up TanStack DB collections with Electric sync:

```typescript
// UNIVERSAL PATTERN: Electric collection for real-time sync
const createAttachmentsCollectionImpl = (orgIdOrSlug: string) =>
  createCollection(
    electricCollectionOptions({
      id: `${orgIdOrSlug}-attachments`,
      schema: zAttachment,           // Zod schema from api.gen
      getKey: (item) => item.id,
      shapeOptions: {
        url: new URL(`/${orgIdOrSlug}/attachments/sync-attachments`, backendUrl).href,
        backoffOptions,              // Retry configuration
        fetchClient: clientConfig.fetch,
        columnMapper: snakeCamelMapper(),
        onError: handleSyncError,
      },
      // NOTE: No onInsert/onUpdate/onDelete callbacks!
      // Mutations go through the offline executor instead.
    }),
  );
```

**Key Design Decisions:**

- **No mutation callbacks on electric collections** - All CRUD operations go through the offline executor to avoid duplicate API calls
- **Collection caching** - Collections are cached by organization ID to maintain sync connections across route changes
- **Sync functions exported** - `syncCreateAttachments`, `syncUpdateAttachment`, `syncDeleteAttachments` are used by both collection callbacks and offline executor

### 2. Global Offline Executor (`~/query/global-executor.ts`)

All product entities share a **single global executor** for outbox-first persistence:

```typescript
// GLOBAL PATTERN: Single executor handles all entities
export const globalExecutor = startOfflineExecutor({
  collections: {
    pages: pagesCollection,  // Global entities registered at startup
    // Per-org entities (attachments) work via metadata
  },
  mutationFns: {
    // Page mutations
    createPage: async ({ transaction }) => { /* ... */ },
    updatePage: async ({ transaction }) => { /* ... */ },
    deletePages: async ({ transaction }) => { /* ... */ },
    
    // Attachment mutations (org from metadata)
    createAttachments: async ({ transaction }) => {
      const { orgIdOrSlug } = transaction.metadata as AttachmentMeta;
      await syncCreateAttachments(attachments, orgIdOrSlug);
    },
    updateAttachment: async ({ transaction }) => { /* ... */ },
    deleteAttachments: async ({ transaction }) => { /* ... */ },
  },
  // Multi-tab coordination
  onLeadershipChange: (isLeader) => { /* only one tab handles sync */ },
});
```

**Why a single global executor?**

- **No orphaned outboxes** - All mutations in one queue, processed together
- **No data loss on org switch** - Mutations from Org A aren't lost when navigating to Org B
- **Simpler coordination** - One leader election across all entities
- **One storage location** - Single IndexedDB for all offline transactions

**Per-org context via metadata:**

For entities scoped to an organization (like attachments), the org context is passed
via `transaction.metadata` when creating the transaction:

```typescript
// In useOfflineAttachments hook
const tx = globalExecutor.createOfflineTransaction({
  mutationFnName: 'createAttachments',
  metadata: { orgIdOrSlug: organizationId },  // Passed to mutation function
});
```

### 3. Offline Hook (`sync/use-offline-attachments.ts`)

React hook that wraps the global executor for attachment-specific operations:

```typescript
// UNIVERSAL PATTERN: Hook for offline-first CRUD
const { insertOffline, updateOffline, deleteOffline } = useOfflineAttachments({
  attachmentsCollection,
  organizationId,  // Passed to executor via transaction.metadata
});

// Insert with offline support
await insertOffline([newAttachment]);

// Update with offline support
await updateOffline(attachmentId, { name: 'New name' });

// Delete with offline support
await deleteOffline([attachmentId]);
```

The hook internally uses `globalExecutor.createOfflineTransaction()` with the
`organizationId` passed in the transaction metadata.

### 4. Dexie Storage (`dexie/`) - **ATTACHMENT-SPECIFIC**

⚠️ **This is specific to attachments and should NOT be copied for other entities.**

Attachments require storing actual file blobs alongside the database records:

```typescript
// ATTACHMENT-SPECIFIC: Dexie database for file blobs
export class AttachmentsDatabase extends Dexie {
  // Cached image files for offline access
  attachmentCache!: EntityTable<CachedAttachment, 'id'>;
  // Files queued for upload (created while offline)
  attachmentFiles!: EntityTable<AttachmentFile, 'id'>;
}
```

**Why separate storage?**

- Electric sync only handles metadata (id, name, url, etc.)
- Actual file blobs are too large for the sync layer
- Files need separate caching and upload strategies

### 5. Local Sync Hook (`hooks/use-dexie-local-sync.tsx`) - **ATTACHMENT-SPECIFIC**

⚠️ **This is specific to attachments and should NOT be copied for other entities.**

Handles syncing files that were created offline to the server:

```typescript
// ATTACHMENT-SPECIFIC: Sync offline-created files when back online
export const useDexieLocalSync = (organizationId: string) => {
  // When online, find files in Dexie that need uploading
  // Upload via Transloadit, then clean up local storage
};
```

## Usage Guide

### Basic Setup in a Route

```typescript
// In your route loader
export const attachmentsLoader = async ({ params }) => {
  const attachmentsCollection = initAttachmentsCollection(params.orgIdOrSlug);
  return { attachmentsCollection };
};

// In your component
const AttachmentsPage = () => {
  const { attachmentsCollection } = useLoaderData();
  
  // Real-time reactive query
  const { data: attachments } = useLiveQuery((db) => 
    db.attachments.orderBy('createdAt', 'desc').toArray()
  );
  
  // Offline-first mutations
  const { insertOffline, deleteOffline } = useOfflineAttachments({
    attachmentsCollection,
    organizationId,
  });
  
  return <AttachmentsTable data={attachments} onDelete={deleteOffline} />;
};
```

### Creating an Attachment Offline

```typescript
const handleUpload = async (files: File[]) => {
  // 1. Create attachment metadata
  const attachments = files.map(file => ({
    id: nanoid(),
    name: file.name,
    contentType: file.type,
    // ... other metadata
  }));
  
  // 2. Store file blobs in Dexie (ATTACHMENT-SPECIFIC)
  await attachmentStorage.addFiles(files, tokenQuery);
  
  // 3. Insert metadata via offline executor (UNIVERSAL)
  await insertOffline(attachments);
  
  // When online, use-dexie-local-sync will upload the files
};
```

## Comparison with Pages Module

The **pages** module uses the same universal patterns:

| Feature | Attachments | Pages |
|---------|-------------|-------|
| Electric Collection | ✅ Per-org | ✅ Global |
| TanStack DB Queries | ✅ | ✅ |
| Global Offline Executor | ✅ | ✅ |
| Query Bridge | ✅ | ✅ |
| Dexie File Storage | ✅ (files) | ❌ |
| Local Upload Sync | ✅ | ❌ |

**Key differences:**

- **Attachments are per-org** - Electric shapes scoped to org, org passed via metadata
- **Pages are global** - Single Electric shape for all pages, no org context needed
- **Attachments have file storage** - Dexie for blob caching, Transloadit for uploads

## Testing

Test files should cover:

1. **Collection initialization** - Verify caching and sync setup
2. **Offline executor** - Test queue persistence, retry logic, leader election
3. **Dexie storage** - Test file caching and cleanup
4. **Live queries** - Test reactive updates

## Consistency Checklist with Pages Module

The pages module follows the same patterns as attachments (minus file-specific logic). Current status:

### ✅ Consistent Patterns
- [x] Electric collection setup with `createCollection` + `electricCollectionOptions`
- [x] Collection caching to maintain sync connections
- [x] `useLiveQuery` for reactive data fetching
- [x] Zod schema validation from `api.gen`
- [x] Error handling with toaster notifications
- [x] Global offline executor for all mutations
- [x] Query bridge for React Query cache mirroring
- [x] Offline hooks (`useOfflinePages`, `useOfflineAttachments`)

### ⚠️ Differences (by design)
| Feature | Attachments | Pages | Reason |
|---------|-------------|-------|--------|
| Organization scoping | Per-org collections + metadata | Global collection | Pages are global, attachments are per-org |
| File storage | Dexie + localStorage collection | None | Pages don't have file blobs |
| Hook props | Requires `organizationId` | No props needed | Pages hook uses global collection directly |

## Code Quality Checklist

### Documentation
- [x] README with architecture overview
- [x] JSDoc comments on exported functions
- [x] Inline comments marking universal vs attachment-specific code
- [ ] Storybook stories for UI components

### Testing
- [ ] Unit tests for offline executor
- [ ] Unit tests for Dexie storage service
- [ ] Integration tests for sync scenarios
- [ ] E2E tests for offline workflows

### Error Handling
- [x] Sentry error capture in storage service
- [x] NonRetriableError for unrecoverable API errors
- [x] Toast notifications for user feedback
- [ ] Retry indicator in UI

## Future Improvements

- [ ] Unify offline executor pattern across all product entities
- [ ] Add conflict resolution for concurrent edits
- [ ] Implement garbage collection for stale cached files
- [ ] Add E2E tests for offline scenarios
- [ ] Document migration path when Electric Sync changes
- [ ] Create shared utility for offline executor setup
- [ ] Add sync status indicator component
- [ ] Implement React Query bridge for TanStack DB collections (see below)

---

## TanStack DB → React Query Bridge (Exploration)

### The Problem

TanStack DB synced data via Electric is not automatically persisted for offline reads. Currently:

1. **Electric browser cache** - Works for HTTP-level caching of already-fetched shapes
2. **TanStack DB collections** - Live queries are in-memory, not persisted to IndexedDB
3. **React Query persister** - Only works for REST API data, not synced collections

This creates a gap: users can view synced data while online, but lose access when offline unless the browser cache still has it.

### Use Cases for Bridge

1. **Single item access** - Get an attachment by ID for detail views (like `organizationQueryOptions(idOrSlug)`)
2. **Cross-module usage** - Access synced data from components outside the synced route
3. **True offline reads** - Persist synced data so it survives browser restarts
4. **Hybrid queries** - Combine synced data with other data sources

### Proposed Options

#### Option A: Mirror Collection to React Query Cache

Sync collection data to React Query on every update.

```tsx
// Pseudo-code concept
const useSyncToQueryCache = (collection: AttachmentsCollection, orgIdOrSlug: string) => {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    // Subscribe to collection changes
    const unsubscribe = collection.subscribe((items) => {
      // Mirror full list to React Query cache
      queryClient.setQueryData(
        attachmentQueryKeys.list.synced(orgIdOrSlug),
        items
      );
      
      // Also populate individual item cache for single lookups
      for (const item of items) {
        queryClient.setQueryData(
          attachmentQueryKeys.detail.byId(item.id),
          item
        );
      }
    });
    
    return unsubscribe;
  }, [collection, orgIdOrSlug]);
};
```

**Pros:**
- React Query persister automatically persists the mirrored data
- Single items accessible via `queryClient.getQueryData(keys.detail.byId(id))`
- Works with existing patterns (initialData, staleTime)

**Cons:**
- Dual storage (memory + IndexedDB)
- Must be careful about timing (don't mirror stale data over fresh)
- Collection subscription API may need exploration

#### Option B: Read-Through from Collection

Create query options that read from TanStack DB collection as the "source of truth".

```tsx
// Create query options that use collection as fetcher
export const attachmentQueryOptions = (id: string, collection: AttachmentsCollection) =>
  queryOptions({
    queryKey: attachmentQueryKeys.detail.byId(id),
    queryFn: async () => {
      // Try to get from collection first (instant, reactive)
      const item = collection.get(id);
      if (item) return item;
      
      // Fallback to API call if not in collection
      // (handles edge cases where collection isn't loaded yet)
      const response = await getAttachment({ path: { id } });
      return response;
    },
    // Seed from collection for instant display
    initialData: () => collection.get(id),
    staleTime: Infinity, // Collection handles freshness via sync
  });
```

**Pros:**
- No duplication of in-flight data
- Collection remains single source of truth while live
- Persisted version is fallback only

**Cons:**
- Need collection reference in component context
- Complex if collection isn't initialized yet

#### Option C: `useLiveQuery` with `findOne` + Query Bridge

TanStack DB has `findOne()` for single-item queries. Bridge that to React Query.

```tsx
// Hook that bridges live query to React Query
export const useAttachment = (id: string, collection: AttachmentsCollection) => {
  const queryClient = useQueryClient();
  
  // Live query for single item
  const { data: liveItem, isLoading } = useLiveQuery(
    (q) => q.from({ attachment: collection })
           .where(({ attachment }) => eq(attachment.id, id))
           .findOne(),
    [id]
  );
  
  // Mirror to React Query cache when data changes
  useEffect(() => {
    if (liveItem) {
      queryClient.setQueryData(attachmentQueryKeys.detail.byId(id), liveItem);
    }
  }, [liveItem, id]);
  
  return { data: liveItem, isLoading };
};
```

**Pros:**
- Uses TanStack DB's reactive `findOne`
- Automatically syncs to React Query for persistence
- Type-safe single item access

**Cons:**
- Need collection passed in or accessed via context

### Recommended Approach

**Option A + C Hybrid:**

1. **Create `query.ts`** for attachments (like organizations have)
2. **Add `attachmentQueryKeys`** for consistent cache keys
3. **Add `useSyncToQueryCache` hook** that mirrors collection to RQ on subscription
4. **Add `findAttachmentInSyncCache`** helper for single-item lookups
5. **Add `attachmentQueryOptions`** that uses `initialData` from synced cache

This gives us:
- Synced data persisted via existing React Query persister
- Single item access pattern consistent with `organizationQueryOptions`
- Collection remains the live source while active
- Persisted cache becomes fallback when offline

### Open Questions

1. **Collection subscription API** - ✅ Solved: Use `useLiveQuery` to subscribe reactively
2. **Sync timing** - ✅ Solved: Mirror on every change, dedupe with hash comparison
3. **Invalidation** - ✅ Solved: RQ cache is only used while offline; when online, useLiveQuery takes over directly
4. **Memory** - Acceptable trade-off: dual storage provides offline resilience

### Implementation Status

✅ **Implemented** - See [sync/query-bridge.ts](./sync/query-bridge.ts):
- `attachmentQueryKeys` - key factory using `createEntityKeys`
- `findAttachmentInSyncCache(id)` - lookup single items from RQ cache
- `useSyncToQueryCache(collection, orgIdOrSlug)` - bridge hook that mirrors collection to RQ
- `getPersistedAttachments(orgIdOrSlug)` - get cached data for offline fallback
- `useSyncedAttachments(collection, orgIdOrSlug)` - hook with automatic offline fallback
- `useSyncedAttachment(id, collection, orgIdOrSlug)` - single item with offline fallback

### Usage Examples

**Mirroring (run once in your table/route component):**
```tsx
// In AttachmentsTable - mirrors all synced data to RQ cache
useSyncToQueryCache(attachmentsCollection, entity.slug);
```

**List with offline fallback:**
```tsx
const { data, isOfflineFallback, isOnline } = useSyncedAttachments(collection, orgIdOrSlug);

// Show indicator when using cached data
{isOfflineFallback && <Badge variant="warning">Offline - cached data</Badge>}

// data is: live data (online) OR persisted cache (offline)
```

**Single item with offline fallback:**
```tsx
const { data: attachment, isOfflineFallback } = useSyncedAttachment(id, collection, orgIdOrSlug);

if (!attachment) return <NotFound />;
```

### References

- TanStack DB Issue [#865](https://github.com/TanStack/db/issues/865) - Persistence discussion
- TanStack Query [Persist Client](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient)
- Cella `organizationQueryOptions` pattern in [organizations/query.ts](../organizations/query.ts)

## Related Documentation

- [TanStack DB](https://tanstack.com/db/latest)
- [TanStack Offline Transactions](https://tanstack.com/offline-transactions/latest)
- [Electric SQL](https://electric-sql.com/)
- [Dexie.js](https://dexie.org/)
- [Cella Architecture](../../../../info/ARCHITECTURE.md)
