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
  - Schema: `tx: jsonb('tx').$type<{ transactionId: string; sourceId: string; changedField: string | null }>()`
  - Column is nullable (null when no tx metadata)

- [ ] **Add `tx` JSONB column to activities table** (DATA-010 to DATA-017)
  - Location: `backend/src/db/schema/activities.ts`
  - Same structure as entity tx column
  - Separate from existing `changedKeys` column (CDC-detected vs client-declared)

- [ ] **Add expression indexes for tx queries** (DATA-015, DATA-016)
  - Index on `(tx->>'transactionId')` for idempotency lookup
  - Composite index on `(entityType, entityId, tx->>'changedField')` for conflict detection

- [ ] **Generate and run migration**
  - Run: `pnpm generate` then `pnpm migrate`

---

## Phase 2: Backend sync primitives

Core utilities used by handlers and CDC.

### Transaction wrapper schemas

- [ ] **Create tx wrapper schemas** (API-001 to API-012)
  - Location: `backend/src/modules/sync/schema.ts` (new file)
  - `txRequestSchema`: `{ transactionId, sourceId, changedField, expectedTransactionId }`
  - `txResponseSchema`: `{ transactionId }`
  - `createTxMutationSchema(dataSchema)`: Factory for `{ data, tx }` wrapper
  - `createTxResponseSchema(dataSchema)`: Factory for response wrapper

### Conflict detection

- [ ] **Implement `checkFieldConflict()`** (CONFLICT-001 to CONFLICT-005)
  - Location: `backend/src/lib/sync/conflict-detection.ts` (new file)
  - Query activities for latest tx matching `(entityType, entityId, changedField)`
  - Return `{ hasConflict, serverTransactionId }`
  - Skip check for creates (`expectedTransactionId` is null)

### Idempotency

- [ ] **Implement `isTransactionProcessed()` and `getEntityByTransaction()`** (API-030 to API-032)
  - Location: `backend/src/lib/sync/idempotency.ts` (new file)
  - Query activities by `tx->>'transactionId'`
  - Return existing entity for duplicate transactions

---

## Phase 3: Backend handlers

Upgrade product entity handlers to use tx wrapper.

### Pages handlers

- [ ] **Upgrade createPage handler** (API-001, API-002, API-005 to API-012)
  - Location: `backend/src/modules/pages/handlers.ts`
  - Parse `{ data, tx }` from request body
  - Check idempotency before insert
  - Write tx JSONB to entity row
  - Return `{ data, tx: { transactionId } }`

- [ ] **Upgrade updatePage handler** (API-007, API-009, CONFLICT-001 to CONFLICT-003)
  - Check field conflict using `expectedTransactionId`
  - Return 409 with `code: 'FIELD_CONFLICT'` on conflict (API-020 to API-024)
  - Write tx JSONB including `changedField`

- [ ] **Upgrade deletePage handler**
  - Similar to update, but `changedField: null`
  - Idempotency check

### Attachments handlers

- [ ] **Upgrade attachment handlers** (same pattern as pages)
  - Location: `backend/src/modules/attachments/handlers.ts`

### Route schemas

- [ ] **Update OpenAPI route schemas**
  - Location: `backend/src/modules/pages/routes.ts`, `backend/src/modules/attachments/routes.ts`
  - Use `createTxMutationSchema(createPageSchema)` for request body
  - Use `createTxResponseSchema(pageSchema)` for response

- [ ] **Regenerate OpenAPI client**
  - Run: `pnpm generate:openapi`

---

## Phase 4: CDC Worker

Extract tx metadata and NOTIFY with entity data.

### Context extraction

- [ ] **Extend `extractActivityContext()` to read tx column** (CDC-001 to CDC-004)
  - Location: `cdc/src/utils/extract-activity-context.ts`
  - Parse tx JSONB from replicated row
  - Return tx metadata for activity record

### Activity insert

- [~] **Store tx metadata in activity record** (CDC-002)
  - Existing: CDC Worker creates activities
  - Add: Include `tx` field from extracted context

### NOTIFY with entity data

- [ ] **Add NOTIFY after activity INSERT** (CDC-010 to CDC-021)
  - Location: `cdc/src/handlers/insert.ts`, `update.ts`, `delete.ts`
  - Call `pg_notify('cella_activities', payload)` after activity insert
  - Payload includes: `orgId`, `activityId`, `entityType`, `entityId`, `action`, `tx`, `entity`
  - Truncate `entity` to null if payload > 7500 bytes (CON-1)

---

## Phase 5: ActivityBus upgrade

Extend existing EventBus to handle entity data.

### Payload handling

- [~] **Upgrade ActivityBus to handle entity data** (AB-001 to AB-005)
  - Location: `backend/src/lib/event-bus.ts` (rename to `activity-bus.ts`)
  - Extend `ActivityEvent` interface with optional `entity` field
  - Parse entity from CDC Worker payloads
  - Gracefully handle trigger-only payloads (no entity)

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

- [ ] **Implement sourceId** (FE-MUT-003, FE-MUT-003a)
  - Location: `frontend/src/lib/sync/source-id.ts` (new file)
  - Generate once per module load via `nanoid()`
  - Export as constant

- [ ] **Implement HLC and createTransactionId()** (DATA-020 to DATA-026)
  - Location: `frontend/src/lib/sync/hlc.ts` (new file)
  - Format: `{wallTime}.{logical}.{nodeId}`
  - Increment logical counter for same-millisecond events
  - Export `createTransactionId()`, `parseTransactionId()`, `compareTransactionIds()`

### Field transaction tracking

- [ ] **Implement field transaction store** (CONFLICT-010 to CONFLICT-012)
  - Location: `frontend/src/lib/sync/field-transaction-store.ts` (new file)
  - Track last-seen transactionId per `(entityId, field)`
  - `getExpectedTransactionId(entityId, field)` for conflict detection
  - `setFieldTransactionId(entityId, field, txId)` updated from stream

### Network status service

- [ ] **Implement network status service** (NET-001 to NET-010, DEC-16)
  - Location: `frontend/src/store/network.ts` (new file)
  - Replace `onlineManager` from TanStack Query
  - Track: `isOnline`, `isVerified`, `latency`
  - Health check to verify server reachability
  - Zustand store for global access

---

## Phase 8: Frontend mutation upgrades

Add transaction tracking to existing mutations.

### Upgrade page mutations

- [ ] **Upgrade usePageCreateMutation** (FE-MUT-001 to FE-MUT-005, FE-MUT-010 to FE-MUT-024)
  - Location: `frontend/src/modules/pages/query.ts`
  - Generate transactionId in `onMutate`
  - Include `{ data, tx }` wrapper in API body
  - Track transaction lifecycle: pending → sent → confirmed

- [ ] **Upgrade usePageUpdateMutation**
  - Include `changedField` in tx
  - Use `getExpectedTransactionId()` for conflict detection
  - Handle 409 conflict response (CONFLICT-013)

- [ ] **Upgrade usePageDeleteMutation**
  - Generate transactionId with `changedField: null`

### Upgrade attachment mutations

- [ ] **Upgrade attachment mutations** (same pattern as pages)
  - Location: `frontend/src/modules/attachments/query.ts`

---

## Phase 9: Frontend live stream

SSE subscription and cache updates.

### Live stream hook

- [ ] **Implement useLiveStream hook** (FE-MUT-023)
  - Location: `frontend/src/lib/sync/use-live-stream.ts` (new file)
  - Open EventSource to `/organizations/:slug/live`
  - Parse stream messages
  - Queue messages during hydration barrier
  - Apply messages to React Query cache

### Cache update utilities

- [ ] **Implement applyMessageToCache()** (INT-QUERY-001 to INT-QUERY-005)
  - Location: `frontend/src/lib/sync/cache-utils.ts` (new file)
  - Update detail cache: `queryClient.setQueryData([entityType, entityId], entity)`
  - Update list caches: `queryClient.setQueriesData()`
  - Handle create/update/delete actions

### Transaction confirmation

- [~] **Confirm pending transactions from stream** (FE-MUT-023)
  - Existing: `frontend/src/store/sync.ts` has transaction tracking
  - Add: Match stream message transactionId to pending transactions
  - Transition to `confirmed` state

---

## Phase 10: Offline support

Mutation queue and upstream-first sync.

### Mutation outbox

- [ ] **Implement mutation outbox** (OFFLINE-001 to OFFLINE-006)
  - Location: `frontend/src/lib/sync/outbox.ts` (new file)
  - IndexedDB storage for pending mutations
  - Squash same-field mutations (keep latest value and transactionId)
  - Queue different-field mutations separately

### Offset persistence

- [ ] **Implement offset store** (OFFLINE-OFFSET-001 to OFFLINE-OFFSET-006)
  - Location: `frontend/src/lib/sync/offset-store.ts` (new file)
  - IndexedDB storage for last-seen activityId per org
  - Debounced writes (max 1 per 5 seconds)
  - Read on SSE connect, update on each message

### Upstream-first sync

- [ ] **Implement sync coordinator** (OFFLINE-010 to OFFLINE-013)
  - Location: `frontend/src/lib/sync/sync-coordinator.ts` (new file)
  - On reconnect: catch up first, then flush outbox
  - Detect conflicts between stream messages and queued mutations
  - Mark conflicted mutations, don't auto-flush

### Conflict resolution UI

- [ ] **Implement conflict detection in handleUpstreamMessage** (OFFLINE-011)
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

- [ ] **Implement tab coordinator with Web Locks** (TAB-001 to TAB-004)
  - Location: `frontend/src/lib/sync/tab-coordinator.ts` (new file)
  - Lock name: `{$appConfig.slug}-sync-leader`
  - Only leader opens SSE connection
  - Followers wait for broadcast

### Cross-tab communication

- [ ] **Implement BroadcastChannel messaging** (TAB-010 to TAB-013)
  - Channel name: `{$appConfig.slug}-sync`
  - Leader broadcasts stream messages
  - Followers apply to React Query cache

### Leader handoff

- [ ] **Implement leader handoff** (TAB-020 to TAB-022)
  - On leader tab close, another tab acquires lock
  - New leader opens SSE from persisted offset
  - Prefer foreground tabs for leadership (visibility check)

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
