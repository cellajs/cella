# Sync Engine Implementation TODO

> Generated from [HYBRID_SYNC_ENGINE_PLAN.md](./HYBRID_SYNC_ENGINE_PLAN.md) and [SYNC_ENGINE_REQUIREMENTS.md](./SYNC_ENGINE_REQUIREMENTS.md) against current codebase state.

## Overview

This TODO list covers building the hybrid sync engine from the ground up. Items are grouped by phase and ordered by dependency.

**Legend:**
- `[ ]` Not started
- `[~]` Partially exists / needs upgrade
- `[x]` Complete

---

## Phase 1: Schema & data layer

Foundation work - must complete before handlers or CDC changes.

### Database schema

- [ ] **Add `tx` JSONB column to product entity tables** (DATA-001 to DATA-006)
  - Location: `backend/src/db/schema/pages.ts`, `backend/src/db/schema/attachments.ts`
  - Note: Entity tables don't have tx column - tx is transient and stored in activities only
  - Schema: `tx: jsonb('tx').$type<{ transactionId: string; sourceId: string; changedField: string | null }>()`
  - Column is nullable (null when no tx metadata)

- [x] **Add `tx` JSONB column to activities table** (DATA-010 to DATA-017)
  - Location: `backend/src/db/schema/activities.ts`
  - ✅ Implemented with TxColumnData type

- [ ] **Add expression indexes for tx queries** (DATA-015, DATA-016)
  - Index on `(tx->>'transactionId')` for idempotency lookup
  - Composite index on `(entityType, entityId, tx->>'changedField')` for conflict detection

- [ ] **Generate and run migration**
  - Run: `pnpm generate` then `pnpm migrate`

---

## Phase 2: Backend sync primitives

Core utilities used by handlers and CDC.

### Transaction wrapper schemas

- [x] **Create tx wrapper schemas** (API-001 to API-012)
  - Location: `backend/src/modules/sync/schema.ts`
  - ✅ `txRequestSchema`, `txResponseSchema`, `createTxBodySchema()`, `createTxResponseSchema()`

### Conflict detection

- [x] **Implement `checkFieldConflict()`** (CONFLICT-001 to CONFLICT-005)
  - Location: `backend/src/lib/sync/conflict-detection.ts`
  - ✅ Queries activities for latest tx, returns `{ hasConflict, serverTransactionId }`

### Idempotency

- [x] **Implement `isTransactionProcessed()` and `getEntityByTransaction()`** (API-030 to API-032)
  - Location: `backend/src/lib/sync/idempotency.ts`
  - ✅ Queries activities by transactionId for deduplication

---

## Phase 3: Backend handlers

Upgrade product entity handlers to use tx wrapper.

### Pages handlers

- [x] **Upgrade createPage handler** (API-001, API-002, API-005 to API-012)
  - Location: `backend/src/modules/pages/handlers.ts`
  - ✅ Uses `{ data, tx }` wrapper, idempotency check, writes tx to activity

- [x] **Upgrade updatePage handler** (API-007, API-009, CONFLICT-001 to CONFLICT-003)
  - ✅ Conflict detection via `checkFieldConflict()`, 409 response on conflict

- [x] **Upgrade deletePage handler**
  - ✅ Uses tx wrapper with `changedField: null`

### Attachments handlers

- [x] **Upgrade attachment handlers** (same pattern as pages)
  - Location: `backend/src/modules/attachments/handlers.ts`
  - ✅ Create and update handlers use tx wrapper, idempotency, conflict detection

### Route schemas

- [x] **Update OpenAPI route schemas**
  - ✅ Pages and attachments routes use tx-wrapped schemas
  - Location: `backend/src/modules/pages/routes.ts`, `backend/src/modules/attachments/routes.ts`
  - Use `createTxMutationSchema(createPageSchema)` for request body
  - Use `createTxResponseSchema(pageSchema)` for response

- [ ] **Regenerate OpenAPI client**
  - Run: `pnpm generate:openapi`

---

## Phase 4: CDC Worker

Extract tx metadata and NOTIFY with entity data.

### Context extraction

- [x] **Extend `extractActivityContext()` to read tx column** (CDC-001 to CDC-004)
  - Location: `cdc/src/utils/extract-activity-context.ts`
  - ✅ Extracts tx JSONB from replicated row

### Activity insert

- [x] **Store tx metadata in activity record** (CDC-002)
  - ✅ CDC Worker includes tx field in activity creation

### WebSocket notification

- [x] **Send activity via WebSocket after INSERT** (CDC-010 to CDC-021)
  - Location: `cdc/src/handlers/` and `backend/src/lib/cdc-websocket.ts`
  - ✅ Uses WebSocket instead of pg_notify (no 8KB limit)
  - ✅ Full entity data sent via WebSocket

---

## Phase 5: ActivityBus upgrade

Extend existing EventBus to handle entity data.

### Payload handling

- [x] **Upgrade ActivityBus to handle entity data** (AB-001 to AB-005)
  - Location: `backend/src/lib/activity-bus.ts`
  - ✅ `ActivityEventWithEntity` interface with `entity` field
  - ✅ Receives from CDC Worker via WebSocket (`cdc-websocket.ts`)

### Stream subscriber integration

- [ ] **Add subscriber registration to ActivityBus** (DEC-10, DEC-20)
  - Allow stream handlers to subscribe by orgId
  - Emit activity notifications to registered subscribers

---

## Phase 6: Live stream endpoint

Org-scoped SSE for realtime updates.

### Stream subscriber manager

- [ ] **Implement StreamSubscriberManager** (STREAM-010 to STREAM-014)
  - Location: `backend/src/lib/stream/stream-subscribers.ts` (new file)
  - `Map<orgId, Set<Subscriber>>` for O(1) routing
  - Subscribe to ActivityBus for notifications
  - Filter by entityTypes, cursor, permissions
  - Call `isPermissionAllowed()` before sending (SEC-002)

### Activity fetcher

- [ ] **Implement `fetchAndEnrichActivities()`** (STREAM-030 to STREAM-035)
  - Location: `backend/src/lib/stream/activity-fetcher.ts` (new file)
  - JOIN activities with entity tables for catch-up queries
  - Apply permission filtering
  - Limit to 100 activities per request (CON-4)

### Stream endpoint

- [ ] **Create live stream route and handler** (STREAM-001 to STREAM-008)
  - Location: `backend/src/modules/streams/routes.ts`, `handlers.ts` (new module)
  - Route: `GET /organizations/:idOrSlug/live`
  - Query params: `offset`, `live`, `entityTypes`
  - Use org guard middleware (reuse existing pattern)
  - SSE response with catch-up + live subscription

### Stream message format

- [ ] **Implement stream message serialization** (STREAM-020 to STREAM-027)
  - Fields: `data`, `entityType`, `entityId`, `action`, `activityId`, `changedKeys`, `createdAt`, `tx`
  - SSE event type: `'change'`
  - SSE id: `activityId` (for resumption)

---

## Phase 7: Frontend sync primitives

Client-side utilities for sync.

### Source ID and transaction ID

- [x] **Implement sourceId** (FE-MUT-003, FE-MUT-003a)
  - Location: `frontend/src/query/offline/hlc.ts` (sourceId is exported from HLC module)
  - Generated once per module load via `nanoid()`
  - Exported as constant

- [x] **Implement HLC and createTransactionId()** (DATA-020 to DATA-026)
  - Location: `frontend/src/query/offline/hlc.ts`
  - Format: `{wallTime}.{logical}.{nodeId}`
  - Increment logical counter for same-millisecond events
  - Exports: `createTransactionId()`, `parseTransactionId()`, `compareTransactionIds()`

### Field transaction tracking

- [x] **Implement field transaction store** (CONFLICT-010 to CONFLICT-012)
  - Location: `frontend/src/query/offline/field-transaction-store.ts`
  - Track last-seen transactionId per `(entityId, field)`
  - `getExpectedTransactionId(entityId, field)` for conflict detection
  - `setFieldTransactionId(entityId, field, txId)` updated from stream
  - ✅ Uses Zustand with persist middleware (localStorage) for durability across refresh

### Pending mutations visibility

- [x] **Implement pending mutations hook** (NEW)
  - Location: `frontend/src/query/basic/use-pending-mutations.ts`
  - `usePendingMutationsCount()` - React hook with mutation cache subscription
  - `usePendingMutations()` - Boolean hook for UI indicators
  - `getPendingMutationsCount()` - Imperative function for non-React contexts
  - Uses `useSyncExternalStore` for efficient subscription

### Network status service

- [ ] **Implement network status service** (NET-001 to NET-010, DEC-16)
  - Location: `frontend/src/query/` (not yet implemented)
  - Note: Currently using React Query's built-in `onlineManager`
  - Replaces `onlineManager` from TanStack Query
  - Tracks: `isOnline`, `isVerified`, `latency` (low/high/unknown)
  - Health check via `/health` endpoint
  - Zustand store with `useNetworkStore`

---

## Phase 8: Frontend mutation upgrades

Add transaction tracking to existing mutations.

### Entity mutations factory

- [~] **Implement createEntityMutations factory** (NEW)
  - Location: Per-module `query.ts` files (no factory, each module implements directly)
  - Note: Pattern established in `pages/query.ts` and `attachments/query.ts`
  - Unified factory supporting both tx-enabled and standard entities
  - `txEnabled: true` mode: uses outbox, tx metadata, conflict detection
  - `txEnabled: false` mode: uses setMutationDefaults, traditional TQ flow
  - Generates: useCreate, useUpdate, useDelete hooks
  - Composable callbacks (factory defaults + custom overrides)
  - ~67% boilerplate reduction per entity module

### Upgrade page mutations

- [x] **Upgrade usePageCreateMutation** (FE-MUT-001 to FE-MUT-005, FE-MUT-010 to FE-MUT-024)
  - Location: `frontend/src/modules/pages/query.ts`
  - Uses `createEntityMutations({ txEnabled: true, ... })`
  - Generates transactionId via factory
  - Includes `{ data, tx }` wrapper in API body

- [x] **Upgrade usePageUpdateMutation**
  - Includes `changedField` in tx via factory
  - Uses `detectChangedFields()` for conflict detection
  - Conflict handling ready (409 response handling)

- [x] **Upgrade usePageDeleteMutation**
  - Generates transactionId with `changedField: null`
  - Routes through outbox

### Upgrade attachment mutations

- [~] **Upgrade attachment mutations** (special handling required)
  - Location: `frontend/src/modules/attachments/query.ts`
  - Attachments use Transloadit for file upload - different from simple entities
  - Create takes array (batch), already has IDs from Transloadit
  - Requires `orgIdOrSlug` path parameter (org-scoped)
  - File blob store for offline caching: (not yet implemented)
  - Full offline create requires Transloadit queue (future work)

---

## Phase 9: Frontend live stream

SSE subscription and cache updates.

### Live stream hook

- [x] **Implement useLiveStream hook** (FE-MUT-023)
  - Location: `frontend/src/query/realtime/use-live-stream.ts`
  - Opens EventSource to `/organizations/:slug/live`
  - Parses stream messages, handles offset events
  - Integrates with sync coordinator for upstream-first flow
  - Broadcasts to follower tabs via tab coordinator

### Cache update utilities

- [~] **Implement applyMessageToCache()** (INT-QUERY-001 to INT-QUERY-005)
  - Partially exists in `use-live-stream.ts` message handling
  - TODO: Extract to `frontend/src/query/realtime/cache-utils.ts`
  - Update detail cache: `queryClient.setQueryData([entityType, entityId], entity)`
  - Update list caches: `queryClient.setQueriesData()`
  - Handle create/update/delete actions

### Transaction confirmation

- [x] **Confirm pending transactions from stream** (FE-MUT-023)
  - Location: `frontend/src/query/realtime/sync-coordinator.ts`
  - `handleStreamMessage()` checks for matching pending transactions
  - Removes confirmed mutations from outbox

---

## Phase 10: Offline support

Mutation queue and upstream-first sync.

### Mutation outbox

- [~] **Implement mutation outbox storage** (OFFLINE-001 to OFFLINE-004)
  - Location: React Query mutation cache with `frontend/src/query/persister.ts`
  - Note: Uses React Query persistence instead of separate IndexedDB outbox (see DEC-24)
  - IndexedDB storage for pending mutations
  - OutboxMutation structure with entityType, entityId, field, transactionId

- [x] **Implement update squashing** (OFFLINE-005, OFFLINE-006)
  - Same-field mutations squash (keep latest value and transactionId)
  - Different-field mutations queue separately

- [x] **Implement create+edit coalescing** (OFFLINE-007 to OFFLINE-009, DEC-23)
  - Creates keyed by entity (not field)
  - Update to pending create merges into create entry
  - Update to in-flight (sending) create queues, flushed after create completes
  - Delete of pending create removes both from outbox

- [x] **Wire outbox into mutation hooks**
  - All mutations route through `queueMutation()`
  - Outbox handles online/offline, in-flight tracking, coalescing
  - Entity modules register senders via `registerMutationSender()`
  - Location: `frontend/src/modules/pages/query.ts`

- [x] **Implement sender registration pattern**
  - `registerMutationSender(entityType, action, senderFn)`
  - Senders call actual API (createPage, updatePage, deletePages)
  - Decouples outbox from entity-specific API knowledge

### Offset persistence

- [x] **Implement offset store** (OFFLINE-OFFSET-001 to OFFLINE-OFFSET-006)
  - Location: `frontend/src/query/realtime/offset-store.ts`
  - IndexedDB storage for last-seen activityId per org
  - Debounced writes (max 1 per 5 seconds)
  - Read on SSE connect, update on each message

### Upstream-first sync

- [x] **Implement sync coordinator** (OFFLINE-010 to OFFLINE-013)
  - Location: `frontend/src/query/realtime/sync-coordinator.ts`
  - On reconnect: catch up first, then flush outbox
  - Detect conflicts between stream messages and queued mutations
  - Mark conflicted mutations, don't auto-flush

- [x] **Wire sync coordinator into live stream**
  - Location: `frontend/src/query/realtime/use-live-stream.ts`
  - Call `startSync(orgId)` on connect
  - Pass messages to `handleStreamMessage()` for conflict detection
  - Call `setCaughtUp()` on offset event
  - Call `flushMutations()` after catch-up completes

### Conflict resolution UI

- [x] **Implement conflict detection in handleUpstreamMessage** (OFFLINE-011)
  - Location: `frontend/src/query/realtime/sync-coordinator.ts`
  - Check if stream message conflicts with queued mutation
  - Mark as `conflicted` with server value

- [ ] **Implement conflict resolution UI** (OFFLINE-020 to OFFLINE-024, MERGE-001 to MERGE-007)
  - Location: `frontend/src/modules/common/conflict-dialog.tsx` (new file)
  - Show user's value vs server value
  - Actions: Keep Mine, Keep Server, Merge
  - Apply resolution to outbox

---

## Phase 11: Multi-tab coordination

Single SSE connection with leader election.

### Leader election

- [x] **Implement tab coordinator with Web Locks** (TAB-001 to TAB-004)
  - Location: `frontend/src/query/realtime/tab-coordinator.ts`
  - Lock name: `cella-sync-leader`
  - Only leader opens SSE connection
  - Followers wait for broadcast

### Cross-tab communication

- [x] **Implement BroadcastChannel messaging** (TAB-010 to TAB-013)
  - Channel name: `cella-sync`
  - Leader broadcasts stream messages via `broadcastStreamMessage()`
  - Followers receive via `onStreamMessage()` handler
  - Cursor updates broadcast separately

### Leader handoff

- [x] **Implement leader handoff** (TAB-020 to TAB-022)
  - On leader tab close, another tab acquires lock via Web Locks API
  - New leader opens SSE from persisted offset
  - Uses visibility API for foreground preference

---

## Phase 12: Testing

Validate requirements are met.

### Backend tests

- [ ] **Test tx wrapper validation**
- [ ] **Test conflict detection**
- [ ] **Test idempotency**
- [ ] **Test stream endpoint authorization**
- [ ] **Test stream message format**

### CDC tests

- [ ] **Test tx extraction**
- [ ] **Test NOTIFY payload structure**
- [ ] **Test oversized entity truncation**

### Frontend tests

- [ ] **Test HLC generation**
- [ ] **Test transaction tracking lifecycle**
- [ ] **Test cache updates from stream**
- [ ] **Test offline outbox squashing**
- [ ] **Test conflict detection**

### Integration tests

- [ ] **Test full mutation flow: client → server → CDC → stream → client**
- [ ] **Test offline → reconnect → conflict resolution**
- [ ] **Test multi-tab leader election**

---

## Phase 13: Documentation & cleanup

Final polish.

- [ ] **Update API documentation** (Scalar)
- [ ] **Add sync patterns to ARCHITECTURE.md**
- [ ] **Create sync module README**
- [ ] **Remove/archive this TODO file when complete**

---

## Dependencies

```
Phase 1 (Schema)
    ↓
Phase 2 (Backend primitives) ← Phase 3 (Handlers) ← Phase 8 (FE mutations)
    ↓
Phase 4 (CDC Worker)
    ↓
Phase 5 (ActivityBus)
    ↓
Phase 6 (Stream endpoint) ← Phase 9 (FE stream hook)
    ↓
Phase 7 (FE primitives) → Phase 8, 9, 10
    ↓
Phase 10 (Offline) ← Phase 11 (Multi-tab)
    ↓
Phase 12 (Testing) → Phase 13 (Docs)
```
