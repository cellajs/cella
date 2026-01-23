# Stream Infrastructure Refactoring Plan

**Status: Implemented**

A lightweight approach to make stream helpers more composable using Option D (dumb container) with indexed lookup for performance.

## What Was Built

### New `lib/stream/` Infrastructure

```
backend/src/lib/stream/
├── index.ts              # Exports
├── types.ts              # BaseStreamSubscriber interface
├── subscriber-manager.ts # Indexed subscriber manager
└── helpers.ts            # writeChange, writeOffset, keepAlive
```

**Key design:** Manager is a dumb container with optional indexing. All routing/filtering logic lives in module handlers.

### Refactored `modules/sync/`

```
backend/src/modules/sync/
├── stream-types.ts       # OrgStreamSubscriber, orgIndexKey()
├── stream-router.ts      # shouldReceiveOrgEvent(), routeToOrgSubscribers()
├── sync-handlers.ts      # Route handler (uses composable functions)
├── sync-routes.ts        # OpenAPI route definition
└── schema.ts             # Stream message schema
```

---

## Architecture

### Subscriber Manager (lib/stream)

Minimal manager with optional indexing for O(1) lookup:

```typescript
interface BaseStreamSubscriber {
  id: string;
  stream: SSEStreamingApi;
  indexKey?: string;  // Optional - handler decides the key format
}

class StreamSubscriberManager {
  private subscribers = new Map<string, BaseStreamSubscriber>();
  private byIndex = new Map<string, Set<string>>();

  register<T extends BaseStreamSubscriber>(subscriber: T): void;
  unregister(id: string): void;
  getByIndex<T>(key: string): T[];  // O(1) lookup
  getAll<T>(): T[];                 // For broadcasts
}
```

### Composable Routing Functions (modules/sync)

Pure functions that handlers compose:

```typescript
// Filter function - all org-scoped logic in one place
function shouldReceiveOrgEvent(subscriber: OrgStreamSubscriber, event: ActivityEvent): boolean {
  if (event.organizationId !== subscriber.orgId) return false;
  if (subscriber.cursor && event.id <= subscriber.cursor) return false;
  // ... entity type filter, permission check
  return allowed;
}

// Routing function - uses indexed lookup
async function routeToOrgSubscribers(event: ActivityEvent): Promise<void> {
  const subscribers = streamSubscriberManager.getByIndex<OrgStreamSubscriber>(`org:${event.organizationId}`);
  for (const subscriber of subscribers) {
    if (shouldReceiveOrgEvent(subscriber, event)) {
      await sendToOrgSubscriber(subscriber, event);
    }
  }
}
```

### SSE Helpers (lib/stream)

Small utilities for SSE operations:

```typescript
writeChange(stream, id, data)   // Write change event
writeOffset(stream, cursor)     // Write offset marker
keepAlive(stream, intervalMs)   // Keep-alive loop
```

---

## How To Add a New Stream Type

### Example: Public Pages Stream

1. **Define subscriber type:**
```typescript
// modules/pages/public-stream-types.ts
interface PublicPageSubscriber extends BaseStreamSubscriber {
  cursor: string | null;
}

function publicPageIndexKey(): string {
  return 'public:page';
}
```

2. **Create filter function:**
```typescript
// modules/pages/public-stream-router.ts
function shouldReceivePublicPageEvent(subscriber: PublicPageSubscriber, event: ActivityEvent): boolean {
  if (event.entityType !== 'page') return false;
  if (subscriber.cursor && event.id <= subscriber.cursor) return false;
  return true;  // No permission check - it's public
}
```

3. **Create routing function:**
```typescript
async function routeToPublicPageSubscribers(event: ActivityEvent): Promise<void> {
  const subscribers = streamSubscriberManager.getByIndex<PublicPageSubscriber>('public:page');
  for (const subscriber of subscribers) {
    if (shouldReceivePublicPageEvent(subscriber, event)) {
      await writeChange(subscriber.stream, event.id, buildPublicPageMessage(event));
      subscriber.cursor = event.id;
    }
  }
}
```

4. **Register ActivityBus listener:**
```typescript
eventBus.on('page.created', routeToPublicPageSubscribers);
eventBus.on('page.updated', routeToPublicPageSubscribers);
eventBus.on('page.deleted', routeToPublicPageSubscribers);
```

5. **Create route handler:**
```typescript
pagesRouteHandlers.openapi(pagesRoutes.publicStream, async (ctx) => {
  const { offset, live } = ctx.req.valid('query');
  // ... catch-up, then:
  
  return streamSSE(ctx, async (stream) => {
    // Send catch-up...
    
    const subscriber: PublicPageSubscriber = {
      id: nanoid(),
      indexKey: 'public:page',
      stream,
      cursor,
    };
    
    streamSubscriberManager.register(subscriber);
    stream.onAbort(() => streamSubscriberManager.unregister(subscriber.id));
    await keepAlive(stream);
  });
});
```

---

## Design Principles

1. **Manager is dumb** - just stores subscribers with optional indexing
2. **Handlers own all logic** - filtering, permissions, message building
3. **Composable functions** - `shouldReceive*()`, `routeTo*()`, `sendTo*()`
4. **No config/schema** - uses existing Cella primitives (memberships, permissions)
5. **Index key convention** - handler decides format (e.g., `org:${id}`, `public:page`)

---

## Files Changed

| File | Change |
|------|--------|
| `lib/stream/index.ts` | Created - exports |
| `lib/stream/types.ts` | Created - BaseStreamSubscriber |
| `lib/stream/subscriber-manager.ts` | Created - indexed manager |
| `lib/stream/helpers.ts` | Created - writeChange, writeOffset, keepAlive |
| `modules/sync/stream-types.ts` | Created - OrgStreamSubscriber |
| `modules/sync/stream-router.ts` | Created - composable routing functions |
| `modules/sync/sync-handlers.ts` | Refactored - uses new infrastructure |
| `modules/sync/stream-subscriber-manager.ts` | Deleted - replaced by lib/stream |
