# Migration plan: User SSE → live stream

> **Status**: Proposed  
> **Created**: January 2025  
> **Scope**: Replace the legacy `/me/sse` user-scoped SSE with the organization-scoped live stream

## Summary

The legacy SSE system (`frontend/src/modules/common/sse/`) predates the hybrid sync engine. It maintains a **user-scoped** SSE connection at `/me/sse` that receives membership and context entity events. This should be migrated to use the **organization-scoped** live stream infrastructure already built for product entities.

## Key insight: CDC already tracks everything we need

After thorough analysis, the existing infrastructure already provides what we need:

| Component | Already tracks | Events emitted |
|-----------|---------------|----------------|
| CDC Worker | `memberships` table (as resource) | `membership.created`, `membership.updated`, `membership.deleted` |
| CDC Worker | `organizations` table (as entity) | `organization.created`, `organization.updated`, `organization.deleted` |
| ActivityBus | All above events | Emits typed events via `eventBus.on('membership.created', ...)` |
| `activitiesTable` | All changes with `organizationId` | Stores full audit trail |

The CDC Worker already:
- Watches `memberships` table via `resourceTables` in `table-config.ts`
- Watches `organizations` table via `entityTables`
- Extracts `organizationId` from rows in `extract-activity-context.ts`
- Sends events to ActivityBus via WebSocket

**The only thing missing**: A stream endpoint that routes these events to users, similar to how `entities-handlers.ts` routes to org subscribers.

## Current state

### Legacy SSE (`/me/sse`)

| Component | Location | Purpose |
|-----------|----------|---------|
| `SSEProvider` | `frontend/src/modules/common/sse/provider.tsx` | Creates EventSource to `/me/sse`, reconnects on visibility change |
| `SSEContext` / `useSSE` | `frontend/src/modules/common/sse/use-sse.tsx` | React context for subscribing to SSE events |
| `SSE` component | `frontend/src/modules/common/sse/index.tsx` | Listens for 6 event types, updates React Query cache |
| Stream map | `backend/src/modules/me/me-handlers.ts` | `Map<userId, SSEStreamingApi>` for per-user streams |
| `sendSSEByUserIds` | `backend/src/lib/sse.ts` | Send events to specific users by userId |

**Problems:**
1. **Manual event sending** – Handlers call `sendSSEByUserIds()` bypassing CDC
2. **Duplicate with CDC** – CDC already tracks same events but they're ignored
3. **No offset/catch-up** – Missed events on reconnect
4. **Per-user Map** – Not indexed, O(n) for routing

### Sync engine live stream (model to follow)

Looking at `entities-handlers.ts`, the pattern is:

```typescript
// 1. Register for ActivityBus events
for (const eventType of realtimeEvents) {
  eventBus.on(eventType, async (event) => {
    await routeToOrgSubscribers(event);
  });
}

// 2. SSE endpoint with catch-up + live mode
.openapi(entityRoutes.stream, async (ctx) => {
  // ... catch-up activities from DB
  // ... register subscriber with streamSubscriberManager
  // ... keepAlive loop
});
```

## Simplified migration strategy

### Approach: Create `/me/stream` endpoint mirroring `/organizations/:orgId/sync/stream`

Instead of multiple org subscriptions, create a single user-scoped stream that:
1. Catches up from `activitiesTable` filtered by user's org memberships
2. Subscribes to ActivityBus for `membership.*` and `organization.*` events
3. Routes events where `organizationId` is in user's membership list

### Phase 1: Backend - Create user stream endpoint

**New files:**
- `backend/src/modules/me/stream/types.ts` - UserStreamSubscriber interface
- `backend/src/modules/me/stream/route.ts` - Route to user subscribers
- `backend/src/modules/me/stream/index.ts` - Exports

**Pattern (following `entities/stream/`):**

```typescript
// types.ts
export interface UserStreamSubscriber extends BaseStreamSubscriber {
  userId: string;
  /** Set of org IDs user belongs to (for filtering) */
  orgIds: Set<string>;
  cursor: string | null;
}

export function userIndexKey(userId: string): string {
  return `user:${userId}`;
}
```

```typescript
// In me-handlers.ts, add route similar to entities stream:
.openapi(meRoutes.stream, async (ctx) => {
  const user = getContextUser();
  const memberships = getContextMemberships();
  const orgIds = new Set(memberships.map(m => m.organizationId));
  
  // Catch-up: activities for user's orgs with entity types [organization, membership]
  const catchUpActivities = await fetchUserCatchUpActivities(user.id, orgIds, cursor);
  
  // SSE streaming...
  const subscriber: UserStreamSubscriber = {
    id: nanoid(),
    indexKey: userIndexKey(user.id),
    stream,
    userId: user.id,
    orgIds,
    cursor,
  };
  
  streamSubscriberManager.register(subscriber);
  await keepAlive(stream);
});
```

```typescript
// Register ActivityBus handlers for user-relevant events
const userRelevantEvents = [
  'membership.created',
  'membership.updated', 
  'membership.deleted',
  'organization.updated',
  'organization.deleted',
] as const;

for (const eventType of userRelevantEvents) {
  eventBus.on(eventType, async (event) => {
    await routeToUserSubscribers(event);
  });
}
```

### Phase 2: Backend - Remove legacy SSE

1. Remove `sendSSEByUserIds()` calls from:
   - `organization-handlers.ts` (lines 236, 286)
   - `memberships-handlers.ts` (lines 409, 488)

2. Delete:
   - `backend/src/lib/sse.ts`
   - `/me/sse` endpoint in `me-handlers.ts`
   - `streams` Map in `me-handlers.ts`

### Phase 3: Frontend - Create user live stream hook

```typescript
// frontend/src/query/realtime/use-user-stream.ts
export function useUserStream(options: UseUserStreamOptions) {
  // Similar to useLiveStream but connects to /me/stream
  // Handles membership and organization cache updates
}
```

Extend `stream-message-handler.ts` or create separate handler for user events:

```typescript
// Handle membership/organization updates
function handleUserStreamMessage(message: UserStreamMessage) {
  const { entityType, action, data } = message;
  
  if (entityType === 'organization') {
    // Update org cache, handle slug changes
  }
  if (message.resourceType === 'membership') {
    // Update membership cache, potentially refresh menu
  }
}
```

### Phase 4: Frontend - Replace SSEProvider

In `app-layout.tsx`:

```typescript
// Before
<SSEProvider>
  <SSE />
  ...
</SSEProvider>

// After
<UserStreamProvider>
  ...
</UserStreamProvider>
```

Or simply use the hook in a component:

```typescript
function UserStreamListener() {
  useUserStream({
    onMessage: handleUserStreamMessage,
    onMembershipChange: () => {
      // Refresh menu when user's memberships change
      queryClient.invalidateQueries({ queryKey: ['menu'] });
    },
  });
  return null;
}
```

### Phase 5: Delete legacy SSE

- Delete `frontend/src/modules/common/sse/` folder

## Implementation order

| Step | Effort | Files |
|------|--------|-------|
| 1 | S | Create `backend/src/modules/me/stream/` with types, route helpers |
| 2 | M | Add `/me/stream` endpoint in `me-handlers.ts` |
| 3 | S | Register ActivityBus handlers for `membership.*`, `organization.*` |
| 4 | S | Remove `sendSSEByUserIds` calls from handlers |
| 5 | S | Create `frontend/src/query/realtime/use-user-stream.ts` |
| 6 | S | Add user stream message handling |
| 7 | S | Replace `SSEProvider` with user stream in `AppLayout` |
| 8 | S | Delete legacy SSE files |

**Total estimate**: 1-2 days (simpler than original plan)

## Files to create

| File | Purpose |
|------|---------|
| `backend/src/modules/me/stream/types.ts` | `UserStreamSubscriber`, `userIndexKey()` |
| `backend/src/modules/me/stream/route.ts` | `routeToUserSubscribers()` |
| `backend/src/modules/me/stream/index.ts` | Exports |
| `frontend/src/query/realtime/use-user-stream.ts` | Hook for `/me/stream` |

## Files to modify

| File | Change |
|------|--------|
| `backend/src/modules/me/me-handlers.ts` | Add `/me/stream`, remove `/me/sse` and `streams` Map |
| `backend/src/modules/me/me-routes.ts` | Add stream route definition |
| `backend/src/modules/organization/organization-handlers.ts` | Remove `sendSSEByUserIds` |
| `backend/src/modules/memberships/memberships-handlers.ts` | Remove `sendSSEByUserIds` |
| `frontend/src/modules/common/app/app-layout.tsx` | Replace `SSEProvider` |

## Files to delete

| File | Reason |
|------|--------|
| `backend/src/lib/sse.ts` | Replaced by stream |
| `frontend/src/modules/common/sse/` | Entire folder |

## Edge case: User added to new org

When a user is added to a new org while their stream is active:

1. CDC emits `membership.created` with user's `userId` and new `organizationId`
2. User's stream subscriber has `orgIds` Set that doesn't include new org
3. **Solution**: `routeToUserSubscribers` checks if `event.userId === subscriber.userId` for membership events, regardless of org filter
4. Frontend receives membership event, refreshes menu + org cache

## References

- [entities-handlers.ts](../../backend/src/modules/entities/entities-handlers.ts) - Pattern to follow
- [entities/stream/](../../backend/src/modules/entities/stream/) - Existing stream infrastructure
- [activity-bus.ts](../../backend/src/sync/activity-bus.ts) - Event types already available
- [table-config.ts](../../backend/src/table-config.ts) - `membership` already in `resourceTables`
