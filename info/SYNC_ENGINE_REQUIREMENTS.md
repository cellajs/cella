# Hybrid Sync Engine - Requirements Specification

This document defines the requirements for building the Hybrid Sync Engine. It combines **design decisions** (the "why") with **testable contracts** (the "what").

> **Related documents: [HYBRID_SYNC_ENGINE_PLAN.md](./HYBRID_SYNC_ENGINE_PLAN.md) - Implementation plan

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
- Works for context entities; sync engine targets realtime entities

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
| **WebSocket message** | The JSON sent via WebSocket from CDC Worker to API server | `{ activity, entity }` with full entity data |
| **Activity notification** | The typed object ActivityBus emits after receiving WebSocket message | `ActivityEvent` interface in `activity-bus.ts` |
| **Live stream** | The org-scoped SSE connection for realtime entities | `/organizations/:slug/live` endpoint |
| **Stream notification** | The SSE payload for realtime entities (notification-push format) | `{ action, entityType, entityId, seq, tx }` |
| **Live update** | A realtime entity change pushed via live stream | Entity data fetched via API after receiving notification |
| **Mutation** | A client-initiated change identified by `tx.id` | Tracks lifecycle: pending → sent → confirmed |

### Entity type taxonomy

Entity types are configured in `config/default.ts` and determine sync capabilities:

| Config type | Description | Examples | Sync capabilities |
|-------------|-------------|----------|-------------------|
| `EntityType` | All entities in the system | `user`, `organization`, `attachment`, `page` | Base type for all entities |
| `ContextEntityType` | Has memberships, defines tenant boundary | `organization` | No sync primitives, standard REST |
| `ProductEntityType` | Content entities, may have sync | `attachment`, `page` | Superset: `OfflineEntityType ∪ RealtimeEntityType` |
| `OfflineEntityType` | Offline mutations only, no streaming | (currently empty) | Transaction tracking, conflict detection |
| `RealtimeEntityType` | Streaming + offline support | `attachment`, `page` | Full sync: streaming, transactions, conflicts |

**Config access:**
```typescript
import { config } from 'config';
const { realtimeEntityTypes, offlineEntityTypes, productEntityTypes } = config;

// Type guards
const isRealtimeEntityType = (t: string): t is RealtimeEntityType => 
  realtimeEntityTypes.includes(t as RealtimeEntityType);
```

### Sync patterns

| Term | Definition | Why it matters |
|------|------------|----------------|
| **Upstream-first** | Pull latest server state before pushing mutations | See "Online vs offline sync" below |
| **Optimistic update** | Apply UI changes immediately, before server confirms | Instant UX; rolled back only if server rejects |
| **Catch-up** | Query `activitiesTable` for changes since client's last offset | Used on SSE reconnect to fill gaps; distinct from live push |
| **Backfill** | Same as catch-up; sometimes used to emphasize historical data fetch | Alternative term in sync literature |
| **Upstream change** | A server-side mutation that client must pull before pushing its own | What client pulls before pushing |


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
| **Mutation ID** | Client-generated ID for a mutation, used for idempotency and tracking | nanoid: 21-character URL-safe string |
| **Version** | Integer counter incremented on every entity mutation | `tx.version: 7` means entity has been modified 7 times |
| **Field Version** | Per-field version tracking for conflict detection | `tx.fieldVersions.name: 3` means `name` was last changed at version 3 |
| **Seq** | Per-org sequence number for gap detection at list level | Incremented atomically per organization |
| **Stream offset** | The `activityId` marking client's position in the activity stream | Used for catch-up on reconnect |
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
| INV-7 | Live updates receive entity data from CDC Worker via WebSocket; catch-up queries JOIN with entity tables | Two paths for entity data: CDC Worker has it from replication, catch-up must fetch it |
| INV-8 | No type assertions in API/stream/frontend code paths | Type safety catches sync bugs at compile time; casts hide data shape mismatches |
| INV-9 | CDC Worker may use lenient typing for row data extraction | pg-logical-replication provides `Record<string, unknown>`, strict typing is impractical at ingestion boundary |

### Constraints (hard limits)

| ID | Constraint | Limit | Why |
|----|------------|-------|-----|
| CON-1 | Mutation ID length | 21 chars | nanoid default + storage efficiency |
| CON-2 | Source ID length | 64 chars | prefix + nanoid headroom |
| CON-3 | Catch-up query batch | 100 activities | Prevent memory/latency spikes |
| CON-4 | IndexedDB transaction store | 1000 entries max | Client storage limits |

### Key Decisions

#### DEC-1: Use nanoid for mutation IDs
- **Decision**: 21-character nanoid for mutation IDs
- **Alternatives rejected**:
  - `HLC`: Complex, requires clock synchronization, not needed for version-based conflict detection
  - `UUID v7`: Longer (36 chars), no benefit over nanoid
- **Trade-off**: No causality ordering, but version-based conflict detection doesn't need it

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

#### DEC-4: CDC Worker sends entity data via WebSocket
- **Decision**: CDC Worker maintains a persistent WebSocket connection to API server; sends full entity data from replication row with no payload limit
- **How it works**:
  - CDC Worker connects to `ws://api-server/internal/cdc` on startup
  - On each realtime entity change: sends `{ activity, entity }` via WebSocket
  - API server receives, emits to ActivityBus with full entity data
  - Automatic reconnection with exponential backoff
  - Internal auth via shared secret header on WebSocket upgrade
- **Alternatives rejected**:
  - pg_notify: 8KB payload limit requires fallback fetches for large entities
  - HTTP POST: Connection overhead at high throughput (1000+ writes/sec)
  - Redis Pub/Sub: Additional infrastructure dependency
  - API server fetches entity: Extra DB query per event
- **Trade-off**: Requires CDC Worker and API Server to be network-reachable; but enables unlimited payload size and 50k+ msg/sec throughput

#### DEC-5: Transient tx column as JSONB object
- **Decision**: Single `tx` JSONB column containing `{ id, sourceId, version, fieldVersions }`
- **Schema**:
  - `id`: nanoid mutation ID
  - `sourceId`: Tab/instance ID for echo prevention
  - `version`: Integer version incremented on every mutation
  - `fieldVersions`: Record of field name to version when that field was last modified
- **Alternatives rejected**:
  - Separate sync metadata table: Extra join, complexity
  - Store in activity only: Handler can't pass to CDC Worker via replication
  - HLC-based transactionId: More complex, not needed for version-based conflict detection
- **Trade-off**: One extra column per realtime entity; slightly more verbose query syntax but extensible and matches API shape

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
- **Decision**: One SSE stream per org, delivering all realtime entity types for that org, filtered down by membership/role 
- **Alternatives rejected**:
  - Per-entity-type streams: More connections, harder to coordinate
  - Global stream: Authorization complexity, wasted bandwidth for multi-org users
  - Per-entity streams: Connection explosion (N entities × M users)
- **Trade-off**: Client filters by entity type, but simpler server and permission boundary by tenant

#### DEC-10: WebSocket-based ActivityBus, subscriber routing for fan-out
- **Decision**: ActivityBus receives from CDC Worker via WebSocket; Stream subscribers register for routing via in-memory registry
- **How it works**:
  - CDC Worker: Processes ALL tracked tables via logical replication (realtime AND context entities)
  - ActivityBus: WebSocket server endpoint `/internal/cdc` receives all activity notifications from CDC Worker
  - All activities include full entity data (no payload size limit via WebSocket)
  - Stream Subscribers: Register interest per orgId, receive filtered notifications
  - Separation: ActivityBus handles WebSocket connection; subscriber routing handles fan-out + permissions
- **Alternatives rejected**:
  - pg_notify + LISTEN: 8KB payload limit, requires separate trigger infrastructure
  - Per-SSE LISTEN connection: Connection pool exhaustion
  - Polling: 500ms+ latency, N queries per interval
  - External pub/sub (Redis): Additional infrastructure dependency
- **Trade-off**: In-memory state (lost on restart, but clients reconnect), but zero DB connections for notifications and unlimited payloads

#### DEC-11: Unified WebSocket delivery for all entities
- **Decision**: CDC Worker sends ALL entity activities via WebSocket (both realtime and context entities)
- **How it works**:
  - CDC Worker subscribes to logical replication for ALL tracked tables (realtime + context)
  - For all entity changes, CDC Worker sends `{ activity, entity }` via WebSocket to API server
  - ActivityBus receives from single WebSocket source, emits unified `ActivityEvent` to handlers
  - All activities include full entity data (no payload size limit via WebSocket)
  - Handlers can choose to use or ignore entity data based on their needs
- **Why unified path**:
  - CDC Worker already processes all tracked tables via logical replication
  - WebSocket has no payload size limit (unlike pg_notify's 8KB)
  - Single path is simpler to maintain and reason about
  - Entity data is available for all handlers that need it
- **Alternatives rejected**:
  - pg_notify + trigger: 8KB limit, separate infrastructure, no benefit since CDC handles all tables
  - Dual-path (WebSocket for some, trigger for others): Added complexity with no benefit
- **Trade-off**: Requires CDC Worker to be running for realtime notifications (basic mode has no realtime)

#### DEC-11b: WebSocket resilience via replication backpressure
- **Decision**: CDC Worker uses native `ws` library; pauses replication consumption when WebSocket disconnects; PostgreSQL WAL is the durable queue
- **How it works**:
  - CDC Worker connects to API server via native `ws`
  - On WebSocket disconnect: stop acknowledging LSN positions (pause consumption)
  - PostgreSQL keeps changes in WAL (replication slot holds position)
  - On WebSocket reconnect: resume consumption, PostgreSQL replays from last ACK'd position
  - No in-memory message queue needed - PostgreSQL IS the queue
- **Reconnection strategy**:
  - Exponential backoff: 1s → 2s → 4s → ... → 30s max
  - Jitter: ±20% randomization
  - Simple retry loop (no library needed for this)
- **Health states**:
  - Healthy: WebSocket OPEN, replication active
  - Degraded: WebSocket reconnecting, replication paused
  - Unhealthy: WebSocket closed > 30s, replication stalled
- **Why this design**:
  - PostgreSQL replication slot is durable (survives CDC Worker restart)
  - Zero memory pressure (no in-process queue)
  - Built-in backpressure via LSN acknowledgment
  - Native `ws` is simple, well-maintained, minimal dependencies
  - Fewer moving parts = fewer failure modes
- **Alternatives rejected**:
  - `partysocket` with message queue: Duplicates PostgreSQL's built-in durability
  - In-memory buffering: Lost on crash, memory pressure, unnecessary complexity
  - Redis as intermediate queue: Extra infrastructure, PostgreSQL already does this
- **Trade-off**: Replication slot holds WAL longer during outages (monitor `pg_replication_slots`)

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
- **Decision**: Live updates include entity data from ActivityBus (which gets it from CDC Worker via WebSocket); catch-up queries JOIN activities with entity tables
- **Why two paths**:
  - CDC Worker has entity data from PostgreSQL logical replication row
  - After activity is inserted, entity data is NOT stored in activitiesTable (per DEC-7)
  - Catch-up queries only have activitiesTable, must JOIN to get entity data
- **Live path**: `CDC Worker replication row → WebSocket → ActivityBus → Stream handler → stream message`
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
  - `tx`: Client-declared transaction metadata (used by sync engine, realtime/offline entities only)
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

#### DEC-19: Transaction wrapper is required for synced entities (no legacy mode)
- **Decision**: Synced entity (realtime/offline) mutation endpoints REQUIRE `{ data, tx }` wrapper - the `tx` property is mandatory, not optional
- **Scope**: Only applies to synced entities (pages, attachments) - context entities (organizations, memberships) continue to use simple request bodies
- **No legacy mode**: All synced entity mutations must include transaction metadata; there is no "legacy" code path in handlers
- **Why this design**:
  - Consistency: All mutations for a synced entity are tracked, no gaps in transaction history
  - Simpler handlers: No detection logic needed, always expect `{ data, tx }`
  - Reliable conflict detection: Every mutation has a transactionId, expectedTransactionId works reliably
  - No migration complexity: Synced entities are new/upgraded, no legacy clients to support
- **Alternatives rejected**:
  - Optional tx wrapper: Creates gaps in transaction tracking, complicates offline queue
  - Separate synced endpoints: Doubles API surface (see rationale below)
- **Clarification**: We still avoid separate `/pages/synced` endpoints. The existing endpoint path is used, but request schema is upgraded to require tx wrapper

#### DEC-20: Unified ActivityBus for internal + sync events
- **Decision**: The existing EventBus (`backend/src/lib/event-bus.ts`) is renamed to ActivityBus and upgraded to serve both internal handlers AND live stream consumers
- **How it works**:
  - ActivityBus receives WebSocket messages from CDC Worker for ALL entity types (see DEC-4, DEC-11)
  - `ActivityEvent` interface includes `entity: Record<string, unknown>` with full entity data
  - All activities include entity data (no payload size limit via WebSocket)
  - Live stream handlers use `event.entity` directly (no fallback fetch needed)
  - Existing internal handlers continue to work (they can use or ignore entity data)
- **Benefits**:
  - Single ActivityBus serves all realtime needs
  - Zero database connections for notifications (WebSocket only)
  - Full entity data always available (no fallback fetch)
  - No payload size limits
  - Simple single-source architecture
- **Alternatives rejected**:
  - pg_notify + LISTEN: 8KB limit, extra DB connection, separate trigger infrastructure
  - Separate SubscriberRegistry for sync: Duplicate infrastructure
- **Trade-off**: ActivityBus depends on CDC Worker, but consolidates realtime infrastructure

#### DEC-21: Type strictness stratification by layer
- **Decision**: Apply different type strictness levels based on layer constraints
- **Layers and strictness**:
  - **CDC Worker (lenient)**: Receives `Record<string, unknown>` from pg-logical-replication. Row data is inherently untyped at the ingestion boundary. Assertions acceptable in well-tested extraction utilities.
  - **ActivityBus (moderate)**: Receives from WebSocket (CDC Worker). Validates payload shape with Zod, emits typed `ActivityEvent`.
  - **API Handlers (strict)**: OpenAPI schemas provide compile-time contracts. Use generated types, no assertions. Type guards for string→enum conversion.
  - **Stream Handlers (strict)**: SSE messages have defined schemas. Use `RealtimeEntityType`, `ActivityAction` from config with type guards.
  - **Frontend (strict)**: Generated SDK types from `api.gen/`. Derive types from generated schemas, no custom duplicates.
- **Why this design**:
  - CDC Worker deals with raw PostgreSQL replication data - strict typing is impractical and adds no value
  - API/stream/frontend have well-defined contracts (OpenAPI, Zod schemas) - strict typing catches bugs
  - Type guards at layer boundaries ensure type-safe handoff
- **Alternatives rejected**:
  - Strict everywhere: Impractical for CDC Worker, requires excessive assertions
  - Lenient everywhere: Loses compile-time safety in typed layers

#### DEC-22: Mutation layer encapsulates sync logic
- **Decision**: All sync mechanics (tx generation, changedField detection, mutation splitting) are encapsulated in the mutation layer (`query.ts`), not in UI components
- **Form contract**: Forms call `mutation.mutate({ id, data })` with no sync awareness
- **Mutation layer responsibilities**:
  1. Detect which field(s) changed by comparing incoming data against cached entity
  2. If multiple fields changed, split into separate sequential mutations (one field per mutation)
  3. Generate tx metadata: `transactionId`, `sourceId`, `changedField`, `expectedTransactionId`
  4. Look up last known transactionId per field for conflict detection
  5. Apply optimistic updates to cache, rollback on error
- **Why this design**:
  - Minimal upgrade surface: Forms don't change when entity becomes synced
  - Single source of truth: Sync logic concentrated in one place per entity
  - Testable: Mutation splitting and conflict detection can be unit tested
  - Consistent: All mutations for an entity follow same pattern
- **Alternatives rejected**:
  - Forms detect changedField: Duplicates logic, couples UI to sync mechanics
  - Separate synced forms: Parallel component trees, maintenance burden
- **Trade-off**: Mutation layer becomes more complex, but UI stays simple

#### DEC-23: Offline mutation coalescing (create + edit → single create)
- **Decision**: When a user creates an entity offline and then edits it before reconnecting, the create and subsequent edits are coalesced into a single create request with the final values
- **How it works**:
  - Outbox tracks mutation type: `'create'`, `'update'`, `'delete'`
  - Create entry has `type: 'create'` and stores full entity data
  - Edit to same entity while still pending: merge data into existing create entry
  - Edit to different fields: merge into same create entry (not separate entries)
  - Delete after create: remove both from outbox (never reached server)
- **Outbox key strategy**:
  - Create/delete operations: key by `{entityType}:{entityId}` (entity-level)
  - Update operations: key by `{entityType}:{entityId}:{field}` (field-level per OFFLINE-005/006)
  - When update targets pending create: merge into create entry instead of queuing separate update
- **Why this design**:
  - Efficiency: One API call instead of 1 create + N updates
  - Consistency: Entity doesn't exist on server yet, so field-level updates are meaningless
  - Simplicity: Server receives clean create with final values, no intermediate states
  - No conflicts possible: Can't conflict with something that doesn't exist yet
- **Scenario examples**:
  - Create page → edit title → edit content → online = 1 create with final title+content
  - Create page → delete page → online = 0 requests (cancel each other)
  - Create page → online → edit title → offline → edit content → online = 1 create + 2 updates
- **Alternatives rejected**:
  - Send create then updates: Extra network calls, intermediate states on server
  - Separate queues for create vs update: Complex coordination
- **Trade-off**: Outbox logic is more complex (must detect pending creates), but dramatically reduces network traffic for offline-heavy usage

#### DEC-24: React Query mutation cache as outbox (not custom IndexedDB)
- **Decision**: Use React Query's mutation cache with IndexedDB persistence as the mutation outbox, rather than implementing a custom IndexedDB-based outbox
- **How it works**:
  - React Query mutations are persisted to IndexedDB via `@tanstack/react-query-persist-client` + Dexie
  - Pending mutations survive page refresh (mutations with `gcTime: Infinity` are restored)
  - `squashPendingMutation()` cancels in-flight same-entity mutations from the mutation cache
  - `coalescePendingCreate()` merges update data into pending create mutations
  - `hasPendingDelete()` checks for pending deletes before applying updates
  - Version-based conflict detection via `tx.baseVersion` and `tx.fieldVersions`
- **Location**: `frontend/src/query/offline/squash-utils.ts`, `frontend/src/query/persister.ts`
- **Why this design**:
  - Leverages existing React Query infrastructure (no parallel state management)
  - Mutations already have lifecycle hooks (`onMutate`, `onError`, `onSuccess`, `onSettled`)
  - Built-in retry, deduplication, and garbage collection
  - Query + mutation state persisted together (consistent recovery after page refresh)
  - TanStack Query v5 pause/resume for offline support
- **Trade-offs vs custom IndexedDB outbox**:
  - ✅ Less code: No custom outbox implementation, uses React Query primitives
  - ✅ Unified persistence: Query cache and "outbox" use same IndexedDB database
  - ✅ Automatic retry: React Query handles retry with exponential backoff
  - ⚠️ Less explicit: Outbox behavior is implicit in mutation cache, not dedicated storage
  - ⚠️ Squashing via cancellation: Instead of true squashing (replace entry), we cancel and re-queue
- **Future consideration**: If offline-first becomes more critical, evaluate:
  - More explicit outbox UI (show pending mutations count, retry controls)
  - Conflict resolution UI integration with React Query mutation state

---

## Integration requirements (existing Cella infrastructure)

The sync engine MUST integrate with existing Cella patterns, not create parallel implementations. This section documents which existing utilities to use and how.

### Permission system

| Existing code | Location | How sync engine uses it |
|---------------|----------|-------------------------|
| `isPermissionAllowed()` | `backend/src/permissions/` | Stream fan-out filters events by entity ACLs |
| `getValidProductEntity()` | `backend/src/permissions/get-product-entity.ts` | Pattern for checking synced entity access |
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
- INT-MUT-005: MUST use generated types and Zod schemas from `frontend/src/api.gen/` - DO NOT define custom types for API request/response data shapes (e.g., use `CreatePageData['body']['data']` not a custom `CreatePageInput` type)

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
| CDC Worker | `cdc/src/` | Extended to extract tx column and send via WebSocket |
| `extractActivityContext()` | `cdc/src/utils/` | Extended to read transient tx column |

**Integration rules:**
- INT-CDC-001: tx column added to existing `activitiesTable`, not separate table
- INT-CDC-002: CDC Worker extraction logic extended in existing `extractActivityContext()`
- INT-CDC-003: WebSocket notification added after activity INSERT in CDC Worker flow

---

## Sync primitives by entity type

| Primitive | Context entities (`basic`) | Synced entities (`RealtimeEntityType` / `OfflineEntityType`) |
|-----------|---------------------------|---------------------------------------|
| `transactionId` | ❌ Not used | ✅ Required - client-generated HLC |
| `sourceId` | ❌ Not used | ✅ Required - tab identifier |
| `tx.changedField` | ❌ Not used | ✅ Required for updates |
| `changedKeys` | ✅ Auto-populated by CDC Worker | ✅ Auto-populated by CDC Worker |
| `{ data, tx }` wrapper | ❌ Simple request body | ✅ Required wrapper format |
| Conflict detection | ❌ Not supported | ✅ Field-level via `expectedTransactionId` |
| Idempotency | ❌ Not supported | ✅ Via `transactionId` lookup |
| **Live streaming** | ❌ Not supported | ✅ `RealtimeEntityType` only |

> **Key insight**: Context entities (`organization`, `membership`) use standard REST patterns. Only synced entities (`page`, `attachment`) gain sync primitives. Within synced entities, only `RealtimeEntityType` entities receive live stream updates.

---

## Glossary

| Term | Definition |
|------|------------|
| **Transaction ID** | Client-generated unique identifier using Hybrid Logical Clock (format: `{wallTime}.{logical}.{nodeId}`). Only used for synced entities (`OfflineEntityType`/`RealtimeEntityType`) |
| **Source ID** | Globally unique identifier for a browser tab/instance. Generated once per page load via `nanoid()`. Each tab MUST have a distinct sourceId. Only used for synced entities |
| **Activity** | A row in `activitiesTable` representing a change (create/update/delete). Tracks both entities (`entityType`: user, organization, page, etc.) and resources (`resourceType`: request, membership). Created for ALL tracked tables |
| **Transient tx column** | JSONB column `tx` on synced entity tables containing `{ transactionId, sourceId, changedField }`. Only present on synced entities; context entities and resources do not have this column |
| **changedKeys** | CDC Worker-detected array of all fields that changed. Used by activity feed for ALL entities. Automatically populated by CDC Worker comparing old/new row |
| **tx.changedField** | Client-declared single field this mutation targets. Only used for synced entities - enables field-level conflict detection |
| **Upstream-first** | Pull before push - see [online vs offline sync](#online-vs-offline-sync) |
| **Field-level conflict resolution** | V1: LWW → UI. See [merge strategy](#merge-strategy-v1-lww--ui) |
| **Live stream** | Org-scoped SSE connection for `RealtimeEntityType` entities. Endpoint: `/organizations/:slug/live` |
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
- Sends `{ activity, entity }` via WebSocket to API server after activity INSERT
- Full entity data included (no payload limit with WebSocket)
- Maintains persistent WebSocket connection with automatic reconnection

### ActivityBus (API Server)
- Existing `backend/src/lib/event-bus.ts` upgraded for sync
- Receives from CDC Worker via WebSocket (all entity types)
- All activities include full entity data (no payload size limit)
- Emits typed `ActivityEvent` with `entity` field
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

## File locations

Sync engine code is organized into dedicated folders within the existing structure:

### Frontend (`frontend/src/query/`)

| Path | Purpose |
|------|---------|
| `query/offline/` | Offline sync utilities (transactions, squashing) |
| `query/offline/tx-utils.ts` | Transaction metadata creation (`createTxForCreate`, `createTxForUpdate`), sourceId |
| `query/offline/squash-utils.ts` | Mutation squashing and create+edit coalescing |
| `query/offline/detect-changed-fields.ts` | Utility to detect which fields changed |
| `query/realtime/` | Realtime sync utilities (SSE, multi-tab) |
| `query/realtime/user-stream-handler.ts` | Stream message handling, echo prevention, gap detection |
| `query/realtime/user-stream-types.ts` | Stream message type definitions |
| `query/realtime/tab-coordinator.ts` | Multi-tab leader election and broadcast |
| `query/persister.ts` | React Query IndexedDB persistence (Dexie) |

### Backend (`backend/src/`)

| Path | Purpose |
|------|---------|
| `lib/sync/` | Sync primitives (conflict detection, idempotency) |
| `lib/sync/conflict-detection.ts` | Field-level conflict detection |
| `lib/sync/idempotency.ts` | Transaction deduplication |
| `lib/activity-bus.ts` | Event bus receiving CDC Worker notifications |
| `lib/cdc-websocket.ts` | WebSocket handler for CDC Worker connection |
| `modules/sync/schema.ts` | Shared tx wrapper Zod schemas |

### CDC Worker (`cdc/src/`)

| Path | Purpose |
|------|---------|
| `utils/extract-activity-context.ts` | Extracts tx metadata from replicated rows |
| `handlers/` | INSERT/UPDATE/DELETE handlers |

---

## Data requirements

### Entity transient tx column

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| DATA-001 | Synced entity tables MUST have `tx` JSONB column | DB Schema | Schema includes column |
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
| API-001 | Synced entity mutation requests MUST use `{ data, tx }` wrapper | Backend Route | OpenAPI schema validation |
| API-002 | `tx` property MUST be required (not optional) for synced entities | Backend Route | Schema rejects missing tx |
| API-003 | Context entity endpoints (organizations, etc.) MUST NOT use tx wrapper | Backend Route | Context routes use simple body |
| API-004 | No separate "synced" endpoints SHOULD be created (e.g., no `/pages/synced`) | Backend Route | Route audit finds no `/synced` paths |
| API-005 | `tx.transactionId` MUST be required | Backend Route | Validation rejects missing |
| API-006 | `tx.sourceId` MUST be required | Backend Route | Validation rejects missing |
| API-007 | `tx.changedField` MUST be a string for update mutations, null for create/delete | Backend Route | Type varies by mutation |
| API-008 | `data` object SHOULD contain only the field declared in `tx.changedField` | Backend Handler | Validation optional (strict mode) |
| API-009 | `tx.expectedTransactionId` MUST be required for update/delete, null for create | Backend Route | Required except creates |
| API-010 | `tx.expectedTransactionId` MAY be null if field has no prior transaction | Backend Handler | First write to field passes |
| API-011 | Mutation responses MUST return `{ data, tx }` wrapper | Backend Handler | Response shape validation |
| API-012 | Response `tx.transactionId` MUST echo request's transactionId | Backend Handler | Echo verification |

> **Data object shape**: The `data` object uses standard entity update shape (same structure as context entity endpoints). This allows schema reuse and familiar patterns. The `tx.changedField` declaration is the source of truth for conflict detection - only that field is tracked, even if `data` contains additional fields.

### Conflict response

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| API-020 | Field conflict MUST return HTTP 409 | Backend Handler | Status code check |
| API-021 | Conflict response MUST include `code: 'FIELD_CONFLICT'` | Backend Handler | Response body validation |
| API-022 | Conflict response MUST include `field` (which field conflicted) | Backend Handler | Response body validation |
| API-023 | Conflict response MUST include `expectedTransactionId` (what client sent) | Backend Handler | Response body validation |
| API-024 | Conflict response MUST include `serverTransactionId` (current server value) | Backend Handler | Response body validation |

### Idempotency

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| API-030 | Duplicate `transactionId` MUST return existing entity (not create new) | Backend Handler | Idempotent create |
| API-031 | Idempotent response MUST return HTTP 200 (not 201) | Backend Handler | Status code for duplicate |
| API-032 | Idempotent response MUST include same `tx.transactionId` | Backend Handler | Response validation |

### Upstream-first backend enforcement

Backend can optionally enforce that clients are "caught up" before accepting mutations. This prevents stale writes from clients that haven't received recent changes, complementing the client-side upstream-first pattern. When enabled, the server compares the client's last-seen stream offset against the current server offset and rejects mutations from clients that are too far behind.

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| API-040 | `sync.streamOffset` MUST be optional in mutation requests | Backend Route | Schema allows null/undefined |
| API-041 | If `streamOffset` provided, server MUST compare to latest activityId for org | Backend Handler | Comparison executed |
| API-042 | If client offset is > threshold events behind, MUST return HTTP 409 | Backend Handler | Stale client rejected |
| API-043 | Stale client response MUST include `code: 'STREAM_BEHIND'` | Backend Handler | Response body validation |
| API-044 | Stale client response MUST include `serverOffset` (current latest) | Backend Handler | Response body validation |
| API-045 | Stale client response MUST include `clientOffset` (what client sent) | Backend Handler | Response body validation |
| API-046 | Threshold SHOULD be configurable (default: 10 events) | Backend Handler | Config-driven |
| API-047 | If `streamOffset` not provided, enforcement MUST be skipped | Backend Handler | Backwards compatible |

---

## CDC Worker requirements

### Context extraction

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CDC-001 | CDC Worker MUST read `tx` JSONB from replicated row | CDC Worker | Activity has tx data |
| CDC-002 | CDC Worker MUST store tx metadata as `tx` JSONB in activity record | CDC Worker | Activity.tx contains metadata |
| CDC-003 | CDC Worker MUST set `tx: null` for non-synced entities | CDC Worker | Context entity has null tx |
| CDC-004 | For INSERT/DELETE actions, `changedField` MUST be null | CDC Worker | Null for creates/deletes |

### WebSocket integration

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CDC-010 | CDC Worker MUST send `{ activity, entity }` via WebSocket after activity INSERT | CDC Worker | API receives WebSocket message |
| CDC-011 | WebSocket payload MUST include full activity object | CDC Worker | Payload structure |
| CDC-012 | WebSocket payload MUST include full entity data from replication row | CDC Worker | Payload includes entity |
| CDC-013 | CDC Worker MUST use native `ws` library for WebSocket connection | CDC Worker | Library used |
| CDC-014 | CDC Worker MUST authenticate via shared secret header on upgrade | CDC Worker | Auth header present |

### Replication backpressure

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CDC-020 | On WebSocket disconnect, CDC Worker MUST pause replication consumption | CDC Worker | Consumption paused |
| CDC-021 | While paused, CDC Worker MUST NOT acknowledge LSN positions to PostgreSQL | CDC Worker | LSN held |
| CDC-022 | On WebSocket reconnect, CDC Worker MUST resume replication consumption | CDC Worker | Consumption resumed |
| CDC-023 | PostgreSQL replication slot MUST hold WAL position during pause | PostgreSQL | WAL retained |
| CDC-024 | After resume, CDC Worker MUST process all changes from last ACK'd LSN | CDC Worker | No message loss |

### Reconnection strategy

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CDC-030 | CDC Worker MUST reconnect with exponential backoff (1s, 2s, 4s, ... 30s max) | CDC Worker | Backoff timing |
| CDC-031 | Reconnection delay MUST include jitter (±20%) | CDC Worker | Jitter applied |
| CDC-032 | CDC Worker MUST reset backoff to 1s after successful connection | CDC Worker | Backoff reset |
| CDC-033 | CDC Worker MUST log reconnection attempts with delay and attempt count | CDC Worker | Logs present |

### Error handling

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CDC-040 | CDC Worker MUST NOT crash on WebSocket errors | CDC Worker | Process survives |
| CDC-041 | Malformed outbound message MUST be logged and skipped | CDC Worker | Skip bad message |
| CDC-042 | CDC Worker MUST listen for `ws` `error` and `close` events | CDC Worker | Events handled |
| CDC-043 | CDC Worker MUST handle API server restart gracefully | CDC Worker | Survives restart |

### Health monitoring

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| CDC-050 | CDC Worker MUST expose health endpoint `/health` | CDC Worker | Health check |
| CDC-051 | Health endpoint MUST report: `{ status, wsState, replicationState, lastLsn, lastMessageAt }` | CDC Worker | Health metrics |
| CDC-052 | `status` MUST be "healthy" if WebSocket OPEN and replication active | CDC Worker | Healthy state |
| CDC-053 | `status` MUST be "degraded" if WebSocket reconnecting and replication paused | CDC Worker | Degraded state |
| CDC-054 | `status` MUST be "unhealthy" if WebSocket closed > 30s | CDC Worker | Unhealthy state |
| CDC-055 | Health endpoint MUST return HTTP 200 for healthy/degraded, HTTP 503 for unhealthy | CDC Worker | HTTP status codes |
| CDC-056 | CDC Worker SHOULD log warning if replication paused > 60s (WAL accumulation) | CDC Worker | WAL warning |

---

## ActivityBus requirements

The existing EventBus (`backend/src/lib/event-bus.ts`) is upgraded to handle both internal activity events and live stream delivery. It receives all activities from CDC Worker via WebSocket (no LISTEN/trigger needed since CDC Worker processes all tracked tables). See DEC-10, DEC-11, DEC-20.

### Payload handling

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| AB-001 | ActivityBus MUST accept payloads with or without `entity` field | ActivityBus | Both payload types parsed |
| AB-002 | When payload includes `entity`, it MUST be available on `ActivityEvent` | ActivityBus | Entity accessible |
| AB-003 | When payload has no `entity`, `event.entity` MUST be undefined or null | ActivityBus | Graceful fallback |
| AB-004 | ActivityBus MUST NOT break existing handlers that ignore `entity` | ActivityBus | Backward compatibility |
| AB-005 | For realtime entity activities, CDC Worker MUST send entity data via WebSocket | CDC Worker → ActivityBus | Entity data present |

### Connection management

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| AB-010 | ActivityBus MUST expose WebSocket endpoint `/internal/cdc` for CDC Worker | ActivityBus | Endpoint available |
| AB-011 | ActivityBus MUST validate shared secret on WebSocket upgrade | ActivityBus | Auth check |
| AB-012 | ActivityBus MUST reject upgrade if secret missing or invalid (401) | ActivityBus | Reject unauthorized |
| AB-013 | ActivityBus MUST emit typed events to subscribers | ActivityBus | Type safety |
| AB-014 | ActivityBus MUST handle WebSocket reconnection from CDC Worker | ActivityBus | Reconnection handling |
| AB-015 | ActivityBus MUST accept only one CDC Worker connection at a time | ActivityBus | Single connection |
| AB-016 | New CDC Worker connection MUST gracefully replace existing (if any) | ActivityBus | Connection replacement |

### WebSocket server behavior

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| AB-020 | ActivityBus MUST respond to ping with pong | ActivityBus | Pong response |
| AB-021 | ActivityBus MUST close connection if no message received within 90s | ActivityBus | Idle timeout |
| AB-022 | ActivityBus MUST validate message JSON schema before processing | ActivityBus | Schema validation |
| AB-023 | Invalid message MUST be logged and ignored (not close connection) | ActivityBus | Invalid handling |
| AB-024 | ActivityBus MUST NOT block on slow subscribers | ActivityBus | Non-blocking emit |

### WebSocket health monitoring (API side)

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| AB-030 | API health endpoint MUST include CDC WebSocket connection state | ActivityBus | Health check |
| AB-031 | Health MUST report: cdc_connected, last_message_at, messages_received | ActivityBus | Health metrics |
| AB-032 | Health state MUST be "degraded" if no CDC message in 60s (when CDC expected) | ActivityBus | Degraded detection |
| AB-033 | ActivityBus MUST emit metrics: messages_received, parse_errors, emit_latency_ms | ActivityBus | Metrics available |

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

The live stream subscriber manager routes activity notifications to SSE connections. It subscribes to ActivityBus (see AB-010) rather than maintaining its own LISTEN connection.

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-010 | Subscriber manager MUST route notifications by `orgId` | Stream Subscriber Manager | Cross-org isolation |
| STREAM-011 | Subscriber manager MUST skip notifications with `activityId <= subscriber.cursor` | Stream Subscriber Manager | No duplicate delivery |
| STREAM-012 | Subscriber manager MUST apply `entityTypes` filter per subscriber | Stream Subscriber Manager | Type filtering |
| STREAM-013 | Subscriber manager MUST call `isPermissionAllowed()` before sending | Stream Subscriber Manager | Permission denied = not sent |
| STREAM-014 | Subscriber manager MUST clean up subscriber on disconnect | Stream Subscriber Manager | Memory cleanup |

### Stream message format

SSE messages use the SSE `event` field for type (`'change'` or `'offset'`). The term "stream message" refers to the complete payload.

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-020 | Message MUST have SSE `event: 'change'` type | Stream Handler | SSE event type |
| STREAM-021 | Message MUST include `data` (entity or null for delete) | Stream Handler | Message structure |
| STREAM-022 | Message MUST include `tx.transactionId` | Stream Handler | Message structure |
| STREAM-023 | Message MUST include `tx.sourceId` | Stream Handler | Message structure |
| STREAM-024 | Message MUST include `tx.changedField` | Stream Handler | Message structure |
| STREAM-025 | Message MUST include `action` | Stream Handler | Message structure |
| STREAM-026 | Message MUST include `activityId` | Stream Handler | Message structure |
| STREAM-027 | SSE `id` field MUST equal `activityId` (for resumption) | Stream Handler | SSE id field |

### Catch-up entity fetching

Catch-up queries must fetch entity data by JOINing activities with entity tables (since historical activities predate the current session). See DEC-15 for rationale.

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-030 | Catch-up query MUST JOIN activities with entity tables to get entity data | Activity Fetcher | Query includes entity |
| STREAM-031 | Entity data MUST be included in catch-up response (`data` field) | Activity Fetcher | Response has entity |
| STREAM-032 | For deletes, `data` MUST be null (entity no longer exists) | Activity Fetcher | Delete handling |
| STREAM-033 | If entity was deleted after activity, `data` SHOULD be null | Activity Fetcher | Stale delete handling |
| STREAM-034 | Catch-up response format MUST match live update format | Activity Fetcher | Consistent structure |
| STREAM-035 | Catch-up MUST use same permission filtering as live updates | Activity Fetcher | Consistent authorization |

### Live update entity data

Live updates receive entity data from the unified ActivityBus, which gets it from CDC Worker via WebSocket (zero extra queries). See DEC-11, DEC-15, and DEC-20 for rationale.

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| STREAM-040 | Live update MUST use entity data from ActivityBus `event.entity` | Stream Handler | Entity from ActivityBus |
| STREAM-041 | For delete activities, `data` MUST be null (entity no longer exists) | Stream Handler | Delete handling |
| STREAM-042 | Live update format MUST match catch-up format | Stream Handler | Consistent structure |

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
| CONFLICT-001 | For update/delete mutations, handler MUST check activitiesTable using `expectedTransactionId` | Backend Handler | Query executed |
| CONFLICT-002 | Query MUST find latest activity for `(entityType, entityId, changedField)` | Backend Handler | Correct query |
| CONFLICT-003 | If latest `transactionId` ≠ `expectedTransactionId`, MUST return 409 | Backend Handler | Conflict detected |
| CONFLICT-004 | If no previous activity for field, conflict check MUST pass (first write) | Backend Handler | First write succeeds |
| CONFLICT-005 | For create mutations, conflict check MUST be skipped (`expectedTransactionId` is null) | Backend Handler | No check for create |

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
| OFFLINE-007 | Create entries MUST be keyed by `{entityType}:{entityId}` (entity-level) | Mutation Outbox | Create is entity-level |
| OFFLINE-008 | Update to pending create MUST merge into create entry (not queue separate update) | Mutation Outbox | Create+edit coalescing |
| OFFLINE-009 | Delete of pending create MUST remove both entries from outbox | Mutation Outbox | Cancel pending create |

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
| SEC-012 | Entity data in WebSocket message MUST NOT include sensitive computed fields | CDC Worker | No password hashes etc |

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
| PERF-010 | WebSocket connection count MUST be 1 from CDC Worker per API server instance | ActivityBus | Connection count |
| PERF-011 | Fan-out MUST be O(subscribers per org), not O(total subscribers) | Stream Subscriber Manager | Lookup efficiency |
| PERF-012 | Entity data MUST be included in WebSocket message (zero extra queries) | CDC Worker | No fetches needed |

### Resource limits

| Req ID | Requirement | Owner | Test Case |
|--------|-------------|-------|-----------|
| PERF-020 | Catch-up query MUST limit to 100 activities per request | Activity Fetcher | LIMIT clause |
| PERF-021 | WebSocket messages MUST be sent without buffering delays | CDC Worker | Message timing |
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
