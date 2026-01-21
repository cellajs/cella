# Hybrid Sync Engine - Requirements Specification

This document defines the requirements for building the Hybrid Sync Engine. It combines **design decisions** (the "why") with **testable contracts** (the "what").

> **Related documents:**
> [HYBRID_SYNC_ENGINE_PLAN.md](./HYBRID_SYNC_ENGINE_PLAN.md) - Implementation plan, code examples, and TODO list

---

## Scope Boundaries

### Out-of-scope: Existing SSE infrastructure

Cella has an existing SSE system for user-scoped realtime updates. This is **out-of-scope** for the sync engine work:

| Component | Location | Purpose |
|-----------|----------|--------|
| `/me/sse` endpoint | `backend/src/modules/me/me-handlers.ts` | User-scoped SSE connection |
| `sendSSE`, `sendSSEByUserIds` | `backend/src/lib/sse.ts` | Push events to connected users |
| `useSSE`, `useTypedSSE` | `frontend/src/modules/common/sse/` | React hooks for SSE subscription |
| `SSEContext`, `SSEProvider` | `frontend/src/modules/common/sse/` | EventSource context provider |
| `SSEEventsMap` | `frontend/src/modules/common/sse/index.tsx` | Typed event definitions |

**Current usage:** Membership changes, entity CRUD for context entities (organizations).

**Why out-of-scope:**
- User-scoped (keyed by userId) vs. sync engine org-scoped (keyed by orgId)
- No transaction tracking, no offline support
- Different authorization model (user session vs. org membership)
- Works for context entities; sync engine targets product entities

**Future work:** Consolidate existing SSE with sync engine patterns:
- Migrate context entity updates to use ActivityBus
- Unify frontend hooks (`useSSE` → live stream hooks)
- Single SSE connection strategy across all realtime needs

> **Guidance for implementers:** Ignore the existing `/me/sse` code paths during sync engine work. Do not modify `sendSSE`, `sendSSEByUserIds`, `useSSE`, or `useTypedSSE`. The new org-scoped live stream endpoint is a separate implementation.

---

## Terminology

This section defines precise vocabulary for concepts that could otherwise be confused.

### Core concepts

| Term | Definition | Example |
|------|------------|--------|
| **Activity** | A record in `activitiesTable` representing an entity change | `{ type: 'page.updated', entityId: '...' }` |
| **Activity log** | The `activitiesTable` as durable storage of all entity changes (not "event log") | Queryable via catch-up, source of truth for history |
| **NOTIFY payload** | The JSON sent via `pg_notify('cella_activities', ...)` | Trigger sends activity-only; CDC Worker sends activity + entity |
| **Activity notification** | The typed object ActivityBus emits after parsing a NOTIFY payload | `ActivityEvent` interface in `activity-bus.ts` |
| **Live stream** | The org-scoped SSE connection for `realtime` opMode entities | `/organizations/:slug/live` endpoint |
| **Stream message** | The SSE payload delivered via live stream (type `'change'` or `'offset'`) | `{ data, tx }` wrapper sent over SSE |
| **Live update** | A realtime entity change pushed via live stream (not "live event") | Entity data from CDC Worker NOTIFY → stream message |
| **Transaction** | A client-initiated mutation identified by `transactionId` | Tracks lifecycle: pending → sent → confirmed |

### Sync patterns

| Term | Definition | Why it matters |
|------|------------|----------------|
| **Upstream-first** | Pull latest server state before pushing mutations | See "Online vs offline sync" below |
| **Optimistic update** | Apply UI changes immediately, before server confirms | Instant UX; rolled back only if server rejects |
| **Catch-up** | Query `activitiesTable` for changes since client's last offset | Used on SSE reconnect to fill gaps; distinct from live push |
| **Backfill** | Same as catch-up; sometimes used to emphasize historical data fetch | Alternative term in sync literature |
| **Upstream change** | A server-side mutation that client must pull before pushing its own | What client pulls before pushing |

### Online vs offline sync

Upstream-first means "pull before push" - but how this works differs by connectivity:

**Online (stream connected)**:
- Stream keeps client continuously up-to-date
- Mutations sent immediately after optimistic update
- Conflicts are rare: only truly concurrent edits (same field, same moment) can conflict

**Offline (queued mutations)**:
- Mutations queue locally in IndexedDB outbox
- User continues working, sees optimistic updates
- On reconnect: catch-up first, THEN flush outbox
- Conflict likelihood grows with offline duration (more server changes accumulated)
- **Rich client advantage**: Conflicts detected client-side before pushing, enabling:
  - Side-by-side comparison (your value vs server value)
  - Per-field resolution (keep mine, keep theirs, merge)
  - Batch review of multiple conflicts
  - No 409 errors - user resolves proactively

This is why Cella's hybrid approach works: most users are online most of the time (upstream-first eliminates conflicts), but when offline, the rich client provides graceful conflict resolution that server-side 409s cannot match.

### Conflict handling

| Term | Definition | When used |
|------|------------|-----------|
| **LWW (Last Write Wins)** | Conflict resolution where server value wins | Default - all field types |
| **Field-level tracking** | Track which field a mutation changes, not just the entity | Allows concurrent edits to different fields without conflict |
| **Mutation outbox** | IndexedDB queue of pending mutations awaiting sync | Persists offline mutations; enables squashing and conflict detection |
| **Squashing** | Merge multiple mutations to same field into one | User types fast offline → only final value sent |
| **Rebase** | Update mutation's `expectedTransactionId` after upstream change | "Keep Mine" conflict resolution - retry with new baseline |

### Multi-tab coordination

| Term | Definition | Why it matters |
|------|------------|----------------|
| **Leader tab** | The one browser tab that holds the sync lock and owns SSE | Prevents duplicate connections and race conditions |
| **Follower tab** | Any tab that receives updates via BroadcastChannel from leader | Gets same data without opening its own SSE |
| **Fan-out** | Distributing one activity notification to multiple subscribers | O(1) lookup by org, then O(subscribers) for that org |
| **BroadcastChannel** | Browser API for cross-tab messaging | How leader distributes stream messages to followers |
| **Web Locks API** | Browser API for exclusive locks | How leader election works - one tab holds `{slug}-sync-leader` |

### Identifiers and cursors

| Term | Definition | Format/Example |
|------|------------|----------------|
| **Transaction ID** | Client-generated ID for a mutation, used for idempotency and tracking | HLC format: `{wallTime}.{logical}.{nodeId}` (32 chars) |
| **HLC (Hybrid Logical Clock)** | Timestamp format preserving causality across clients | Sortable, unique, causality-preserving |
| **Stream offset** | The `activityId` marking client's position in the activity stream | Persisted to IndexedDB; used for catch-up on reconnect |
| **Cursor** | Server-side tracker of where each subscriber is in the stream | Prevents duplicate delivery; advanced on each send |
| **Source ID** | Identifies which tab/instance made a mutation | Prevents echo (don't re-apply your own change from stream) |

### Avoid these terms

| Avoid | Use instead | Why |
|-------|-------------|-----|
| "event log" | **activity log** | Reserves "event" for specific uses |
| "stream event" | **stream message** | Distinguishes from SSE event type field |
| "ActivityBus event" | **activity notification** | Clarifies what ActivityBus emits |
| "live event" | **live update** | Consistency with "upstream change" |
| "upstream event" | **upstream change** | Not an event, it's server state |

---

## Design Decisions

This section captures key architectural decisions, invariants, and constraints that guide implementation. AI agents should reference this section first.

### Invariants (must ALWAYS be true)

| ID | Invariant | Rationale |
|----|-----------|-----------|
| INV-1 | Optimistic updates happen BEFORE checking stream/online status | User sees instant feedback regardless of sync state |
| INV-2 | Transaction IDs are immutable once generated | Same ID used for retries enables idempotency |
| INV-3 | CDC Worker is the single source of truth for activity history | Entity tables have transient `tx` JSONB that gets overwritten |
| INV-4 | Upstream-first controls when mutations are SENT, not when user sees changes | Distinguishes sync guarantees from UX |
| INV-5 | One mutation = one transaction = one field change | `tx.changedField` declares which single field is targeted; `data` object may contain entity structure but only declared field is tracked for conflicts |
| INV-6 | Only leader tab opens SSE connection | Prevents duplicate connections and race conditions |
| INV-7 | Live updates receive entity data from CDC Worker NOTIFY; catch-up queries JOIN with entity tables | Two paths for entity data: CDC Worker has it from replication, catch-up must fetch it |
| INV-8 | No type assertions (`as`, `as unknown as`, `!`) in sync code paths | Type safety catches sync bugs at compile time; casts hide data shape mismatches |

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
  - Character-level: Too complex, requires specialized libraries
- **Trade-off**: Multiple API calls for multi-field edits, but dramatically reduces conflicts

#### DEC-3: Merge strategy (LWW → UI)
- **Decision**: LWW as default, resolution UI as fallback
- **Merge order**:
  1. LWW (server wins) - default for all fields
  2. Resolution UI when user input needed (configurable per field)
- **Trade-off**: Simple implementation; "server wins" may not suit all use cases but resolution UI provides escape hatch

#### DEC-4: CDC Worker includes entity data in NOTIFY payload
- **Decision**: Pass full entity from replication row, not just metadata
- **Alternatives rejected**:
  - API server fetches entity: Extra DB query per event
  - Store entity in activity table: Bloats activity storage
- **Trade-off**: Occasional fallback fetch for >7.5KB entities, but zero queries for 99% of events

#### DEC-5: Transient tx column as JSONB object
- **Decision**: Single `tx` JSONB column containing `{ transactionId, sourceId, changedField }`
- **Alternatives rejected**:
  - Separate sync metadata table: Extra join, complexity
  - Store in activity only: Handler can't pass to CDC Worker via replication
  - Three separate columns: More schema clutter, less extensible
- **Trade-off**: One extra column per product entity; slightly more verbose query syntax but extensible and matches API shape

#### DEC-6: Upstream-first pattern
- **Decision**: Pull before push - see [online vs offline sync](#online-vs-offline-sync) for full explanation
- **Alternatives rejected**:
  - Downstream-first: Complex merge on server
  - No ordering: Random conflict resolution
- **Trade-off**: Slight latency when behind, but predictable ordering and client-side conflict resolution

#### DEC-7: activitiesTable as activity log (no separate sync table)
- **Decision**: Extend existing activities with tx column, not new table
- **Alternatives rejected**:
  - Separate `sync_transactions` table: Duplicate data, extra complexity
  - In-memory only: Lost on restart
- **Trade-off**: Couples sync to audit log, but reuses existing infrastructure

#### DEC-8: React Query as cache layer (not custom store)
- **Decision**: Feed stream messages into React Query cache, not parallel state. 
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

#### DEC-10: Single LISTEN via ActivityBus, subscriber routing for fan-out
- **Decision**: ActivityBus maintains one PostgreSQL LISTEN connection for `cella_activities`; Stream subscribers register for routing via in-memory registry
- **How it works**:
  - ActivityBus: Single LISTEN connection, parses NOTIFY payloads, emits activity notifications (see DEC-20)
  - Stream Subscribers: Register interest per orgId, receive filtered notifications
  - Separation: ActivityBus handles connection; subscriber routing handles fan-out + permissions
- **Alternatives rejected**:
  - Per-SSE LISTEN connection: Connection pool exhaustion
  - Polling: 500ms+ latency, N queries per interval
  - External pub/sub (Redis): Additional infrastructure dependency
- **Trade-off**: In-memory state (lost on restart, but clients reconnect), but O(1) DB connections

#### DEC-11: Unified NOTIFY - CDC Worker extends trigger payload with entity data
- **Decision**: CDC Worker calls `pg_notify('cella_activities', payload)` on the **same channel** as the existing trigger, but with enriched payload that includes entity data from replication row
- **How it works**:
  - Existing trigger fires on activities INSERT: sends `{ id, type, entityType, entityId, action, ... }` (activity-only)
  - CDC Worker ALSO calls NOTIFY on same channel: sends `{ ...activity, entity: {...} }` (activity + entity)
  - ActivityBus receives both, handles both payload shapes gracefully
  - For product entities in realtime mode, CDC Worker payload includes entity data (zero extra queries)
  - For context entities or basic mode, trigger payload is still received (handlers fetch entity if needed)
- **Alternatives rejected**:
  - Dual-channel (separate `cella_sync` channel): Complexity, two LISTEN connections, confusing ownership
  - Disable trigger when CDC Worker active: Breaks basic mode, complicates deployment
  - API server triggers NOTIFY: API doesn't have entity data, would need extra fetch
- **Trade-off**: Two NOTIFY sources for same channel, but unified consumer and backward compatible

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

#### DEC-14: Stream subscriber routing keyed by orgId
- **Decision**: Stream subscriber manager uses `Map<orgId, Set<Subscriber>>` for O(1) org lookup during event routing
- **Note**: This is the routing layer that subscribes to ActivityBus (see DEC-10, DEC-20), not the LISTEN connection itself
- **Alternatives rejected**:
  - Flat subscriber list: O(N) scan per event
  - Nested by entity type: Premature optimization, adds complexity
- **Trade-off**: Memory proportional to active orgs, but fast fan-out

#### DEC-15: Two paths for entity data (live vs catch-up)
- **Decision**: Live updates include entity data from ActivityBus (which gets it from CDC Worker NOTIFY payload); catch-up queries JOIN activities with entity tables
- **Why two paths**:
  - CDC Worker has entity data from PostgreSQL logical replication row
  - After activity is inserted, entity data is NOT stored in activitiesTable (per DEC-7)
  - Catch-up queries only have activitiesTable, must JOIN to get entity data
- **Live path**: `CDC Worker replication row → NOTIFY payload → ActivityBus → Stream handler → stream message`
- **Catch-up path**: `SELECT activities JOIN pages/attachments → API → HTTP response`
- **Alternatives rejected**:
  - Store entity snapshot in activitiesTable: Bloats storage, duplicates data
  - Catch-up refetches via LIST endpoints: Client complexity, permission differences
  - CDC Worker stores entity then catch-up reads it: Requires separate storage, stale data risk
- **Trade-off**: Two code paths to maintain, but optimal for both scenarios (no extra queries live, no storage bloat)

#### DEC-16: Unified network status service (replace onlineManager)
- **Decision**: Create a global network status service that replaces TanStack Query's `onlineManager` with enhanced connectivity detection
- **Capabilities**:
  - Browser `navigator.onLine` + online/offline events (basic)
  - Network Information API for `effectiveType` (slow-2g, 2g, 3g, 4g)
  - Periodic health check verification (actual server reachability)
  - Poor connection detection via API response timing
- **Use cases**:
  - `isOnline`: Basic online/offline (mutation queue, SSE reconnect)
  - `isVerified`: Confirmed server reachability (distinguish airplane mode from server down)
  - `effectiveType`: Adaptive behavior for slow connections (e.g., enter offline mode proactively)
- **Alternatives rejected**:
  - Keep using `onlineManager`: No connectivity verification, no slow connection detection
  - Per-component network detection: Inconsistent state across app
- **Trade-off**: Health check requests add minimal overhead, but provide reliable connectivity status
- **Future consideration**: Auto-enable `offlineAccess` mode when `effectiveType` is slow-2g/2g or when API response times exceed threshold

#### DEC-17: tx JSONB on activitiesTable (distinct from changedKeys)
- **Decision**: Activities table has `tx` JSONB column for transaction metadata, separate from existing `changedKeys`
- **Why separate columns**:
  - `changedKeys`: CDC Worker-detected array of fields that changed (used by activity feed, all entities)
  - `tx`: Client-declared transaction metadata (used by sync engine, product entities only)
  - `tx: null` for non-synced entities (organizations, memberships)
- **Alternatives rejected**:
  - Merge into `changedKeys`: Conflates detected vs declared data
  - Three separate columns: Less extensible, doesn't group related data
- **Trade-off**: Two similar-sounding fields, but semantically distinct with exclusive consumers

#### DEC-18: Data object uses standard entity structure
- **Decision**: The `data` object in `{ data, tx }` wrapper accepts standard entity update shape; `tx.changedField` declares which single field is tracked for conflict detection
- **Behavior**:
  - `data` uses familiar partial update shape (same as context entity endpoints)
  - `tx.changedField` declares which field is tracked for conflict detection
  - Only the declared `changedField` is stored in activity and used for conflict detection
  - Backend MAY validate that only declared field is present in `data` (strict mode)
- **Why this design**:
  - Consistent API: Frontend sends familiar partial update objects
  - Clear contract: `tx.changedField` makes intent explicit
  - Reusable schemas: `data` shape can share validation with context entities
- **Alternatives rejected**:
  - Separate endpoints per field: Explosion of endpoints
  - Different data structure for synced: Inconsistent API surface
- **Trade-off**: Client must send multiple mutations for multi-field edits, but conflicts are isolated per-field

#### DEC-19: Transaction wrapper is required for product entities (no legacy mode)
- **Decision**: Product entity mutation endpoints REQUIRE `{ data, tx }` wrapper - the `tx` property is mandatory, not optional
- **Scope**: Only applies to product entities (pages, attachments) - context entities (organizations, memberships) continue to use simple request bodies
- **No legacy mode**: All product entity mutations must include transaction metadata; there is no "legacy" code path in handlers
- **Why this design**:
  - Consistency: All mutations for a product entity are tracked, no gaps in transaction history
  - Simpler handlers: No detection logic needed, always expect `{ data, tx }`
  - Reliable conflict detection: Every mutation has a transactionId, expectedTransactionId works reliably
  - No migration complexity: Product entities are new/upgraded, no legacy clients to support
- **Alternatives rejected**:
  - Optional tx wrapper: Creates gaps in transaction tracking, complicates offline queue
  - Separate synced endpoints: Doubles API surface (see rationale below)
- **Clarification**: We still avoid separate `/pages/synced` endpoints. The existing endpoint path is used, but request schema is upgraded to require tx wrapper

#### DEC-20: Unified ActivityBus for internal + sync events
- **Decision**: The existing EventBus (`backend/src/lib/event-bus.ts`) is renamed to ActivityBus and upgraded to serve both internal handlers AND live stream consumers
- **How it works**:
  - ActivityBus LISTENs to `cella_activities` channel (unchanged)
  - `ActivityEvent` interface extended with optional `entity: Record<string, unknown> | null`
  - When CDC Worker sends enriched payload, ActivityBus parses `entity` field
  - When trigger sends activity-only payload, `entity` is undefined/null
  - Live stream handlers use `event.entity` when present; fallback fetch when null
  - Existing internal handlers continue to work (they don't need entity data)
- **Benefits**:
  - Single ActivityBus serves all realtime needs
  - No duplicate LISTEN connections
  - Backward compatible - existing handlers unaffected
  - Progressive - entity data available when CDC Worker is running
- **Alternatives rejected**:
  - Separate SubscriberRegistry for sync: Duplicate infrastructure
  - New ActivityBus for sync only: Two LISTEN connections per org
- **Trade-off**: ActivityBus becomes more central, but consolidates realtime infrastructure

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
- INT-PERM-001: Stream subscriber manager MUST store `memberships` from request context
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
- INT-QUERY-001: Stream messages MUST update cache via `queryClient.setQueryData()` / `setQueriesData()`
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
- INT-MUT-004: New transaction metadata (`transactionId`, `sourceId`) added via `{ data, tx }` wrapper

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

### CDC Worker & activities

| Existing code | Location | How sync engine uses it |
|---------------|----------|-------------------------|
| `activitiesTable` | `backend/src/db/schema/activities.ts` | Extended with tx column, not replaced |
| CDC Worker | `cdc/src/` | Extended to extract tx column and NOTIFY |
| `extractActivityContext()` | `cdc/src/utils/` | Extended to read transient tx column |

**Integration rules:**
- INT-CDC-001: tx column added to existing `activitiesTable`, not separate table
- INT-CDC-002: CDC Worker extraction logic extended in existing `extractActivityContext()`
- INT-CDC-003: NOTIFY added after activity INSERT in existing CDC Worker flow

---

## Sync primitives by opMode

| Primitive | `basic` (context entities) | `offline`/`realtime` (synced entities) |
|-----------|---------------------------|---------------------------------------|
| `transactionId` | ❌ Not used | ✅ Required - client-generated HLC |
| `sourceId` | ❌ Not used | ✅ Required - tab identifier |
| `tx.changedField` | ❌ Not used | ✅ Required for updates |
| `changedKeys` | ✅ Auto-populated by CDC Worker | ✅ Auto-populated by CDC Worker |
| `{ data, tx }` wrapper | ❌ Simple request body | ✅ Required wrapper format |
| Conflict detection | ❌ Not supported | ✅ Field-level via `expectedTransactionId` |
| Idempotency | ❌ Not supported | ✅ Via `transactionId` lookup |

> **Key insight**: Context entities (`organization`, `membership`) use standard REST patterns. Only product entities (`page`, `attachment`) gain sync primitives.

---

## Glossary

| Term | Definition |
|------|------------|
| **Transaction ID** | Client-generated unique identifier using Hybrid Logical Clock (format: `{wallTime}.{logical}.{nodeId}`). Only used for synced entities (`offline`/`realtime` opMode) |
| **Source ID** | Globally unique identifier for a browser tab/instance. Generated once per page load via `nanoid()`. Each tab MUST have a distinct sourceId. Only used for synced entities (`offline`/`realtime` opMode) |
| **Activity** | A row in `activitiesTable` representing a change (create/update/delete). Tracks both entities (`entityType`: user, organization, page, etc.) and resources (`resourceType`: request, membership). Created for ALL tracked tables |
| **Transient tx column** | JSONB column `tx` on product entity tables containing `{ transactionId, sourceId, changedField }`. Only present on synced entities; context entities and resources do not have this column |
| **changedKeys** | CDC Worker-detected array of all fields that changed. Used by activity feed for ALL entities. Automatically populated by CDC Worker comparing old/new row |
| **tx.changedField** | Client-declared single field this mutation targets. Only used for synced entities - enables field-level conflict detection |
| **Upstream-first** | Pull before push - see [online vs offline sync](#online-vs-offline-sync) |
| **Field-level conflict resolution** | V1: LWW → UI. See [merge strategy](#merge-strategy-v1-lww--ui) |
| **Live stream** | Org-scoped SSE connection for `realtime` opMode entities. Endpoint: `/organizations/:slug/live` |
| **Stream offset** | The `activityId` used for resumption (cursor position in the live stream) |
| **Subscriber** | An SSE connection registered to receive live updates for an organization |

---

## Component Responsibilities

### Backend Handler
- Validates incoming `{ data, tx }` wrapper
- Writes transient `tx` JSONB to entity row
- Checks field-level conflicts when `expectedTransactionId` provided
- Implements idempotency via `transactionId` lookup
- Returns `{ data, tx }` wrapper in response

### CDC Worker
- Reads transient `tx` JSONB from replicated row
- Extracts `transactionId`, `sourceId`, `changedField` from tx object
- Calls `pg_notify('cella_activities', payload)` after activity INSERT (same channel as trigger)
- Includes entity data in NOTIFY payload (from replication row)
- Handles 8KB NOTIFY limit gracefully

### ActivityBus (API Server)
- Existing `backend/src/lib/event-bus.ts` renamed to `activity-bus.ts` and upgraded for sync
- Maintains single LISTEN connection for `cella_activities` channel
- Handles both trigger payloads (activity-only) and CDC Worker payloads (activity + entity)
- Emits typed `ActivityEvent` with optional `entity` field
- Serves both internal handlers and live stream consumers

### Stream Handler (API Server)
- Subscribes to ActivityBus for live updates
- Routes activity notifications to correct org subscribers
- Applies permission checks using `isPermissionAllowed()`
- Uses `notification.entity` when present; fallback fetch when null
- Tracks cursor per subscriber
- Cleans up on disconnect

### Live Stream Endpoint
- Validates org membership via guard middleware
- Supports catch-up mode (fetch activities since offset)
- Supports live SSE mode (register with stream handler for push events)
- Uses Cella context helpers for authorization

### Frontend Mutation Hook
- Generates `transactionId` in `onMutate`
- Applies optimistic update before API call
- Tracks transaction state: `pending` → `sent` → `confirmed` | `failed`
- Handles rollback on error

### Frontend Stream Hook
- Opens EventSource to stream endpoint
- Updates React Query cache from stream messages
- Confirms pending transactions when matching message arrives
- Implements hydrate barrier (queue messages during initial load)

### Transaction Manager
- Stores pending transactions (memory + IndexedDB)
- Provides `trackTransaction()` and `getTransactionStatus()` APIs
- Confirms transactions when stream message matches

### Tab Coordinator
- Elects leader via Web Locks API
- Leader owns SSE connection
- Broadcasts stream messages to follower tabs via BroadcastChannel

---

## Data requirements

### Entity transient tx column

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| DATA-001 | Product entity tables MUST have `tx` JSONB column | DB Schema | Schema includes column |
| DATA-002 | `tx` column MUST contain `transactionId` (string, max 32 chars) | DB Schema | Valid JSON structure |
| DATA-003 | `tx` column MUST contain `sourceId` (string, max 64 chars) | DB Schema | Valid JSON structure |
| DATA-003a | `sourceId` MUST be globally unique per browser tab (generated via `nanoid()`) | Frontend | nanoid format validated |
| DATA-004 | `tx` column MUST contain `changedField` (string or null, max 64 chars) | DB Schema | Valid JSON structure |
| DATA-005 | `tx` column MUST be nullable (null when no tx metadata) | DB Schema | Column allows NULL |
| DATA-006 | `tx` column MUST NOT be exposed in API responses (data portion) | Backend Handler | Response shape validation |

### Activities table extensions

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| DATA-010 | `activitiesTable` MUST have `tx` JSONB column | DB Schema | Schema includes column |
| DATA-011 | `tx` column MUST contain `transactionId` (string, max 32 chars) when present | DB Schema | Valid JSON structure |
| DATA-012 | `tx` column MUST contain `sourceId` (string, max 64 chars) when present | DB Schema | Valid JSON structure |
| DATA-013 | `tx` column MUST contain `changedField` (string or null, max 64 chars) when present | DB Schema | Valid JSON structure |
| DATA-014 | `tx` column MUST be null for non-synced entities (organizations, etc.) | DB Schema | Null for context entities |
| DATA-015 | `activitiesTable` MUST have expression index on `(tx->>'transactionId')` | DB Schema | Index exists |
| DATA-016 | `activitiesTable` MUST have composite expression index for field conflict queries | DB Schema | Index exists |
| DATA-017 | Existing `changedKeys` column MUST remain unchanged (CDC Worker-detected changes) | DB Schema | Column preserved |

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

### Transaction wrapper schema

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| API-001 | Product entity mutation requests MUST use `{ data, tx }` wrapper | Backend Route | OpenAPI schema validation |
| API-001a | `tx` property MUST be required (not optional) for product entities | Backend Route | Schema rejects missing tx |
| API-001b | Context entity endpoints (organizations, etc.) MUST NOT use tx wrapper | Backend Route | Context routes use simple body |
| API-001c | No separate "synced" endpoints SHOULD be created (e.g., no `/pages/synced`) | Backend Route | Route audit finds no `/synced` paths |
| API-002 | `tx.transactionId` MUST be required | Backend Route | Validation rejects missing |
| API-003 | `tx.sourceId` MUST be required | Backend Route | Validation rejects missing |
| API-004 | `tx.changedField` MUST be a string for update mutations | Backend Route | String required for updates |
| API-004a | `tx.changedField` MUST be null for create mutations | Backend Route | Null for creates |
| API-004b | `tx.changedField` MUST be null for delete mutations | Backend Route | Null for deletes |
| API-004c | `data` object SHOULD contain only the field declared in `tx.changedField` | Backend Handler | Validation optional (strict mode) |
| API-005 | `tx.expectedTransactionId` MUST be optional | Backend Route | Validation accepts null/undefined |
| API-006 | Mutation responses MUST return `{ data, tx }` wrapper | Backend Handler | Response shape validation |
| API-007 | Response `tx.transactionId` MUST echo request's transactionId | Backend Handler | Echo verification |

> **Data object shape**: The `data` object uses standard entity update shape (same structure as context entity endpoints). This allows schema reuse and familiar patterns. The `tx.changedField` declaration is the source of truth for conflict detection - only that field is tracked, even if `data` contains additional fields.

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
| API-022 | Idempotent response MUST include same `tx.transactionId` | Backend Handler | Response validation |

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

## CDC Worker requirements

### Context extraction

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CDC-001 | CDC Worker MUST read `tx` JSONB from replicated row | CDC Worker | Activity has tx data |
| CDC-002 | CDC Worker MUST store tx metadata as `tx` JSONB in activity record | CDC Worker | Activity.tx contains metadata |
| CDC-003 | CDC Worker MUST set `tx: null` for non-synced entities | CDC Worker | Context entity has null tx |
| CDC-004 | For INSERT actions, `changedField` MAY be null or '*' | CDC Worker | Insert activity validation |
| CDC-005 | For DELETE actions, `changedField` MAY be null or '*' | CDC Worker | Delete activity validation |

### NOTIFY integration

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CDC-010 | CDC Worker MUST call `pg_notify('cella_activities', payload)` after activity INSERT | CDC Worker | LISTEN receives notification |
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
| CDC-021 | CDC Worker MUST call NOTIFY on same channel as trigger (`cella_activities`) | CDC Worker | Channel name matches |

---

## ActivityBus requirements

The existing EventBus (`backend/src/lib/event-bus.ts`) is renamed to ActivityBus (`activity-bus.ts`) and upgraded to handle both internal activity events and live stream delivery. See DEC-20.

### Payload handling

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| AB-001 | ActivityBus MUST accept payloads with or without `entity` field | ActivityBus | Both payload types parsed |
| AB-002 | When payload includes `entity`, it MUST be available on `ActivityEvent` | ActivityBus | Entity accessible |
| AB-003 | When payload has no `entity`, `event.entity` MUST be undefined or null | ActivityBus | Graceful fallback |
| AB-004 | ActivityBus MUST NOT break existing handlers that ignore `entity` | ActivityBus | Backward compatibility |
| AB-005 | For entity activities, CDC Worker MUST include entity data in NOTIFY payload | CDC Worker → ActivityBus | Entity data present |

### Connection management

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| AB-010 | ActivityBus MUST maintain single LISTEN connection for `cella_activities` | ActivityBus | Connection count = 1 |
| AB-011 | ActivityBus MUST reconnect on connection loss | ActivityBus | Reconnection test |
| AB-012 | ActivityBus MUST emit typed events to subscribers | ActivityBus | Type safety |

---

## Live stream requirements

### Live stream endpoint

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-001 | Live stream endpoint MUST require org guard middleware | Backend Route | Unauthenticated returns 401 |
| STREAM-002 | Non-member MUST receive 403 | Backend Route | Non-member access denied |
| STREAM-003 | `offset=-1` MUST return all activities for org | Stream Handler | Full history retrieval |
| STREAM-004 | `offset=now` MUST return empty and set cursor to latest | Stream Handler | Now offset behavior |
| STREAM-005 | `offset={number}` MUST return activities with id > offset | Stream Handler | Cursor-based pagination |
| STREAM-006 | `live=sse` MUST return SSE stream (Content-Type: text/event-stream) | Stream Handler | Content type check |
| STREAM-007 | `entityTypes` param MUST filter to specified types | Stream Handler | Filtering works |
| STREAM-008 | Catch-up MUST complete before registering for live updates | Stream Handler | Order of operations |

### Stream subscriber routing

The stream subscriber manager routes activity notifications to SSE connections. It subscribes to ActivityBus (see AB-010) rather than maintaining its own LISTEN connection.

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-010 | ~~Registry MUST maintain single LISTEN connection~~ → Moved to AB-010 | ActivityBus | Connection count = 1 |
| STREAM-011 | Subscriber manager MUST route notifications by `orgId` | Stream Subscriber Manager | Cross-org isolation |
| STREAM-012 | Subscriber manager MUST skip notifications with `activityId <= subscriber.cursor` | Stream Subscriber Manager | No duplicate delivery |
| STREAM-013 | Subscriber manager MUST apply `entityTypes` filter per subscriber | Stream Subscriber Manager | Type filtering |
| STREAM-014 | Subscriber manager MUST call `isPermissionAllowed()` before sending | Stream Subscriber Manager | Permission denied = not sent |
| STREAM-015 | Subscriber manager MUST clean up subscriber on disconnect | Stream Subscriber Manager | Memory cleanup |

### Stream message format

SSE messages use the SSE `event` field for type (`'change'` or `'offset'`). The term "stream message" refers to the complete payload.

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-020 | Message MUST have SSE `event: 'change'` type | Stream Handler | SSE event type |
| STREAM-021 | Message MUST include `data` (entity or null for delete) | Stream Handler | Message structure |
| STREAM-022 | Message MUST include `tx.transactionId` | Stream Handler | Message structure |
| STREAM-023 | Message MUST include `tx.sourceId` | Stream Handler | Message structure |
| STREAM-024 | Message MUST include `tx.changedField` | Stream Handler | Message structure |
| STREAM-025 | Message MUST include `sync.action` | Stream Handler | Message structure |
| STREAM-026 | Message MUST include `sync.activityId` | Stream Handler | Message structure |
| STREAM-027 | SSE `id` field MUST equal `activityId` (for resumption) | Stream Handler | SSE id field |

### Catch-up entity fetching

Catch-up queries must fetch entity data by JOINing activities with entity tables (since NOTIFY payload is not available for historical changes). See DEC-15 for rationale.

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-030 | Catch-up query MUST JOIN activities with entity tables to get entity data | Activity Fetcher | Query includes entity |
| STREAM-031 | Entity data MUST be included in catch-up response (`data` field) | Activity Fetcher | Response has entity |
| STREAM-032 | For deletes, `data` MUST be null (entity no longer exists) | Activity Fetcher | Delete handling |
| STREAM-033 | If entity was deleted after activity, `data` SHOULD be null | Activity Fetcher | Stale delete handling |
| STREAM-034 | Catch-up response format MUST match live update format | Activity Fetcher | Consistent structure |
| STREAM-035 | Catch-up MUST use same permission filtering as live updates | Activity Fetcher | Consistent authorization |

### Live update entity data

Live updates receive entity data from the unified ActivityBus, which gets it from CDC Worker NOTIFY payload (zero extra queries for product entities in realtime mode). See DEC-11, DEC-15, and DEC-20 for rationale.

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-040 | Live update MUST use entity data from ActivityBus when available | Stream Handler | Entity from ActivityBus |
| STREAM-041 | If activity notification has no entity (trigger-only or oversized), handler MUST fetch entity | Stream Handler | Fallback fetch |
| STREAM-042 | Fallback fetch MUST query entity table by `entityId` | Stream Handler | Correct fetch |
| STREAM-043 | If fallback fetch fails (entity deleted), message MUST still be sent with `data: null` | Stream Handler | Graceful degradation |

---

## Frontend mutation requirements

### Transaction generation

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| FE-MUT-001 | `onMutate` MUST generate `transactionId` before optimistic update | Mutation Hook | Transaction created in onMutate |
| FE-MUT-002 | `transactionId` MUST be passed to API in `tx` wrapper | Mutation Hook | API receives transactionId |
| FE-MUT-003 | `sourceId` MUST be module-level constant (same for all mutations in tab) | Mutation Hook | sourceId consistency |
| FE-MUT-003a | `sourceId` MUST be generated via `nanoid()` on module load | Mutation Hook | nanoid format, unique per tab |
| FE-MUT-004 | Update mutations MUST include `changedField` in tx | Mutation Hook | Field tracking |
| FE-MUT-005 | Delete mutations MUST generate `transactionId` (with `changedField: null`) | Mutation Hook | Delete has transactionId |

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
| FE-MUT-023 | Transaction MUST transition to `confirmed` when stream message arrives | Transaction Manager | State = confirmed |
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
| CONFLICT-011 | Stream messages MUST update field transaction tracking | Stream Hook | Tracking updated |
| CONFLICT-012 | `getExpectedTransactionId(entityId, field)` MUST return last-seen value | Field Transaction Store | Correct lookup |
| CONFLICT-013 | 409 response MUST trigger merge strategy (LWW → UI for v1) | Mutation Hook | Tiered resolution |

### Merge strategy (LWW → UI)

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| MERGE-001 | Merge strategy MUST default to LWW (server value wins) | Conflict Resolver | LWW applied |
| MERGE-002 | LWW MUST automatically apply server value without user interaction | Conflict Resolver | Auto-resolved |
| MERGE-003 | Field schema MAY declare `manual` hint to skip LWW and show UI | Schema Config | Configurable |
| MERGE-004 | If field is `manual`, MUST show resolution UI | Conflict Resolver | UI shown |
| MERGE-005 | Resolution UI MUST show client value vs server value | Conflict Resolver | Side-by-side |
| MERGE-006 | Resolution UI MUST allow: Keep Mine, Keep Server, or custom value | Conflict Resolver | User choice |
| MERGE-007 | Field schema SHOULD declare merge strategy hint (`lww`, `manual`) | Schema Config | Configurable |

---

## Offline requirements

### Network status detection

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| NET-001 | Network status service MUST replace `onlineManager` from TanStack Query | Network Service | Single source of truth |
| NET-002 | `isOnline` MUST reflect browser's `navigator.onLine` status | Network Service | Basic detection works |
| NET-003 | Service MUST subscribe to browser `online`/`offline` events | Network Service | Events update state |
| NET-004 | `isVerified` MUST reflect actual server reachability (via health check) | Network Service | Connectivity verified |
| NET-005 | Health check interval SHOULD be configurable (default: 30s when online) | Network Service | Interval configurable |
| NET-006 | Health check SHOULD use `/api/health` HEAD request | Network Service | Minimal overhead |
| NET-007 | `latency` SHOULD be `'high'` or `'low'` based on health check response time | Network Service | Latency classification |
| NET-008 | Service SHOULD be a Zustand store (not just a hook) for global access | Network Service | Store pattern |
| NET-009 | Existing `useOnlineManager` hook MUST be deprecated and migrated | Network Service | No duplicate hooks |
| NET-010 | Sync engine components MUST use network status service (not `onlineManager`) | All Sync Components | Consistent usage |

### Stream offset persistence

The stream offset (last received `activityId`) MUST be persisted to survive tab closure. Without this, users who close their browser and return later would start from `'now'` and miss all changes made while away.

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| OFFLINE-OFFSET-001 | Stream offset MUST be persisted to IndexedDB per org | Offset Store | Survives tab closure |
| OFFLINE-OFFSET-002 | Offset store key MUST be `{orgId}` | Offset Store | Unique per org |
| OFFLINE-OFFSET-003 | On SSE connect, offset MUST be read from IndexedDB (fallback to `'now'`) | Stream Hook | Uses persisted offset |
| OFFLINE-OFFSET-004 | On each stream message, offset MUST be updated in IndexedDB | Stream Hook | Offset advances |
| OFFLINE-OFFSET-005 | Offset writes MAY be debounced (max 1 write per 5 seconds) | Offset Store | Reduce write frequency |
| OFFLINE-OFFSET-006 | Offset store MUST use same IndexedDB database as mutation outbox | Offset Store | Single database |

### Mutation outbox

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| OFFLINE-001 | Offline mutations MUST be queued to IndexedDB | Mutation Outbox | Persisted to storage |
| OFFLINE-002 | Outbox entries MUST include `entityType`, `entityId`, `field` | Mutation Outbox | Entry structure |
| OFFLINE-003 | Outbox entries MUST include `transactionId` (same across retries) | Mutation Outbox | Idempotency key |
| OFFLINE-004 | Outbox entries MUST include `expectedTransactionId` | Mutation Outbox | Conflict detection |
| OFFLINE-005 | Same-field mutations MUST squash (keep latest value AND latest transactionId) | Mutation Outbox | Squashing behavior |
| OFFLINE-006 | Different-field mutations MUST queue separately | Mutation Outbox | No cross-field squash |

### Upstream-first sync

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| OFFLINE-010 | On reconnect, stream MUST catch up BEFORE flushing outbox | Sync Coordinator | Order of operations |
| OFFLINE-011 | If stream message conflicts with queued mutation (same field), mark as `conflicted` | Sync Coordinator | Conflict detection |
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
| TAB-010 | Leader MUST broadcast stream messages via BroadcastChannel | Tab Coordinator | Broadcast sent |
| TAB-011 | BroadcastChannel name MUST be `{$appConfig.slug}-sync` | Tab Coordinator | Channel name |
| TAB-012 | Followers MUST apply broadcast messages to React Query cache | Tab Coordinator | Cache updated |
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
| SEC-002 | `isPermissionAllowed()` MUST be called for each entity in broadcast | Stream Subscriber Manager | Permission check |
| SEC-003 | Subscribers MUST store `memberships` for permission checks | Stream Subscriber Manager | Membership stored |
| SEC-004 | System admins (`userSystemRole === 'admin'`) MUST bypass entity ACLs | Stream Subscriber Manager | Admin access |
| SEC-005 | Permission check MUST use same logic as REST handlers | Stream Subscriber Manager | Consistent authorization |

### Data isolation

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| SEC-010 | Activity notifications MUST only be routed to subscribers of the matching org | Stream Subscriber Manager | Org isolation |
| SEC-011 | Stream MUST only deliver messages for subscribed org | Stream Handler | Cross-org blocked |
| SEC-012 | Entity data in NOTIFY MUST NOT include sensitive computed fields | CDC Worker | No password hashes etc |

---

## Performance requirements

### Latency

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| PERF-001 | Optimistic update MUST appear in < 50ms from user action | Mutation Hook | UI timing |
| PERF-002 | Stream message MUST arrive within 100ms of CDC processing | Full Pipeline | E2E timing |
| PERF-003 | Catch-up query MUST complete in < 500ms for 100 activities | Activity Fetcher | Query timing |

### Scalability

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| PERF-010 | LISTEN connection count MUST be 1 per API server instance | ActivityBus | Connection count |
| PERF-011 | Fan-out MUST be O(subscribers per org), not O(total subscribers) | Stream Subscriber Manager | Lookup efficiency |
| PERF-012 | Entity fetch SHOULD be avoided when activity notification includes entity | Stream Subscriber Manager | Zero extra queries |
| PERF-013 | Oversized entity fallback MUST fetch at most 1 entity per message | Stream Subscriber Manager | Bounded queries |

### Resource limits

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| PERF-020 | Catch-up query MUST limit to 100 activities per request | Activity Fetcher | LIMIT clause |
| PERF-021 | NOTIFY payload MUST stay under 8KB (truncate entity at 7.5KB) | CDC Worker | Payload size |
| PERF-022 | IndexedDB transaction store MUST limit to 1000 entries | Transaction Manager | Cleanup old entries |

---

## Appendix: Requirement cross-reference

### By component

| Component | Requirements |
|-----------|--------------|
| **Schema & Data** | DATA-001 to DATA-026 |
| **CDC Worker** | CDC-001 to CDC-020, INT-CDC-001 to INT-CDC-003 |
| **Stream Endpoint** | STREAM-001 to STREAM-043, INT-PERM-001 to INT-PERM-004 |
| **Backend Handlers** | API-001 to API-037, CONFLICT-001 to CONFLICT-005, INT-CTX-001 to INT-CTX-003 |
| **Frontend: Sync Primitives** | DATA-020 to DATA-026, NET-001 to NET-010, INT-QUERY-001 to INT-QUERY-005 |
| **Frontend: Mutation Hooks** | FE-MUT-001 to FE-MUT-024, INT-MUT-001 to INT-MUT-004 |
| **Frontend: Stream Hook** | STREAM-020 to STREAM-027 (message format) |
| **Offline & Conflicts** | NET-001 to NET-010, OFFLINE-001 to OFFLINE-024, CONFLICT-010 to CONFLICT-013, MERGE-001 to MERGE-007 |
| **Multi-Tab Coordination** | TAB-001 to TAB-022 |
| **Security** | SEC-001 to SEC-012 |
| **Performance** | PERF-001 to PERF-022 |

### By test type

| Test Type | Requirements |
|-----------|--------------|
| Unit Tests | DATA-020 to DATA-026, FE-MUT-001 to FE-MUT-004, CONFLICT-010 to CONFLICT-013, MERGE-001 to MERGE-007 |
| Integration Tests | API-001 to API-037, CDC-001 to CDC-020, STREAM-001 to STREAM-043 |
| E2E Tests | PERF-001 to PERF-002, OFFLINE-010 to OFFLINE-013, TAB-001 to TAB-022 |

---

*This requirements document should be kept in sync with HYBRID_SYNC_ENGINE_PLAN.md as implementation progresses.*
