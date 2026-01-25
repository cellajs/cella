# Migration plan: Unified user stream

> **Status**: Complete ✅  
> **Created**: January 2025  
> **Updated**: January 2026  
> **Scope**: Merge org-scoped stream into user stream for unified realtime + full offline support

## Summary

Replace the **org-scoped** stream (`/organizations/:orgId/sync/stream`) with a **unified user stream** (`/me/stream`) that handles ALL realtime events for the user:
- Membership events (user's own memberships)
- Organization events (orgs user belongs to)
- Product entity events (pages, attachments in user's orgs)

This enables full offline access: prefetch populates the cache via REST, stream keeps it updated in realtime.

## Key architecture decisions

### Prefetch handles historical data, stream is realtime-only

| Concern | Handled by |
|---------|-----------|
| Initial data population | Prefetch script via REST endpoints |
| Historical catch-up | Prefetch (not stream) |
| Realtime updates | User stream with `offset: 'now'` |

**Implication**: No catch-up logic needed in stream. Always start from `'now'`.

### Multi-channel subscriber routing

Subscribers register on multiple **channels** for O(1) event routing:

```
┌─────────────────────────────────────────────────────────────────┐
│              StreamSubscriberManager (channels)                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  user:alice  ──▶ [subscriber-1]           (membership)  │    │
│  │  org:acme    ──▶ [subscriber-1, sub-2]    (entities)    │    │
│  │  org:globex  ──▶ [subscriber-1]           (entities)    │    │
│  │  user:bob    ──▶ [subscriber-2]           (membership)  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

- **User channel** (`user:{userId}`): Receives membership events for that user
- **Org channel** (`org:{orgId}`): Receives product entity events for that org

### Permission checks reused

The existing `canReceiveOrgEvent` logic from `entities/stream/can-receive.ts` is reused for filtering product entity events. Subscriber stores memberships for ACL checks.

### Out of scope

- **Dynamic membership changes**: If user is added to new org while stream is active, they won't receive events for that org until reconnect. Frontend should reconnect stream when membership changes are received.
- **Prefetch timing coordination**: Assumes prefetch completes before stream connects. No hydration barrier needed.

## Current state (what exists)

### Org-scoped stream (to be removed)

| Component | Location |
|-----------|----------|
| `useLiveStream` | `frontend/src/query/realtime/use-live-stream.ts` |
| `handleStreamMessage` | `frontend/src/query/realtime/stream-message-handler.ts` |
| Stream in org routes | `frontend/src/routes/organization-routes.tsx` |
| `/organizations/:orgId/sync/stream` | `backend/src/modules/entities/entities-handlers.ts` |
| `entities/stream/` | `backend/src/modules/entities/stream/` |
| Hydration barrier | `frontend/src/query/realtime/hydrate-barrier.ts` |
| Tab coordinator | `frontend/src/query/realtime/tab-coordinator.ts` |

### User stream (already exists, to be extended)

| Component | Location |
|-----------|----------|
| `useUserStream` | `frontend/src/query/realtime/use-user-stream.ts` |
| `handleUserStreamMessage` | `frontend/src/query/realtime/user-stream-handler.ts` |
| `/me/stream` | `backend/src/modules/me/me-handlers.ts` |
| `me/stream/` | `backend/src/modules/me/stream/` |

## Target architecture

### Backend: Multi-channel subscriber manager

```typescript
// backend/src/sync/stream/subscriber-manager.ts
class StreamSubscriberManager {
  private subscribers = new Map<string, BaseStreamSubscriber>();
  private byChannel = new Map<string, Set<string>>();

  /**
   * Register subscriber on multiple channels for event routing.
   * Primary channel stored on subscriber, additional channels for product entities.
   */
  register<T extends BaseStreamSubscriber>(subscriber: T, additionalChannels: string[] = []): void {
    this.subscribers.set(subscriber.id, subscriber);

    const allChannels = [subscriber.channel, ...additionalChannels].filter(Boolean) as string[];
    for (const channel of allChannels) {
      let set = this.byChannel.get(channel);
      if (!set) {
        set = new Set();
        this.byChannel.set(channel, set);
      }
      set.add(subscriber.id);
    }
    
    // Store all channels for cleanup
    (subscriber as any)._channels = allChannels;
  }

  unregister(id: string): void {
    const subscriber = this.subscribers.get(id);
    if (!subscriber) return;

    const allChannels = (subscriber as any)._channels ?? [subscriber.channel];
    for (const channel of allChannels) {
      const set = this.byChannel.get(channel);
      if (set) {
        set.delete(id);
        if (set.size === 0) this.byChannel.delete(channel);
      }
    }

    this.subscribers.delete(id);
  }

  /**
   * Get subscribers on a channel - O(1) lookup.
   */
  getByChannel<T extends BaseStreamSubscriber>(channel: string): T[] {
    const ids = this.byChannel.get(channel);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.subscribers.get(id) as T)
      .filter(Boolean);
  }
}
```

### Backend: Unified UserStreamSubscriber

```typescript
// backend/src/modules/me/stream/types.ts
export interface UserStreamSubscriber extends CursoredSubscriber {
  userId: string;
  orgIds: Set<string>;
  /** User's system role for permission bypass */
  userSystemRole: SystemRole | 'user';
  /** Memberships for permission checks on product entities */
  memberships: MembershipBaseModel[];
}

/** Channel key for user-specific events (memberships). */
export function userChannel(userId: string): string {
  return `user:${userId}`;
}

/** Channel key for org-specific events (product entities). */
export function orgChannel(orgId: string): string {
  return `org:${orgId}`;
}
```

### Backend: `/me/stream` handler (simplified)

```typescript
.openapi(meRoutes.stream, async (ctx) => {
  const user = getContextUser();
  const memberships = getContextMemberships();
  const orgIds = new Set(memberships.map(m => m.organizationId));

  // Always start from now - prefetch handles historical data
  const cursor = await getLatestActivityId();

  return streamSSE(ctx, async (stream) => {
    // Send offset marker immediately (no catch-up)
    await writeOffset(stream, cursor);

    const subscriber: UserStreamSubscriber = {
      id: nanoid(),
      channel: userChannel(user.id),
      stream,
      userId: user.id,
      orgIds,
      userSystemRole: getContextUserSystemRole(),
      memberships,
      cursor,
    };

    // Register on user channel + all org channels
    // NOTE: If user is added to new org while connected, they won't receive
    // events for that org until reconnect. Frontend should handle this by
    // reconnecting when membership.created is received.
    const orgChannels = [...orgIds].map(orgId => orgChannel(orgId));
    streamSubscriberManager.register(subscriber, orgChannels);

    stream.onAbort(() => streamSubscriberManager.unregister(subscriber.id));
    await keepAlive(stream);
  });
});
```

### Backend: Unified event routing

```typescript
// All realtime events route through unified dispatcher
const allRealtimeEvents = [
  // Product entities
  'page.created', 'page.updated', 'page.deleted',
  'attachment.created', 'attachment.updated', 'attachment.deleted',
  // Context entities  
  'organization.updated', 'organization.deleted',
  // Resources
  'membership.created', 'membership.updated', 'membership.deleted',
] as const;

for (const eventType of allRealtimeEvents) {
  eventBus.on(eventType, async (event) => {
    await dispatchToUserSubscribers(event);
  });
}

async function dispatchToUserSubscribers(event: ActivityEventWithEntity): Promise<void> {
  // Membership events: route by userId (the user being affected)
  if (event.resourceType === 'membership') {
    const userId = event.entity?.userId as string;
    if (!userId) return;
    
    const subscribers = streamSubscriberManager.getByChannel<UserStreamSubscriber>(userChannel(userId));
    for (const sub of subscribers) {
      await sendToSubscriber(sub, event);
    }
    return;
  }

  // Org/product events: route by orgId (O(1) channel lookup)
  if (event.organizationId) {
    const subscribers = streamSubscriberManager.getByChannel<UserStreamSubscriber>(orgChannel(event.organizationId));
    for (const sub of subscribers) {
      // Reuse existing permission check logic
      if (canReceiveEvent(sub, event)) {
        await sendToSubscriber(sub, event);
      }
    }
  }
}
```

### Frontend: Unified message handler

```typescript
// frontend/src/query/realtime/unified-stream-handler.ts
export function handleUnifiedStreamMessage(message: UnifiedStreamMessage): void {
  const { entityType, resourceType, entityId, action, data } = message;

  // Membership events → existing handler
  if (resourceType === 'membership') {
    handleMembershipEvent(action, data);
    return;
  }

  // Organization events → existing handler
  if (entityType === 'organization') {
    handleOrganizationEvent(action, entityId, data);
    return;
  }

  // Product entity events (page, attachment) → existing handler
  handleProductEntityEvent(entityType, entityId, action, data);
}
```

### Frontend: Remove org stream from routes

```typescript
// organization-routes.tsx - REMOVE the useLiveStream hook
// Stream is now app-level via UserStream component

export const OrganizationLayoutRoute = createRoute({
  // ...
  component: () => {
    const organization = useLoaderData({ from: '/appLayout/$idOrSlug' });
    // No more useLiveStream here - handled at app level
    return <Outlet />;
  },
});
```

## Implementation phases

### Phase 1: Backend - Multi-channel subscriber manager ✅ COMPLETE

| Task | File | Status |
|------|------|--------|
| Rename `indexKey` → `channel`, `byIndex` → `byChannel` | `subscriber-manager.ts` | ✅ |
| Add `additionalChannels` parameter to `register()` | `subscriber-manager.ts` | ✅ |
| Store `_channels` for cleanup | `subscriber-manager.ts` | ✅ |
| Rename `getByIndex` → `getByChannel` | `subscriber-manager.ts` | ✅ |
| Rename `getIndexKey` → `getChannel` in dispatcher | `dispatcher.ts` | ✅ |
| Update `orgIndexKey` → `orgChannel` | `entities/stream/types.ts` | ✅ |
| Update `userIndexKey` → `userChannel` | `me/stream/types.ts` | ✅ |
| Update `publicPageIndexKey` → `publicPageChannel` | `page/stream/types.ts` | ✅ |
| Update all handler usages | `entities-handlers.ts`, `me-handlers.ts`, `page-handlers.ts` | ✅ |

### Phase 2: Backend - Extend user stream for product entities ✅ COMPLETE

| Task | File | Status |
|------|------|--------|
| Add `memberships`, `userSystemRole` to `UserStreamSubscriber` | `me/stream/types.ts` | ✅ |
| Add `orgChannel()` function | `me/stream/types.ts` | ✅ |
| Add `canReceiveProductEntityEvent()` permission check | `me/stream/can-receive.ts` | ✅ |
| Update routing in `dispatchToUserSubscribers` | `me/stream/route.ts` | ✅ |
| Register product entity events in ActivityBus | `me-handlers.ts` | ✅ |
| Register subscriber on org channels | `me-handlers.ts` | ✅ |
| Add comment about dynamic membership limitation | `me-handlers.ts` | ✅ |

### Phase 3: Frontend - Unify handlers ✅ COMPLETE

| Task | File | Status |
|------|------|--------|
| Add `ProductEntityData`, `StreamTx` types | `user-stream-types.ts` | ✅ |
| Add `tx` field to `UserStreamMessage` | `user-stream-types.ts` | ✅ |
| Add `productEntityKeysMap` | `user-stream-handler.ts` | ✅ |
| Route product entities in handler | `user-stream-handler.ts` | ✅ |
| Add `handleProductEntityEvent` function | `user-stream-handler.ts` | ✅ |

### Phase 4: Frontend - Remove org stream ✅ COMPLETE

| Task | File | Status |
|------|------|--------|
| Remove `useLiveStream` from `OrganizationLayoutRoute` | `organization-routes.tsx` | ✅ |
| Remove `realtimeEntityTypes` constant | `organization-routes.tsx` | ✅ |
| Remove unused imports (`useIsFetching`, `handleStreamMessage`, etc.) | `organization-routes.tsx` | ✅ |

### Phase 5: Cleanup ✅ COMPLETE

#### Deleted (no longer used)

| Deleted | Reason | Status |
|---------|--------|--------|
| `frontend/src/query/realtime/use-live-stream.ts` | Replaced by user stream | ✅ |
| `frontend/src/query/realtime/stream-message-handler.ts` | Merged into user-stream-handler | ✅ |
| `frontend/src/query/realtime/stream-types.ts` | Merged into user-stream-types | ✅ |
| `backend/src/modules/entities/stream/` | Merged into me/stream | ✅ |
| Org stream route from `entities-handlers.ts` | Replaced by `/me/stream` | ✅ |
| Org stream route from `entities-routes.ts` | Replaced by `/me/stream` | ✅ |

#### Deprecated with warning (composable utilities)

| File | Status |
|------|--------|
| `frontend/src/query/realtime/hydrate-barrier.ts` | Still used by use-page-live-stream ✅ |
| `frontend/src/query/realtime/tab-coordinator.ts` | **Active** - used by use-user-stream ✅ |
| `frontend/src/query/realtime/sync-coordinator.ts` | Added @deprecated warning ✅ |

#### Backward compatibility

| Type alias | Maps to | Status |
|------------|---------|--------|
| `StreamState` | `UserStreamState` | ✅ Added with @deprecated |
| `StreamMessage` | `UserStreamMessage` | ✅ Added with @deprecated |

## Files summary

### To modify

| File | Changes |
|------|---------|
| `backend/src/sync/stream/subscriber-manager.ts` | Multi-channel support |
| `backend/src/sync/stream/types.ts` | Rename indexKey → channel |
| `backend/src/modules/me/stream/types.ts` | Add memberships, userSystemRole |
| `backend/src/modules/me/me-handlers.ts` | Register on org channels, route all events |
| `frontend/src/query/realtime/user-stream-handler.ts` | Handle product entities |
| `frontend/src/routes/organization-routes.tsx` | Remove useLiveStream |

### To delete

| File | Reason |
|------|--------|
| `frontend/src/query/realtime/use-live-stream.ts` | Replaced |
| `frontend/src/query/realtime/stream-message-handler.ts` | Merged |
| `frontend/src/query/realtime/stream-types.ts` | Merged |
| `backend/src/modules/entities/stream/` folder | Merged |

### To deprecate (add warning, keep for now)

| File | Reason |
|------|--------|
| `frontend/src/query/realtime/tab-coordinator.ts` | Composable utility, may be useful |
| `frontend/src/query/realtime/sync-coordinator.ts` | Composable utility, may be useful |

## References

- [me-handlers.ts](../../backend/src/modules/me/me-handlers.ts) - Existing user stream
- [entities/stream/can-receive.ts](../../backend/src/modules/entities/stream/can-receive.ts) - Permission logic to reuse
- [subscriber-manager.ts](../../backend/src/sync/stream/subscriber-manager.ts) - To extend with multi-channel
- [user-stream-handler.ts](../../frontend/src/query/realtime/user-stream-handler.ts) - To extend
