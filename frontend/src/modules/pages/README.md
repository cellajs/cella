# Pages Module - Sync & Offline Architecture

The pages module implements realtime sync and offline capabilities using TanStack DB + Electric SQL. This README documents the sync architecture; for the comprehensive pattern documentation, see the [attachments README](../attachments/README.md).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     React Components                         │
│              useLiveQuery / useSuspenseQuery                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              TanStack DB (pagesCollection)                   │
│            - Global collection (not per-org)                 │
│            - Reactive live queries                           │
└─────────────────────────────────────────────────────────────┘
          │                                       │
          ▼                                       ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│   Electric SQL Sync     │         │  Global Offline Executor │
│  (Realtime from server) │         │  (Mutation queue)        │
└─────────────────────────┘         └─────────────────────────┘
```

## File Structure

```
pages/
├── sync/
│   ├── collection.ts       # Electric collection setup
│   ├── query-bridge.ts     # React Query cache mirroring
│   └── use-offline-pages.ts # Offline mutation hook
├── table/
│   ├── columns.tsx         # DataGrid column definitions
│   ├── index.tsx           # PagesTable component
│   └── pages-bar.tsx       # Toolbar with create/delete actions
├── create-page-form.tsx    # Form for creating pages
├── update-page-form.tsx    # Form for editing pages
├── update-page.tsx         # Update page wrapper
├── view-page.tsx           # Page view component
├── delete-pages.tsx        # Delete confirmation dialog
├── query.ts                # React Query options
├── types.ts                # TypeScript types
└── utils/                  # Utility functions
```

## Key Differences from Attachments

| Aspect | Pages | Attachments |
|--------|-------|-------------|
| Collection scope | Global (single collection) | Per-organization |
| Hook props | None needed | Requires `organizationId` |
| File storage | None | Dexie for file blobs |
| Electric shape | Global shape | Per-org filtered shapes |

## Usage

### Collection Setup

```typescript
// The pages collection is global and cached
import { getPagesCollection } from './sync/collection';

const pagesCollection = getPagesCollection();
```

### Offline Mutations

```typescript
import { useOfflinePages } from './sync/use-offline-pages';

function MyComponent() {
  const { insertOffline, updateOffline, deleteOffline } = useOfflinePages();

  const handleCreate = () => {
    insertOffline({
      id: crypto.randomUUID(),
      entity: 'page',
      entityId: parentId,
      type: 'page',
      content: null,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      modifiedAt: new Date().toISOString(),
      modifiedBy: userId,
    });
  };
}
```

### Live Queries

```typescript
import { useLiveQuery } from '@tanstack/react-db';
import { getPagesCollection } from './sync/collection';

const pagesCollection = getPagesCollection();
const pages = useLiveQuery(pagesCollection.query().where('@entityId', '=', projectId));
```

## Global Offline Executor

Pages mutations are handled by the global offline executor at `~/query/global-executor.ts`. This executor:

- Persists pending mutations to IndexedDB
- Retries failed mutations when back online
- Shares the same outbox across all product entities

The hook `useOfflinePages()` requires no props because pages use a global collection:

```typescript
export const useOfflinePages = () => {
  const collection = getPagesCollection();
  
  return {
    insertOffline: (page: Page) => collection.insert(page),
    updateOffline: (id: string, updates: Partial<Page>) => collection.update({ id, ...updates }),
    deleteOffline: (id: string) => collection.delete(id),
    collection,
  };
};
```

## Query Bridge

The query bridge mirrors Electric sync data to React Query cache:

```typescript
// In component initialization
usePagesQueryBridge(pagesCollection, organizationId);
```

This enables:
- React Query cache invalidation on Electric sync updates
- Consistent data across both data layers
- SSR/hydration compatibility

## Related Documentation

- [Attachments README](../attachments/README.md) - Comprehensive sync/offline documentation
- [Global Executor](../../query/global-executor.ts) - Shared offline mutation executor
- [Offline Manager](../../query/offline-manager.ts) - Network status and executor lifecycle
