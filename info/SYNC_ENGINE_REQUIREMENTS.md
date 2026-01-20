# Hybrid Sync Engine - Requirements Specification

This document defines the requirements for building the Hybrid Sync Engine. It combines **design decisions** (the "why") with **testable contracts** (the "what").

---

## Design Decisions

This section captures key architectural decisions, invariants, and constraints that guide implementation. AI agents should reference this section first.

### Invariants (must ALWAYS be true)

| ID | Invariant | Rationale |
|----|-----------|-----------|
| INV-1 | Optimistic updates happen BEFORE checking stream/online status | User sees instant feedback regardless of sync state |
| INV-2 | Transaction IDs are immutable once generated | Same ID used for retries enables idempotency |
| INV-3 | CDC is the single source of truth for activity history | Entity tables have transient sync columns that get overwritten |
| INV-4 | Upstream-first controls when mutations are SENT, not when user sees changes | Distinguishes sync guarantees from UX |
| INV-5 | One mutation = one transaction = one field change | Enables field-level conflict resolution |
| INV-6 | Only leader tab opens SSE connection | Prevents duplicate connections and race conditions |

### Constraints (hard limits)

| ID | Constraint | Limit | Why |
|----|------------|-------|-----|
| CON-1 | NOTIFY payload size | 8KB max (use 7.5KB threshold) | PostgreSQL hard limit |
| CON-2 | Transaction ID length | 32 chars | HLC format + storage efficiency |
| CON-3 | Source ID length | 64 chars | UUID + prefix headroom |
| CON-4 | Catch-up query batch | 100 activities | Prevent memory/latency spikes |
| CON-5 | IndexedDB transaction store | 1000 entries max | Client storage limits |

### Key Decisions

#### DEC-1: Use Hybrid Logical Clock for transaction IDs
- **Decision**: Format `{wallTime}.{logical}.{nodeId}` (~32 chars)
- **Alternatives rejected**:
  - `nanoid`: Not sortable, no causality
  - `UUID v7`: No logical counter for same-ms events
  - `timestamp-nanoid`: Custom format, not standardized
- **Trade-off**: Slightly longer IDs, but get causality + sortability + human-readable timestamps

#### DEC-2: Field-level (not entity-level) conflict tracking
- **Decision**: One mutation changes one field, conflicts are per-field
- **Alternatives rejected**:
  - Entity-level: Two users can't edit same entity simultaneously
  - Character-level (CRDT text): Too complex for v1
- **Trade-off**: Multiple API calls for multi-field edits, but dramatically reduces conflicts

#### DEC-3: Tiered merge strategy (CRDT → LWW → UI)
- **Decision**: Try automatic merge first, fall back gracefully
- **Merge order**:
  1. CRDT merge for compatible types (text, counters, sets)
  2. LWW (server wins) for opaque values (enums, foreign keys)
  3. Resolution UI when user input needed
- **Trade-off**: More implementation complexity, but better UX than "server always wins"

#### DEC-4: CDC includes entity data in NOTIFY payload
- **Decision**: Pass full entity from replication row, not just metadata
- **Alternatives rejected**:
  - API server fetches entity: Extra DB query per event
  - Store entity in activity table: Bloats activity storage
- **Trade-off**: Occasional fallback fetch for >7.5KB entities, but zero queries for 99% of events

#### DEC-5: Transient sync columns on entity tables
- **Decision**: `sync_transaction_id`, `sync_source_id`, `sync_changed_field` columns that get overwritten
- **Alternatives rejected**:
  - Separate sync metadata table: Extra join, complexity
  - Store in activity only: Handler can't pass to CDC via replication
- **Trade-off**: Three extra columns per product entity, but clean data flow

#### DEC-6: Upstream-first pattern
- **Decision**: Client must be caught up before sending mutations to server
- **Alternatives rejected**:
  - Downstream-first: Complex merge on server
  - No ordering: Random conflict resolution
- **Trade-off**: Slight latency when behind, but predictable ordering and simpler conflicts

#### DEC-7: activitiesTable as durable event log (no separate sync table)
- **Decision**: Extend existing activities with sync columns, not new table
- **Alternatives rejected**:
  - Separate `sync_transactions` table: Duplicate data, extra complexity
  - In-memory only: Lost on restart
- **Trade-off**: Couples sync to audit log, but reuses existing infrastructure

#### DEC-8: React Query as cache layer (not custom store)
- **Decision**: Feed stream events into React Query cache, not parallel state. 
- **Alternatives rejected**:
  - Custom reactive store: Duplicates React Query functionality
  - Replace React Query: Loses existing patterns and app-wide cache reusability
- **Trade-off**: Bound to React Query patterns, but consistent with rest of Cella

#### DEC-9: Organization-level stream granularity
- **Decision**: One SSE stream per org, delivering all product entity types for that org, filtered down by membership/role 
- **Alternatives rejected**:
  - Per-entity-type streams: More connections, harder to coordinate
  - Global stream: Authorization complexity, wasted bandwidth for multi-org users
  - Per-entity streams: Connection explosion (N entities × M users)
- **Trade-off**: Client filters by entity type, but simpler server and permission boundary by tenant

#### DEC-10: Single LISTEN connection with subscriber registry
- **Decision**: API server maintains one PostgreSQL LISTEN connection, fans out to SSE subscribers via in-memory registry
- **Alternatives rejected**:
  - Per-SSE LISTEN connection: Connection pool exhaustion
  - Polling: 500ms+ latency, N queries per interval
  - External pub/sub (Redis): Additional infrastructure dependency
- **Trade-off**: In-memory state (lost on restart, but clients reconnect), but O(1) DB connections

#### DEC-11: CDC triggers NOTIFY (not database trigger)
- **Decision**: CDC worker calls `pg_notify()` after inserting activity, includes entity data from replication row
- **Alternatives rejected**:
  - Database trigger on activities: Can't include entity data (trigger only sees activity row)
  - API server triggers NOTIFY: API doesn't have entity data, would need extra fetch
- **Trade-off**: Couples CDC to stream architecture, but eliminates extra DB queries

#### DEC-12: LIST endpoints for initial load, stream for deltas
- **Decision**: React Query prefetches/fetches initial data via REST, stream only delivers changes after subscription starts
- **Alternatives rejected**:
  - Stream delivers full state: Complex, duplicates LIST logic
  - Stream with history replay: Complicated offset management, ordering issues
  - LIST + polling: High latency, wasted queries
- **Trade-off**: Two data paths to maintain, but clear separation of concerns (LIST = query power, stream = push delivery)

#### DEC-13: Client-side filtering, server-side authorization
- **Decision**: Stream delivers all org changes; client filters by entity type. Server only filters by permission (can user see this entity?)
- **Alternatives rejected**:
  - Server filters by entity type: Per-subscriber query complexity
  - No authorization: Security hole
- **Trade-off**: Some wasted bytes for filtered types, but simpler server and flexible client

#### DEC-14: SubscriberRegistry keyed by orgId
- **Decision**: `Map<orgId, Set<Subscriber>>` for O(1) org lookup during broadcast
- **Alternatives rejected**:
  - Flat subscriber list: O(N) scan per event
  - Nested by entity type: Premature optimization, adds complexity
- **Trade-off**: Memory proportional to active orgs, but fast fan-out

---

## Integration requirements (existing Cella infrastructure)

The sync engine MUST integrate with existing Cella patterns, not create parallel implementations. This section documents which existing utilities to use and how.

### Permission system

| Existing code | Location | How sync engine uses it |
|---------------|----------|-------------------------|
| `isPermissionAllowed()` | `backend/src/permissions/` | Stream fan-out filters events by entity ACLs |
| `getValidProductEntity()` | `backend/src/permissions/get-product-entity.ts` | Pattern for checking product entity access |
| `splitByAllowance()` | `backend/src/permissions/split-by-allowance.ts` | Pattern for batch filtering by permission |
| `getContextMemberships()` | `backend/src/lib/context.ts` | Get user's memberships for permission checks |
| `getContextUserSystemRole()` | `backend/src/lib/context.ts` | Check if user is system admin (bypasses ACLs) |

**Integration rules:**
- INT-PERM-001: Stream subscriber registry MUST store `memberships` from request context
- INT-PERM-002: Stream fan-out MUST call `isPermissionAllowed(memberships, 'read', entity)` before sending
- INT-PERM-003: System admins (`userSystemRole === 'admin'`) MUST bypass entity ACLs (same as REST handlers)
- INT-PERM-004: Permission logic MUST NOT be duplicated - import from `#/permissions`

### Query client & cache

| Existing code | Location | How sync engine uses it |
|---------------|----------|-------------------------|
| `queryClient` | `frontend/src/query/query-client.ts` | Single instance for all cache operations |
| `useMutateQueryData()` | `frontend/src/query/hooks/use-mutate-query-data/` | Optimistic cache mutations (create/update/remove) |
| `createEntityKeys()` | `frontend/src/modules/entities/` | Standardized query key generation |
| `onError` / `onSuccess` | `frontend/src/query/` | Global mutation callbacks |

**Integration rules:**
- INT-QUERY-001: Stream events MUST update cache via `queryClient.setQueryData()` / `setQueriesData()`
- INT-QUERY-002: Optimistic mutations MUST use existing `useMutateQueryData()` hook pattern
- INT-QUERY-003: Query keys MUST follow existing `createEntityKeys()` pattern
- INT-QUERY-004: DO NOT create a parallel cache - React Query is the single source of UI truth
- INT-QUERY-005: Stream hook MUST use same `queryClient` instance (import from `~/query/query-client`)

### Existing mutation patterns

Reference implementations to follow:

| Pattern | Location | What to copy |
|---------|----------|--------------|
| Create with optimistic update | `frontend/src/modules/attachments/query.ts` | `useAttachmentCreateMutation` |
| Update with optimistic update | `frontend/src/modules/pages/query.ts` | `usePageUpdateMutation` |
| Delete with optimistic update | `frontend/src/modules/pages/query.ts` | `usePageDeleteMutation` |
| Infinite list cache update | `frontend/src/query/hooks/use-mutate-query-data/` | `changeInfiniteQueryData` |

**Integration rules:**
- INT-MUT-001: Sync-enabled mutations MUST extend existing patterns, not replace them
- INT-MUT-002: `onMutate` MUST apply optimistic update using `mutateCache.create/update/remove`
- INT-MUT-003: `onError` MUST rollback using same `mutateCache` helpers
- INT-MUT-004: New sync metadata (`transactionId`, `sourceId`) added via `{ data, sync }` wrapper

### Context entity patterns (backend)

| Existing code | Location | How sync engine uses it |
|---------------|----------|-------------------------|
| `getContextUser()` | `backend/src/lib/context.ts` | Get authenticated user |
| `getContextOrganization()` | `backend/src/lib/context.ts` | Get current org from route |
| Org guard middleware | `backend/src/middlewares/guard/` | Validates org membership before stream access |

**Integration rules:**
- INT-CTX-001: Stream endpoint MUST use org guard middleware (same as REST endpoints)
- INT-CTX-002: Stream handler MUST use `getContextOrganization()` for orgId
- INT-CTX-003: Subscriber registration MUST capture context at registration time

### CDC & activities

| Existing code | Location | How sync engine uses it |
|---------------|----------|-------------------------|
| `activitiesTable` | `backend/src/db/schema/activities.ts` | Extended with sync columns, not replaced |
| CDC worker | `cdc/src/` | Extended to extract sync columns and NOTIFY |
| `extractActivityContext()` | `cdc/src/utils/` | Extended to read transient sync columns |

**Integration rules:**
- INT-CDC-001: Sync columns added to existing `activitiesTable`, not separate table
- INT-CDC-002: CDC extraction logic extended in existing `extractActivityContext()`
- INT-CDC-003: NOTIFY added after activity INSERT in existing CDC flow

---

## Glossary

| Term | Definition |
|------|------------|
| **Transaction ID** | Client-generated unique identifier using Hybrid Logical Clock (format: `{wallTime}.{logical}.{nodeId}`) |
| **Source ID** | Unique identifier for a browser tab/instance (generated once per page load via `crypto.randomUUID()`) |
| **Activity** | A row in `activitiesTable` representing an entity change (create/update/delete) |
| **Transient sync columns** | Columns on entity tables (`sync_transaction_id`, `sync_source_id`, `sync_changed_field`) written by handlers, read by CDC, overwritten on next mutation |
| **Upstream-first** | Pattern where clients must pull latest server state before pushing mutations |
| **Field-level conflict resolution** | Tiered approach: (1) CRDT merge for compatible types (text, counters, sets), (2) LWW for opaque values (enums, FKs), (3) resolution UI when user input needed |
| **Stream offset** | The `activityId` used for resumption (cursor position in the activity stream) |
| **Subscriber** | An SSE connection registered to receive realtime updates for an organization |

---

## Component Responsibilities

### Backend Handler
- Validates incoming `{ data, sync }` wrapper
- Writes transient sync columns to entity row
- Checks field-level conflicts when `expectedTransactionId` provided
- Implements idempotency via `transactionId` lookup
- Returns `{ data, sync }` wrapper in response

### CDC Worker
- Reads transient sync columns from replicated row
- Populates `transactionId`, `sourceId`, `changedField` in activity record
- Calls `pg_notify('activity', payload)` after activity INSERT
- Includes entity data in NOTIFY payload (from replication row)
- Handles 8KB NOTIFY limit gracefully

### Subscriber Registry (API Server)
- Maintains single LISTEN connection for `activity` channel
- Routes notifications to correct org subscribers
- Applies permission checks using `isPermissionAllowed()`
- Tracks cursor per subscriber
- Cleans up on disconnect

### Stream Endpoint
- Validates org membership via guard middleware
- Supports catch-up mode (fetch activities since offset)
- Supports live SSE mode (register with subscriber registry)
- Uses Cella context helpers for authorization

### Frontend Mutation Hook
- Generates `transactionId` in `onMutate`
- Applies optimistic update before API call
- Tracks transaction state: `pending` → `sent` → `confirmed` | `failed`
- Handles rollback on error

### Frontend Stream Hook
- Opens EventSource to stream endpoint
- Updates React Query cache from events
- Confirms pending transactions when matching event arrives
- Implements hydrate barrier (queue events during initial load)

### Transaction Manager
- Stores pending transactions (memory + IndexedDB)
- Provides `trackTransaction()` and `getTransactionStatus()` APIs
- Confirms transactions when stream event matches

### Tab Coordinator
- Elects leader via Web Locks API
- Leader owns SSE connection
- Broadcasts stream events to follower tabs via BroadcastChannel

---

## Data requirements

### Entity transient sync columns

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| DATA-001 | Product entity tables MUST have `sync_transaction_id` VARCHAR(32) column | DB Schema | Schema includes column |
| DATA-002 | Product entity tables MUST have `sync_source_id` VARCHAR(64) column | DB Schema | Schema includes column |
| DATA-003 | Product entity tables MUST have `sync_changed_field` VARCHAR(64) column | DB Schema | Schema includes column |
| DATA-004 | Transient sync columns MUST be nullable | DB Schema | Column allows NULL |
| DATA-005 | Transient sync columns MUST NOT be exposed in API responses (data portion) | Backend Handler | Response shape validation |

### Activities table extensions

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| DATA-010 | `activitiesTable` MUST have `transaction_id` VARCHAR(32) column | DB Schema | Schema includes column |
| DATA-011 | `activitiesTable` MUST have `source_id` VARCHAR(64) column | DB Schema | Schema includes column |
| DATA-012 | `activitiesTable` MUST have `changed_field` VARCHAR(64) column | DB Schema | Schema includes column |
| DATA-013 | `activitiesTable` MUST have index on `transaction_id` | DB Schema | Index exists |
| DATA-014 | `activitiesTable` MUST have composite index on `(entity_type, entity_id, changed_field)` | DB Schema | Index exists |

### Transaction ID format (hybrid logical clock)

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| DATA-020 | Transaction ID MUST use HLC format: `{wallTime}.{logical}.{nodeId}` | Frontend | Format validation |
| DATA-021 | `wallTime` MUST be Unix timestamp in milliseconds | Frontend | Parsing returns valid timestamp |
| DATA-022 | `logical` MUST be zero-padded 4-digit counter (0000-9999) | Frontend | Logical counter format |
| DATA-023 | `nodeId` MUST equal the tab's `sourceId` | Frontend | Node ID matches source |
| DATA-024 | Transaction IDs MUST be lexicographically sortable | Frontend | String comparison matches temporal order |
| DATA-025 | HLC MUST increment logical counter for same-millisecond events | Frontend | No duplicate timestamps |
| DATA-026 | HLC MUST preserve causality (if A causes B, HLC(A) < HLC(B)) | Frontend | Causal ordering test |

---

## API contract requirements

### Sync wrapper schema

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| API-001 | Mutation requests MUST accept `{ data, sync }` wrapper | Backend Route | OpenAPI schema validation |
| API-002 | `sync.transactionId` MUST be required for tracked entities | Backend Route | Validation rejects missing |
| API-003 | `sync.sourceId` MUST be required for tracked entities | Backend Route | Validation rejects missing |
| API-004 | `sync.changedField` MUST be required for update mutations | Backend Route | Validation rejects missing |
| API-005 | `sync.expectedTransactionId` MUST be optional | Backend Route | Validation accepts null/undefined |
| API-006 | Mutation responses MUST return `{ data, sync }` wrapper | Backend Handler | Response shape validation |
| API-007 | Response `sync.transactionId` MUST echo request's transactionId | Backend Handler | Echo verification |

### Conflict response

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| API-010 | Field conflict MUST return HTTP 409 | Backend Handler | Status code check |
| API-011 | Conflict response MUST include `code: 'FIELD_CONFLICT'` | Backend Handler | Response body validation |
| API-012 | Conflict response MUST include `field` (which field conflicted) | Backend Handler | Response body validation |
| API-013 | Conflict response MUST include `expectedTransactionId` (what client sent) | Backend Handler | Response body validation |
| API-014 | Conflict response MUST include `serverTransactionId` (current server value) | Backend Handler | Response body validation |

### Idempotency

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| API-020 | Duplicate `transactionId` MUST return existing entity (not create new) | Backend Handler | Idempotent create |
| API-021 | Idempotent response MUST return HTTP 200 (not 201) | Backend Handler | Status code for duplicate |
| API-022 | Idempotent response MUST include same `sync.transactionId` | Backend Handler | Response validation |

### Upstream-first backend enforcement

Backend can optionally enforce that clients are "caught up" before accepting mutations. This prevents stale writes from clients that haven't received recent changes, complementing the client-side upstream-first pattern. When enabled, the server compares the client's last-seen stream offset against the current server offset and rejects mutations from clients that are too far behind.

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| API-030 | `sync.streamOffset` MUST be optional in mutation requests | Backend Route | Schema allows null/undefined |
| API-031 | If `streamOffset` provided, server MUST compare to latest activityId for org | Backend Handler | Comparison executed |
| API-032 | If client offset is > threshold events behind, MUST return HTTP 409 | Backend Handler | Stale client rejected |
| API-033 | Stale client response MUST include `code: 'STREAM_BEHIND'` | Backend Handler | Response body validation |
| API-034 | Stale client response MUST include `serverOffset` (current latest) | Backend Handler | Response body validation |
| API-035 | Stale client response MUST include `clientOffset` (what client sent) | Backend Handler | Response body validation |
| API-036 | Threshold SHOULD be configurable (default: 10 events) | Backend Handler | Config-driven |
| API-037 | If `streamOffset` not provided, enforcement MUST be skipped | Backend Handler | Backwards compatible |

---

## CDC requirements

### Context extraction

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CDC-001 | CDC MUST read `sync_transaction_id` from replicated row | CDC Worker | Activity has transactionId |
| CDC-002 | CDC MUST read `sync_source_id` from replicated row | CDC Worker | Activity has sourceId |
| CDC-003 | CDC MUST read `sync_changed_field` from replicated row | CDC Worker | Activity has changedField |
| CDC-004 | For INSERT actions, `changedField` MAY be null or '*' | CDC Worker | Insert activity validation |
| CDC-005 | For DELETE actions, `changedField` MAY be null or '*' | CDC Worker | Delete activity validation |

### NOTIFY integration

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CDC-010 | CDC MUST call `pg_notify('activity', payload)` after activity INSERT | CDC Worker | LISTEN receives notification |
| CDC-011 | NOTIFY payload MUST include `orgId` | CDC Worker | Payload structure |
| CDC-012 | NOTIFY payload MUST include `activityId` | CDC Worker | Payload structure |
| CDC-013 | NOTIFY payload MUST include `entityType` | CDC Worker | Payload structure |
| CDC-014 | NOTIFY payload MUST include `entityId` | CDC Worker | Payload structure |
| CDC-015 | NOTIFY payload MUST include `action` ('create', 'update', 'delete') | CDC Worker | Payload structure |
| CDC-016 | NOTIFY payload MUST include `transactionId` (nullable) | CDC Worker | Payload structure |
| CDC-017 | NOTIFY payload MUST include `sourceId` (nullable) | CDC Worker | Payload structure |
| CDC-018 | NOTIFY payload MUST include `changedField` (nullable) | CDC Worker | Payload structure |
| CDC-019 | NOTIFY payload MUST include `entity` data from replication row | CDC Worker | Payload includes entity |
| CDC-020 | If payload exceeds 7500 bytes, `entity` MUST be set to null | CDC Worker | Large entity handling |

---

## Stream requirements

### Stream endpoint

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-001 | Stream endpoint MUST require org guard middleware | Backend Route | Unauthenticated returns 401 |
| STREAM-002 | Non-member MUST receive 403 | Backend Route | Non-member access denied |
| STREAM-003 | `offset=-1` MUST return all activities for org | Stream Handler | Full history retrieval |
| STREAM-004 | `offset=now` MUST return empty and set cursor to latest | Stream Handler | Now offset behavior |
| STREAM-005 | `offset={number}` MUST return activities with id > offset | Stream Handler | Cursor-based pagination |
| STREAM-006 | `live=sse` MUST return SSE stream (Content-Type: text/event-stream) | Stream Handler | Content type check |
| STREAM-007 | `entityTypes` param MUST filter to specified types | Stream Handler | Filtering works |
| STREAM-008 | Catch-up MUST complete before registering for live events | Stream Handler | Order of operations |

### Subscriber registry

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-010 | Registry MUST maintain single LISTEN connection | Subscriber Registry | Connection count = 1 |
| STREAM-011 | Registry MUST route notifications by `orgId` | Subscriber Registry | Cross-org isolation |
| STREAM-012 | Registry MUST skip events with `activityId <= subscriber.cursor` | Subscriber Registry | No duplicate delivery |
| STREAM-013 | Registry MUST apply `entityTypes` filter per subscriber | Subscriber Registry | Type filtering |
| STREAM-014 | Registry MUST call `isPermissionAllowed()` before sending | Subscriber Registry | Permission denied = not sent |
| STREAM-015 | Registry MUST clean up subscriber on disconnect | Subscriber Registry | Memory cleanup |

### Stream event format

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-020 | Event MUST have `event: 'change'` type | Stream Handler | SSE event type |
| STREAM-021 | Event MUST include `data` (entity or null for delete) | Stream Handler | Event structure |
| STREAM-022 | Event MUST include `sync.transactionId` | Stream Handler | Event structure |
| STREAM-023 | Event MUST include `sync.sourceId` | Stream Handler | Event structure |
| STREAM-024 | Event MUST include `sync.changedField` | Stream Handler | Event structure |
| STREAM-025 | Event MUST include `sync.action` | Stream Handler | Event structure |
| STREAM-026 | Event MUST include `sync.activityId` | Stream Handler | Event structure |
| STREAM-027 | SSE `id` field MUST equal `activityId` (for resumption) | Stream Handler | SSE id field |

---

## Frontend mutation requirements

### Transaction generation

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| FE-MUT-001 | `onMutate` MUST generate `transactionId` before optimistic update | Mutation Hook | Transaction created in onMutate |
| FE-MUT-002 | `transactionId` MUST be passed to API in `sync` wrapper | Mutation Hook | API receives transactionId |
| FE-MUT-003 | `sourceId` MUST be module-level constant (same for all mutations in tab) | Mutation Hook | sourceId consistency |
| FE-MUT-004 | Update mutations MUST include `changedField` in sync | Mutation Hook | Field tracking |

### Optimistic updates

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| FE-MUT-010 | Optimistic update MUST be applied before API call starts | Mutation Hook | UI updates immediately |
| FE-MUT-011 | Optimistic data MUST be removed on mutation error | Mutation Hook | Rollback on error |
| FE-MUT-012 | Real data MUST replace optimistic data on success | Mutation Hook | Data replacement |

### Transaction tracking

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| FE-MUT-020 | Transaction MUST be tracked as `pending` in onMutate | Transaction Manager | State = pending |
| FE-MUT-021 | Transaction MUST transition to `sent` on API success | Transaction Manager | State = sent |
| FE-MUT-022 | Transaction MUST transition to `failed` on API error | Transaction Manager | State = failed |
| FE-MUT-023 | Transaction MUST transition to `confirmed` when stream event arrives | Transaction Manager | State = confirmed |
| FE-MUT-024 | Pending transactions MUST be persisted to IndexedDB | Transaction Manager | Survives refresh |

---

## Conflict detection requirements

### Backend conflict check

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CONFLICT-001 | If `expectedTransactionId` provided, handler MUST check activitiesTable | Backend Handler | Query executed |
| CONFLICT-002 | Query MUST find latest activity for `(entityType, entityId, changedField)` | Backend Handler | Correct query |
| CONFLICT-003 | If latest `transactionId` ≠ `expectedTransactionId`, MUST return 409 | Backend Handler | Conflict detected |
| CONFLICT-004 | If no previous activity for field, conflict check MUST pass | Backend Handler | First write succeeds |
| CONFLICT-005 | If `expectedTransactionId` is null/undefined, conflict check MUST be skipped | Backend Handler | Optional check |

### Frontend conflict handling

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CONFLICT-010 | Frontend MUST track last-seen `transactionId` per `(entityId, field)` | Field Transaction Store | State maintained |
| CONFLICT-011 | Stream events MUST update field transaction tracking | Stream Hook | Tracking updated |
| CONFLICT-012 | `getExpectedTransactionId(entityId, field)` MUST return last-seen value | Field Transaction Store | Correct lookup |
| CONFLICT-013 | 409 response MUST trigger merge strategy (CRDT → LWW → UI) | Mutation Hook | Tiered resolution |

### Merge strategy

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| MERGE-001 | Merge strategy MUST first attempt CRDT merge for compatible field types | Conflict Resolver | CRDT attempted |
| MERGE-002 | Text fields SHOULD support operational transform or diff-merge | Conflict Resolver | Text merge works |
| MERGE-003 | Counter fields SHOULD support increment/decrement merge | Conflict Resolver | Counter merge works |
| MERGE-004 | Set/array fields SHOULD support union merge | Conflict Resolver | Set merge works |
| MERGE-005 | If CRDT merge not possible, MUST fall back to LWW (server value wins) | Conflict Resolver | LWW fallback |
| MERGE-006 | If LWW not acceptable to user, MUST show resolution UI | Conflict Resolver | UI shown |
| MERGE-007 | Field schema SHOULD declare merge strategy hint (`crdt`, `lww`, `manual`) | Schema Config | Configurable |

---

## Offline requirements

### Mutation outbox

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| OFFLINE-001 | Offline mutations MUST be queued to IndexedDB | Mutation Outbox | Persisted to storage |
| OFFLINE-002 | Outbox entries MUST include `entityType`, `entityId`, `field` | Mutation Outbox | Entry structure |
| OFFLINE-003 | Outbox entries MUST include `transactionId` (same across retries) | Mutation Outbox | Idempotency key |
| OFFLINE-004 | Outbox entries MUST include `expectedTransactionId` | Mutation Outbox | Conflict detection |
| OFFLINE-005 | Same-field mutations MUST squash (keep latest value only) | Mutation Outbox | Squashing behavior |
| OFFLINE-006 | Different-field mutations MUST queue separately | Mutation Outbox | No cross-field squash |

### Upstream-first sync

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| OFFLINE-010 | On reconnect, stream MUST catch up BEFORE flushing outbox | Sync Coordinator | Order of operations |
| OFFLINE-011 | If stream event conflicts with queued mutation (same field), mark as `conflicted` | Sync Coordinator | Conflict detection |
| OFFLINE-012 | Conflicted mutations MUST NOT be auto-flushed | Sync Coordinator | Awaits resolution |
| OFFLINE-013 | Non-conflicted mutations MUST be flushed in order | Sync Coordinator | Sequential flush |

### Conflict resolution UI

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| OFFLINE-020 | Conflicted entity MUST show visual indicator | UI Component | Badge/icon visible |
| OFFLINE-021 | Conflict dialog MUST show user's value vs server value | UI Component | Side-by-side display |
| OFFLINE-022 | "Keep Mine" action MUST rebase mutation (update expectedTx) | Conflict Resolver | Mutation updated |
| OFFLINE-023 | "Keep Server" action MUST discard queued mutation | Conflict Resolver | Mutation removed |
| OFFLINE-024 | "Merge" action MUST accept user-provided value | Conflict Resolver | Custom merge |

---

## Multi-tab requirements

### Leader election

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| TAB-001 | Only one tab MUST hold the leader lock at a time | Tab Coordinator | Exclusive lock |
| TAB-002 | Leader lock MUST use Web Locks API with name `{$appConfig.slug}-sync-leader` | Tab Coordinator | Lock name |
| TAB-003 | Leader MUST open SSE connection | Tab Coordinator | Connection ownership |
| TAB-004 | Followers MUST NOT open SSE connection | Tab Coordinator | No duplicate connections |

### Cross-tab communication

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| TAB-010 | Leader MUST broadcast stream events via BroadcastChannel | Tab Coordinator | Broadcast sent |
| TAB-011 | BroadcastChannel name MUST be `{$appConfig.slug}-sync` | Tab Coordinator | Channel name |
| TAB-012 | Followers MUST apply broadcast events to React Query cache | Tab Coordinator | Cache updated |
| TAB-013 | Follower cache update MUST match leader cache update | Tab Coordinator | Consistent state |

### Leader handoff

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| TAB-020 | On leader tab close, another tab MUST acquire lock | Tab Coordinator | Handoff occurs |
| TAB-021 | New leader MUST open SSE from last known offset | Tab Coordinator | Resume from cursor |
| TAB-022 | Foreground tabs SHOULD be preferred for leadership | Tab Coordinator | Visibility preference |

---

## Security requirements

### Authorization

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| SEC-001 | Stream endpoint MUST validate org membership before registration | Stream Handler | Non-member rejected |
| SEC-002 | `isPermissionAllowed()` MUST be called for each entity in broadcast | Subscriber Registry | Permission check |
| SEC-003 | Subscribers MUST store `memberships` for permission checks | Subscriber Registry | Membership stored |
| SEC-004 | System admins (`userSystemRole === 'admin'`) MUST bypass entity ACLs | Subscriber Registry | Admin access |
| SEC-005 | Permission check MUST use same logic as REST handlers | Subscriber Registry | Consistent authorization |

### Data isolation

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| SEC-010 | NOTIFY payloads MUST NOT leak across organizations | Subscriber Registry | Org isolation |
| SEC-011 | Stream MUST only deliver events for subscribed org | Stream Handler | Cross-org blocked |
| SEC-012 | Entity data in NOTIFY MUST NOT include sensitive computed fields | CDC Worker | No password hashes etc |

---

## Performance requirements

### Latency

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| PERF-001 | Optimistic update MUST appear in < 50ms from user action | Mutation Hook | UI timing |
| PERF-002 | Stream event MUST arrive within 100ms of CDC processing | Full Pipeline | E2E timing |
| PERF-003 | Catch-up query MUST complete in < 500ms for 100 activities | Activity Fetcher | Query timing |

### Scalability

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| PERF-010 | LISTEN connection count MUST be 1 per API server instance | Subscriber Registry | Connection count |
| PERF-011 | Fan-out MUST be O(subscribers per org), not O(total subscribers) | Subscriber Registry | Lookup efficiency |
| PERF-012 | Entity fetch SHOULD be avoided when NOTIFY includes entity data | Subscriber Registry | Zero extra queries |
| PERF-013 | Oversized entity fallback MUST fetch at most 1 entity per event | Subscriber Registry | Bounded queries |

### Resource limits

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| PERF-020 | Catch-up query MUST limit to 100 activities per request | Activity Fetcher | LIMIT clause |
| PERF-021 | NOTIFY payload MUST stay under 8KB (truncate entity at 7.5KB) | CDC Worker | Payload size |
| PERF-022 | IndexedDB transaction store MUST limit to 1000 entries | Transaction Manager | Cleanup old entries |

---

## Appendix: Requirement cross-reference

### By implementation phase

| Phase | Requirements |
|-------|--------------|
| Phase 1: Schema | DATA-001 to DATA-014 |
| Phase 2: Frontend Infra | DATA-020 to DATA-026, FE-MUT-001 to FE-MUT-004, INT-QUERY-001 to INT-QUERY-005 |
| Phase 3: Mutation Hooks | FE-MUT-010 to FE-MUT-024, API-001 to API-022, INT-MUT-001 to INT-MUT-004 |
| Phase 4: Backend Handlers | API-001 to API-022, CONFLICT-001 to CONFLICT-005, INT-CTX-001 to INT-CTX-003 |
| Phase 5: Stream | CDC-001 to CDC-020, STREAM-001 to STREAM-027, SEC-001 to SEC-012, INT-PERM-001 to INT-PERM-004, INT-CDC-001 to INT-CDC-003 |
| Phase 6: Offline + Merge | OFFLINE-001 to OFFLINE-024, CONFLICT-010 to CONFLICT-013, MERGE-001 to MERGE-007 |
| Phase 7: Multi-Tab | TAB-001 to TAB-022 |
| Future: Backend Enforcement | API-030 to API-037 |

### By test type

| Test Type | Requirements |
|-----------|--------------|
| Unit Tests | DATA-020 to DATA-026, FE-MUT-001 to FE-MUT-004, CONFLICT-010 to CONFLICT-013, MERGE-001 to MERGE-007 |
| Integration Tests | API-001 to API-037, CDC-001 to CDC-020, STREAM-001 to STREAM-027 |
| E2E Tests | PERF-001 to PERF-002, OFFLINE-010 to OFFLINE-013, TAB-001 to TAB-022 |
| Schema Tests | DATA-001 to DATA-014 |
| Security Tests | SEC-001 to SEC-012 |

---

*This requirements document should be kept in sync with HYBRID_SYNC_ENGINE_PLAN.md as implementation progresses.*
