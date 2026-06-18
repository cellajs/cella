# Sync engine packaging — concept plan

> **Status:** Concept / exploratory. Not a committed roadmap. This document sketches how the
> Cella/Raak sync engine ([SYNC_ENGINE.md](./SYNC_ENGINE.md)) could be extracted into reusable
> packages adoptable by any monorepo that uses OpenAPI + React Query + Postgres.

## Goal

Let a non-Cella monorepo add a sync layer to *some* of its data resources without forking Cella
and without authoring a full entity/hierarchy config. The consumer-facing mental model collapses to:

- **Synced resource** — a table whose changes flow through CDC → seq stamping → SSE → React Query.
- **Not-synced** — plain OpenAPI + React Query (today's default, unchanged).

"Context entity" does not disappear; it generalizes into a **scope** — the grouping key that seq
counters and SSE channels hang off. In Cella that is `organization`/`project`; in a flat app it is
`'global'`; in a single-tenant-per-user app it is `userId`.

## Core idea: adopt the CDC substrate as a complete unit

Rather than asking each consumer to generalize the activities schema and assemble replication
infrastructure, the package **owns** that layer. Its only public surfaces are:

1. **`SyncTableConfig`** — the scope contract (which columns of a row are its scope, and whether the
   table is synced).
2. **The WebSocket message protocol** — the fixed shape CDC emits to the API.

Everything else (replication slot, `pg_partman` partitioning, seq stamping, `context_counters`,
`activitiesTable`) is package-internal and opinionated.

---

## Package layering

```
┌──────────────────────────────────────────────────────────────────────┐
│ @sync/substrate            (producer side — adopted wholesale)         │
│   • activitiesTable + context_counters (package-owned schema)          │
│   • CDC worker + ChangeSource drivers (logical-repl | outbox | manual) │
│   • seq stamping, batching, cache-token minting                        │
│   • PUBLIC SURFACES: SyncTableConfig + WS message protocol             │
├──────────────────────────────────────────────────────────────────────┤
│ @sync/backend              (consumption side — wired to consumer auth) │
│   • ActivityBus, stream dispatcher, subscriber-manager                 │
│   • build-message, app/public catchup operations                       │
│   • entityCache + publicEntityCache + token signing  ◀── REQUIRED for  │
│   • SSE routes                                            performance   │
│   • PLUG POINTS: ScopeProvider, canRead, EntityOperations (REST)       │
├──────────────────────────────────────────────────────────────────────┤
│ @sync/react-query          (frontend)                                  │
│   • entity-query-registry, stream handlers, catchup processor          │
│   • offline queue (squash/coalesce), HLC/AWSet, tab coordinator        │
│   • PLUG POINTS: EntityOperations adapter, scope/tenant resolver       │
├──────────────────────────────────────────────────────────────────────┤
│ @sync/primitives           (zero-coupling, shippable today)            │
│   • HLC field-versions, AWSet array-delta, stx                         │
│   • TTL cache, request coalescing, HMAC token signing                  │
└──────────────────────────────────────────────────────────────────────┘
```

`@sync/primitives` and most of `@sync/substrate` are generic today. `@sync/backend` and
`@sync/react-query` are the bulk of the work — adopting the substrate does **not** shrink them.

---

## Public surface 1 — `SyncTableConfig` (the scope contract)

The CDC worker currently imports `shared` directly to resolve scope columns
([cdc/src/handlers/create-activity.ts](../cdc/src/handlers/create-activity.ts),
[cdc/src/services/activity-service.ts](../cdc/src/services/activity-service.ts) call
`hierarchy.getOrderedAncestors()` and `appConfig.entityIdColumnKeys`). A standalone package cannot
import the consumer's config, so this becomes **injected configuration**:

```ts
interface SyncResourceConfig {
  /** Logical entity type name (used in seq keys, channels, notifications). */
  entityType: string;
  /** Postgres table name (the WAL source). */
  table: string;
  /**
   * Ordered scope columns, most-specific → root. Builds scopePath for each row.
   * e.g. ['project_id', 'organization_id']. Empty [] = global/unscoped.
   */
  scopeColumns: string[];
  /**
   * Synced = stamp seq + mint cacheToken + drive SSE/catchup (product entity).
   * Not synced (context) = activity logged for membership/audit only.
   */
  synced: boolean;
  /** Optional: field merge strategies for conflict resolution. */
  mergeFields?: {
    scalars?: string[];               // HLC LWW
    sets?: string[];                  // AWSet delta
    crdt?: string[];                  // Yjs (description-like)
  };
  /** Optional: public readability mode (replaces hierarchy.publicRead). */
  publicRead?: 'always' | 'self' | 'parent' | 'parentOrSelf';
  /** Optional: embedding hints for cross-entity propagation (label → task.labels). */
  embeddings?: { targetType: string; field: string }[];
}

type SyncTableConfig = Record<string /* table */, SyncResourceConfig>;
```

Cella generates this from its `hierarchy` config; a flat app writes it by hand in ~10 lines. This is
exactly the "synced resource vs not" model expressed as CDC input.

### Schema generalization (one-time, package-internal)

Today [activities.ts L30-31](../backend/src/modules/activities/activities-db.ts#L30-L31) hardcodes
`organizationId` + `projectId` — Raak's exact 2-level hierarchy frozen into DDL. The substrate
package replaces those with hierarchy-agnostic columns:

```
scopeKey   varchar    -- nearest scope id (drives counter rows + channel routing)
scopePath  jsonb      -- ordered [scopeId, ...] for ancestor filtering (empty for global)
```

`org → workspace → project`, a flat app, and a single-tenant app all map onto the same DDL —
`scopePath` is just longer or empty. The `enum: appConfig.entityTypes` constraints on
`entityType`/`resourceType` columns become plain `varchar` (it is a log table; validate at
registration time). `context_counters` is already generic (JSONB `s:`/`e:`/`m:` keys) and ports
as-is.

---

## Public surface 2 — WebSocket message protocol

Once CDC is a black box, the WS message is the single integration seam. Keep the current shape
(see [SYNC_ENGINE.md](./SYNC_ENGINE.md) "CDC Message Payload") but swap hierarchy-specific fields
for scope-generic ones:

```ts
interface CdcMessage {
  activity: {
    id: string;                      // LSN-based cursor
    action: 'create' | 'update' | 'delete';
    entityType: string | null;
    resourceType: string | null;
    entityId: string;
    scopeKey: string | null;         // ◀ replaces organizationId/projectId
    scopePath: string[];             // ◀ ordered ancestor scope ids
    tenantId: string | null;         // optional multi-tenant marker
    seq: number | null;              // synced entities only
    batchUntilSeq: number | null;
    stx: StxBase | null;
  };
  rowData: Record<string, unknown> | null;
  cacheToken: string | null;
  batchReservations: { token: string; entityType: string; entityId: string }[];
  _trace?: { traceId: string; spanId: string; cdcTimestamp: number };
}
```

---

## `ChangeSource` drivers (inside `@sync/substrate`)

Because the seam is the protocol, "adopt CDC wholesale" and "don't force logical replication on
everyone" become compatible. The substrate offers interchangeable drivers emitting the **same**
protocol:

| Driver | Mechanism | Guarantees | Adoption cost |
|---|---|---|---|
| `LogicalReplicationSource` | WAL via replication slot (current Cella) | Watertight deletes, exact seq | Needs `wal_level=logical`, slot |
| `TriggerOutboxSource` | Postgres triggers write outbox row; poller tails it | Strong; small poll delay | Works on managed PG, no slot |
| `ManualEmitSource` | App calls `sync.emit(change)` after a write | Weakest; app-controlled | Zero infra |

Downstream consumers cannot tell which driver is active.

---

## Backend consumption side (`@sync/backend`) — the real bulk

Adopting the substrate does **not** shrink this layer. It still must be wired to the consumer's auth
and REST endpoints via plug points:

```ts
interface ScopeProvider {
  /** Counter row + channel key for a row (e.g. projectId, or 'global'). */
  getScopeKey(resource: string, row: Record<string, unknown>): string;
  /** SSE channels a subscriber joins (e.g. ['org:abc','org:def']). */
  getChannels(subscriber: Subscriber): string[];
  /** Authorization filter — replaces checkPermission()/accessPolicies. */
  canRead(subscriber: Subscriber, notification: StreamNotification): boolean;
  /** Ordered ancestor scope ids — replaces hierarchy.getOrderedAncestors. */
  resolveScopePath(resource: string, row: Record<string, unknown>): string[];
}

interface EntityOperations {
  /** Delta fetch for catchup/batch — wraps the consumer's REST list endpoint. */
  fetchRange(entityType: string, scopeKey: string, seqCursor: string,
             opts?: { cacheToken?: string }): Promise<{ items: unknown[]; total: number }>;
  /** Single-entity fetch — wraps the consumer's REST detail endpoint. */
  fetchOne(entityType: string, id: string, opts?: { cacheToken?: string }): Promise<unknown>;
}
```

The scope contract is **cross-cutting**: CDC (`SyncTableConfig.scopeColumns`), the backend dispatcher
(`ScopeProvider`), and the frontend sync-store all key against the *same* scope. Packaging CDC forces
this to be defined crisply early — a net positive — but it does not make the dispatcher,
build-message, or catchup operations any smaller.

These pieces are already generic and move with little change: ActivityBus
([backend/src/lib/activity-bus.ts](../backend/src/lib/activity-bus.ts)), stream dispatcher factory
([dispatcher.ts](../backend/src/modules/entities/stream/dispatcher.ts)), subscriber-manager
([subscriber-manager.ts](../backend/src/modules/entities/stream/subscriber-manager.ts)).

---

## Backend caching is part of the substrate, not optional

> A performant sync layer **must** adopt the server-side caching structure. Without it, every SSE
> notification fan-out triggers N independent DB queries (thundering herd) — the engine does not scale.
> The TTL entity cache is described as "essential for the sync engine to scale" in
> [SYNC_ENGINE.md](./SYNC_ENGINE.md#ttl-entity-cache).

The two cache tiers from [backend/src/middlewares/entity-cache/](../backend/src/middlewares/entity-cache/index.ts)
are first-class parts of `@sync/backend`:

### `entityCache` (app / authenticated) — [app-entity-cache.ts](../backend/src/middlewares/entity-cache/app-entity-cache.ts)

- **Entity-keyed** (`entityType:entityId`), forward-only token index (`token → entityKey`).
- Token is an access-control index, **not** the cache key — multiple tokens resolve to one entity, so
  stale clients still get cache hits instead of DB round-trips.
- 10 min TTL, 5000 entries; token index 10000 entries.
- Flow: CDC reserves token → first client fetch (any valid token) enriches → subsequent clients hit.
- Request coalescing (singleflight) by **entity key**: N concurrent misses → 1 DB query → N responses.
- Token signing per session ([token-signer.ts](../backend/src/middlewares/entity-cache/token-signer.ts)) —
  HMAC; CDC mints base token, SSE signs per subscriber, middleware validates `X-Cache-Token`.

### `publicEntityCache` (public / unauthenticated) — [public-entity-cache.ts](../backend/src/middlewares/entity-cache/public-entity-cache.ts)

- Simpler LRU keyed directly by `entityType:entityId` (no token/reservation — public, no auth).
- 1000 entries, 60 min TTL (LRU primary, TTL safety net).
- Invalidated by ActivityBus events on entity change.

### Generalization needed

Both caches are already entity-agnostic in their **mechanism**. The only coupling is that
`publicEntityCache` decides "what is public" via `hierarchy.publicStreamTypes`. This moves to the
`SyncResourceConfig.publicRead` field. Cache **invalidation** is driven by ActivityBus
([cache-invalidation.ts](../backend/src/middlewares/entity-cache/cache-invalidation.ts)) — generic,
keyed by `entityType:entityId`, no change needed.

Both cache middlewares ship as presets
([presets.ts](../backend/src/middlewares/entity-cache/presets.ts): `appCache`, `publicCache`) the
consumer attaches to their detail/list routes. The cache stores **enriched** API responses (signed
URLs, relations) — endpoint-first caching — not raw CDC rows.

---

## Frontend (`@sync/react-query`) — unchanged in scope

Adopting the CDC substrate does not touch the frontend. Effort here is independent:

- **Entity registry** ([entity-query-registry.ts](../frontend/src/query/basic/entity-query-registry.ts))
  is already a registry — but `EntityType` is a closed union; opening it to a runtime registry ripples
  through query keys, handlers, and sync-store (mechanical but pervasive — the biggest frontend cost).
- **SDK coupling**: every entity module imports the generated SDK with path shape
  `{ tenantId, organizationId }`. Abstract behind the `EntityOperations` adapter.
- **Router coupling**: `getRouteTenantId()`
  ([sync-priority.ts](../frontend/src/query/realtime/sync-priority.ts)) scans TanStack Router matches.
  Replace with an injected `resolveScope()` callback.
- **Generic as-is**: HLC/stx, AWSet, squash/coalesce, tab coordinator, mutation defaults registry.

---

## How adopting CDC wholesale changes the assessment

| Concern | Before (generalize per consumer) | After (adopt CDC + tables as a unit) |
|---|---|---|
| Activities schema | Hard blocker — per-consumer DDL + migration | **Solved** — fixed package-owned schema, one-time generalization |
| CDC infrastructure | "Adoption killer," ad-hoc setup | **Encapsulated** — adopted as a unit, driver-pluggable |
| Scope abstraction | Implicit, scattered across layers | **Forced explicit** as CDC input (net positive) |
| Backend consumption breadth | Large | **Unchanged — still large** |
| Backend caching | Easy to forget → non-performant | **First-class substrate requirement** |
| Frontend breadth | Large | **Unchanged — still large** |

The **difficulty ceiling drops** (the scariest schema/infra 20% becomes a bounded, package-internal
problem), but the **total volume moves rather than disappears** — the backend-consumption and
frontend packages remain the real bulk.

---

## Biggest remaining hurdles

1. **Closed `EntityType` union → open registry** retype ripples through the entire frontend.
2. **Authz inversion** — `checkPermission`/`accessPolicies` is a **security boundary** baked into
   dispatcher `shouldReceive`. The `canRead` abstraction is straightforward but every consumer must
   implement it correctly or leak data across scopes. (See existing
   [public-stream-dispatch-security-gap](../info/) concerns.)
3. **Cross-cutting scope contract** — CDC, backend dispatcher, and frontend sync-store must agree on
   the same scope keys. Packaging CDC forces this early but does not remove the wiring.
4. **Cache correctness under generalization** — token signing + forward-only resolution must remain
   watertight when entity types are runtime-registered rather than enum-constrained.

---

## Suggested sequencing (each independently shippable)

1. **Extract `@sync/primitives`** (Tier A) — pure win, validates the seam (days).
2. **Introduce `ScopeProvider` + `SyncResourceConfig` + `EntityOperations` interfaces inside Raak**
   and make Raak consume them. Cella becomes the reference implementation. Decouples Tier B from
   `hierarchy`/`appConfig`/`sdk` without extracting anything yet.
3. **Generalize the activities schema** to `scopeKey`/`scopePath`; migrate Raak onto it.
4. **Wrap CDC behind the `ChangeSource` interface**; add the `TriggerOutboxSource` driver.
5. **Lift `entityCache`/`publicEntityCache` into `@sync/backend`** behind the `publicRead` config.
6. **Open the frontend `EntityType` union to a registry**; abstract the SDK behind `EntityOperations`.
7. Only then split into published packages.

Steps 2–3 hold the genuine difficulty; everything before is cheap, everything after is packaging.
Avoid a full codegen framework (step "8") unless there is external demand — it competes with
Electric/LiveStore and dilutes the OpenAPI-native, internalized thesis that motivated building this
([SYNC_ENGINE.md](./SYNC_ENGINE.md#why-a-built-in-sync-engine)).

---

## Appendix — Frontend file-by-file effort (`frontend/src/query`)

Per-file assessment of how much work each file in [frontend/src/query](../frontend/src/query) needs
to become generic enough to publish for any React Query frontend. Coupling categories: **(1)** generated
SDK, **(2)** `appConfig`/`hierarchy`/`shared`, **(3)** closed `EntityType` union, **(4)** TanStack
Router, **(5)** Cella Zustand stores, **(6)** org/tenant scoping, **(7)** i18n/toast/UI, **(8)**
membership/permission model.

Effort scale: **NONE** = ship as-is · **LOW** = ~30 min param injection · **MEDIUM** = ~1–2h
store/factory inversion · **HIGH** = ~4–8h architectural inversion.

### Aggregate

| Effort | Files | Share | Meaning |
|---|---|---|---|
| NONE | 26 | ~31% | Pure algorithms, zero coupling |
| LOW | 19 | ~25% | Pass a value instead of reading config |
| MEDIUM | 12 | ~16% | Replace a store call with a callback |
| HIGH | 18 | ~24% | Hardcodes entity/scope/permission semantics |

**~56% is generic or near-generic.** Difficulty concentrates almost entirely in `realtime/` and
`enrichment/`.

### Top-level

| File | Coupling | Effort | What changes |
|---|---|---|---|
| index.ts | — | NONE | Re-exports |
| mutation-registry.ts | — | NONE | Generic mutation registration |
| query-client.ts | — | NONE | Generic TanStack setup |
| react-query.ts | 6 | LOW | Make org/tenant optional in `QueryMeta` |
| types.ts | 6 | LOW | Optional context fields |
| persister.ts | 2 | LOW | Accept app slug as param |
| on-success.ts | 5 | LOW | Replace alert store with callback |
| on-error.ts | 5,7 | MEDIUM | Replace i18n/toaster with error callback |
| provider.tsx | 2,5,6,7 | HIGH | Composition root — likely stays consumer-authored |

### `basic/`

| File | Coupling | Effort | What changes |
|---|---|---|---|
| cache-mutations.ts | — | NONE | Pure cache utilities |
| create-optimistic.ts | 2,5 | LOW | Inject ID generator + `createdBy` callback |
| create-query-keys.ts | 2,3 | MEDIUM | Inject `getAncestors(type) => string[]` |
| entity-query-registry.ts | 3 | LOW | Runtime string registry; union is type-hint only |
| fetch-all-pages.ts | — | NONE | Pure pagination |
| fetch-slug-cache-id.ts | — | NONE | Generic cache utility |
| find-in-list-cache.ts | — | NONE | Generic cache search |
| flatten.ts | — | NONE | Pure |
| get-query-key-sort-order.ts | — | NONE | Pure |
| helpers.ts | 1 | LOW | Use generic record instead of SDK type |
| infinite-query-options.ts | — | NONE | Generic pagination config |
| invalidation-helpers.ts | 2,3 | LOW | Registry is dynamic; type is a hint |
| mutate-query.ts | 1,3 | LOW | Generic object type |
| preserve-included.ts | — | NONE | Pure structural sharing |
| sync-stale-config.ts | 4,5 | MEDIUM | Invert to `createSyncStaleTime(isLive)` |
| types.ts | 3 | LOW | Make context ID columns optional |
| use-infinite-query-total.tsx | — | NONE | Pure hook |
| index.ts | — | NONE | Re-exports |

### `offline/` — the cleanest win (~½ day total)

| File | Coupling | Effort | What changes |
|---|---|---|---|
| array-delta.ts | — | NONE | Pure AWSet algorithm |
| connectivity.ts | 2 | LOW | Accept health URL param |
| hlc.ts | 2 | LOW | Inject `sourceId` + hash function |
| squash-utils.ts | — | NONE | Pure squashing algorithm |
| stx-utils.ts | 1,2 | LOW | Inject `sourceId`; generic `StxBase` |
| update-success-utils.ts | — | NONE | Pure cache merge |
| index.ts | — | NONE | Re-exports |

> The conceptually hardest part of sync (HLC / AWSet / offline queue) is the **easiest** to package
> because it is math, not config.

### `realtime/` — the bulk of the work (~5–8 days)

| File | Coupling | Effort | What changes |
|---|---|---|---|
| cache-token-store.ts | — | NONE | Pure token storage |
| propagation.ts | — | NONE | Pure embedding propagation |
| index.ts | — | NONE | Re-exports |
| stream-store.ts | 2 | LOW | Accept app name (devtools/storage key) |
| sync-store.ts | 2 | LOW | Accept app slug (localStorage key) |
| types.ts | 1 | LOW | Re-export / generic `StreamNotification` |
| public-stream.tsx | 5 | MEDIUM | Externalize stream lifecycle |
| tab-coordinator.tsx | 5 | MEDIUM | Generic mechanism; Zustand is detail |
| public-stream-handler.ts | 1,2,3,5 | MEDIUM | Inject public-entity predicate + store |
| app-stream-handler.ts | 1,2,3,5,6,7,8 | HIGH | Inject entity config + handlers; externalize seen/membership |
| app-stream.tsx | 4,5,7 | HIGH | Inject route scope resolver; optional UI store |
| cache-ops.ts | 1,2,3,5 | HIGH | Generic entity checks; remove Yjs coupling; SDK adapter |
| catchup-processor.ts | 1,2,3,5,6,8 | HIGH | Externalize entity-type + scoping logic |
| membership-ops.ts | 2,5,6,8 | HIGH | Externalize entity-to-menu map; callback for `getAndSetMe` |
| sync-priority.ts | 1,4,5,6 | HIGH | Inject route resolution; decouple hierarchy checks |
| sync-service.ts | 2,4,5,6,7 | HIGH | Externalize entity-to-query mapping + pagination config |

The seven HIGH files share **three root couplings**, all resolved by the same injected config:
SDK path shape `{tenantId, organizationId}`, entity-kind predicates (`isProductEntity` etc.), and
router-derived scope (`getRouteTenantId`/`getRouteOrgId`).

### `enrichment/` — exclude from the sync package

This is Cella's membership/permission/menu model, **not** sync. `permissions.ts` and
`init-enrichment.ts` are HIGH and tied to `accessPolicies`/`computeCan`/roles. Recommendation: leave
`enrichment/` out entirely — the sync engine only needs a `canRead`/scope hook, not the enrichment
auto-discovery system.

### The single config object that resolves most MEDIUM/HIGH work

```ts
createSyncClient({
  entities: EntityOperations,          // SDK adapter: fetchRange / fetchOne per entityType
  isSynced: (type) => boolean,         // replaces isProductEntity
  resolveScope: () => ScopeContext,    // replaces getRouteTenantId / getRouteOrgId
  getAncestors: (type) => string[],    // replaces hierarchy.getOrderedAncestors
  sourceId, healthUrl, appSlug,        // the LOW param injections
  onError, onConnectivityChange,       // replaces i18n / toaster / alert store
});
```

Once these exist, ~90% of the HIGH files become mechanical rewrites — they stop *importing* Cella and
start *reading* injected config.

### Frontend rollup

| Bundle | Files | Effort | Notes |
|---|---|---|---|
| `@sync/react-query-core` (`basic/` + `offline/` + generic top-level) | ~25 | **2–3 days** | Publishable with little redesign |
| `@sync/react-query-realtime` | ~16 | **5–8 days** | Gated on `EntityOperations` + `isSynced` + `resolveScope` |
| `enrichment/` | — | excluded | Separate concern, not sync |

Realistic total to make the *sync-relevant* frontend generic (excluding enrichment and the
consumer-owned `provider.tsx`): **~8–12 working days** — and it cannot be finished independently. The
`resolveScope` / `isSynced` / `EntityOperations` shapes must be **co-designed with the backend
substrate** so both ends key against the same scope contract (the cross-cutting risk above).

---

## Appendix — Backend file-by-file effort (`backend/src`)

Per-file assessment of the backend sync surface. Coupling categories: **(1)** `appConfig`/`hierarchy`
/`shared` entity config, **(2)** Raak-specific Drizzle tables (activities w/ hardcoded
`organizationId`/`projectId`, `context_counters`, memberships), **(3)** permission/auth model
(`checkPermission`/`accessPolicies`/`buildSubject`/guards), **(4)** org/tenant scoping, **(5)** Hono
framework (acceptable for a Hono middleware package — flagged, not penalized), **(6)** generated
OpenAPI/Zod schemas, **(7)** i18n/logging/tracing/metrics.

Effort scale as in the frontend appendix (NONE / LOW / MEDIUM / HIGH).

### Aggregate

| Effort | Approx. share | Meaning |
|---|---|---|
| NONE — ship as-is | ~30% | `core/stx/`, `lib/`, most of `middlewares/entity-cache/`, stream routing |
| LOW | ~15% | Schema enum/param injection, JSONB key-format params |
| MEDIUM | ~20% | Config-registry injection (embeddings, public-read modes, message building) |
| HIGH | ~35% | Hierarchy/scope/permission/counter logic — deeply Cella-shaped |

The backend is **more bifurcated** than the frontend: the *primitives* (`core/stx/`, `lib/`,
caches) are ~100% generic, while the *plumbing* (`modules/entities/operations` + `helpers`) is the
most Cella-specific code in the whole engine.

### `core/stx/` — 100% generic, publish as-is

| File | Coupling | Effort |
|---|---|---|
| array-delta.ts, build-stx.ts, create-server-stx.ts, field-versions.ts, hlc.ts, resolve-update.ts, update-schema.ts, index.ts | — | **NONE** |

> This is the server twin of the frontend `offline/` folder. HLC LWW, AWSet deltas, the full
> `resolveUpdateOps` pipeline (filter no-op → resolve HLC conflicts → apply deltas → build stx) are
> pure functions over a generic entity record. Zero coupling.

### `lib/` — 100% generic

| File | Coupling | Effort | Note |
|---|---|---|---|
| activity-bus.ts | — | NONE | Generic event emitter |
| cdc-websocket.ts | 5 | NONE | Hono-bound; IP/secret check → env config |
| ttl-cache.ts, lru-cache.ts | — | NONE | Generic cache wrappers |
| sync-metrics.ts | 5,7 | NONE | OTel wrappers |

### `middlewares/entity-cache/` — ~95% generic

| File | Coupling | Effort | What changes |
|---|---|---|---|
| app-entity-cache.ts | — | NONE | Token-indexed forward-only cache (singleflight) |
| public-entity-cache.ts | — | NONE | LRU public cache |
| token-signer.ts | — | NONE | HMAC signing |
| batch-resolve.ts | 5 | NONE | Batch list-cache middleware |
| metrics.ts, index.ts | — | NONE | Metrics + context vars |
| cache-invalidation.ts | 1,5 | LOW | `isPublicStreamEntity()` → injected predicate |
| presets.ts | 1,5 | LOW | `productEntityType` param → injected `isSynced` |

### `modules/entities/stream/` — ~70% generic

| File | Coupling | Effort | What changes |
|---|---|---|---|
| dispatcher.ts | 5 | NONE | Generic dispatch factory |
| subscriber-manager.ts | — | NONE | Pure channel routing |
| helpers.ts | 5 | NONE | SSE write primitives |
| send-to-subscriber.ts | 5 | NONE | Generic |
| index.ts | — | NONE | Exports |
| types.ts | 1,4 | LOW | `ProductEntityType`/`memberships`/`isSystemAdmin` → generics |
| build-message.ts | 1,4 | MEDIUM-HIGH | `getParent`/`entityIdColumnKeys`/`entityEmbeddings` → injected scope + embedding config |

### `modules/entities/` (module root) — mixed

| File | Coupling | Effort | What changes |
|---|---|---|---|
| entities-module.ts | 7 | NONE | Tag registry entry |
| entities-routes.ts | 5,6 | LOW | Stream/catchup routes generic; guards are framework concern |
| entities-schema.ts | 1,6 | LOW | `z.enum(contextEntityTypes)` → pass enum at creation |
| entities-queries.ts | 2,4 | MEDIUM-HIGH | Counter/membership SQL assumes role registry + `context_type` FK names |
| entities-handlers.ts | 1,4,5 | HIGH | Org-channel logic + `publicStreamTypes` + membership extraction → scope factory |
| entities-listeners.ts | 1,4 | HIGH | Loops `productEntityTypes`; per-org dispatch → entity registry injection |

### `modules/entities/operations/` — ~20% generic (most Cella-specific)

| File | Coupling | Effort | What changes |
|---|---|---|---|
| check-slug.ts | — | NONE | Simple wrapper |
| public-catchup.ts | 1 | MEDIUM | `publicStreamTypes` + `public:{type}` key format → config |
| app-catchup.ts | 1,2,4 | HIGH | Assumes org→sub-context hierarchy + membership scan + counter schema → parameterize scope levels |

### `modules/entities/helpers/` — ~15% generic (lowest)

| File | Coupling | Effort | What changes |
|---|---|---|---|
| get-entity-counts.ts | — | NONE | Re-export (deprecated) |
| parse-counter-counts.ts | 2 | LOW | `s:`/`e:` JSONB key prefixes → params |
| build-zero-counts.ts | 1,4 | MEDIUM | `getOrderedDescendants` + `roles.all` → registries |
| dispatch-to-stream.ts | 1,3,4 | MEDIUM-HIGH | `buildSubject` + `checkPermission` → pluggable `canRead`; public-read registry |
| propagation-hints.ts | 1,2 | MEDIUM-HIGH | `entityEmbeddings` map → injected embedding registry |
| collect-sub-context-ids.ts | 1,4 | HIGH | Hardcoded context-hierarchy walk → generic scope collector |
| recalculate-counters.ts | 1,2,4 | HIGH | Hardcoded multi-phase SQL (orgs, memberships, roles, seen_by) → **app-specific; do not publish** |

### The "what makes an endpoint synced" integration shape

A product-entity update handler (e.g. task) wires sync in a repeating sequence — **this repetition is
the unification opportunity**:

```ts
// GENERIC (core/stx): conflict resolution + delta application + no-op detection + stx build
const resolved = resolveUpdateOps(entity, ops, stx);
if (!resolved.changed) return fast(entity);

// HANDLER-SPECIFIC: business validation + DB write + relation hydration
const updated = await updateTask(txCtx, { id, values: { ...resolved.values, stx: resolved.stx } });

// GENERIC (cache middleware): hand enriched data to the cache preset
ctx.set('entityCacheData', hydrateTask(updated, user));

// GENERIC (CDC → ActivityBus → dispatcher): emitted downstream, filtered by canRead + scope
```

---

## Unification: a universal sync middleware

The backend's generic ~30% is currently **scattered** across handlers (each handler calls
`resolveUpdateOps`, sets `entityCacheData`, and relies on listeners for dispatch). The biggest
*architectural* win — independent of packaging — is to **collapse the repeated per-handler sync
choreography into a single declarative seam.** Three levels of unification, increasing ambition:

### Level 1 — `withSync()` route wrapper (absorbs the repeated choreography)

A Hono middleware / handler decorator that owns the generic steps and leaves business logic alone:

```ts
withSync({
  // generic, provided by the package
  resolveOps: resolveUpdateOps,
  // pluggable boundaries (consumer supplies)
  loadEntity: (ctx) => getEntity(ctx),
  canWrite?: (ctx, entity) => void,          // replaces inline checkPermission
  cacheKey?: (entity) => string,             // entityType:id
  // handler-specific, stays in the consumer
  onUpdate: (ctx, resolved) => persist(resolved),
});
```

**Absorbs:** stx parsing, HLC conflict resolution, AWSet delta application, no-op early return,
`entityCacheData` reservation, and (optionally) the write-side permission pre-check.
**Leaves handler-specific:** entity fetch query, business validation (e.g. project move, label
scoping), relation hydration, response shaping, the actual DB write.

This is a **pure refactor with no abstraction debt** — worth doing in Raak today even if packaging
never happens, because it removes the most error-prone copy-paste in every synced endpoint.

### Level 2 — A `SyncResource` registration (unifies dispatch + catchup + counters)

Today the read side is spread across `entities-listeners.ts` (per-type dispatch loops),
`build-message.ts` (scope/embedding resolution), the catchup operations, and the counter helpers —
all reading `appConfig`/`hierarchy` independently. Unify them behind one registration call that is the
**server mirror of the frontend `createSyncClient`**:

```ts
registerSyncResource({
  entityType: 'task',
  table: tasks,
  scope: { columns: ['project_id', 'organization_id'] },   // ScopeProvider input
  merge: { scalars: [...], sets: ['labels', 'assignedTo'] },
  publicRead?: 'parent',
  embeddings?: [{ source: 'label', field: 'labels' }],
  canRead: (subscriber, notification) => boolean,           // the security boundary
});
```

One registry then drives: listener wiring, message building (scope + embeddings), catchup summaries,
cache invalidation, and counter keys — **eliminating the four independent `appConfig` reads.** This
is the linchpin refactor (step 2 in the sequencing): it does not extract a package, but it inverts
every MEDIUM/HIGH backend file from *importing* config to *reading* a registration.

### Level 3 — Full `@sync/backend` Hono plugin

Package Level 1 + Level 2 + the streams + caches + CDC client as an installable plugin:

```ts
const sync = createSyncBackend({
  changeSource,                 // logical-repl | outbox | manual (from @sync/substrate)
  scopeProvider,                // getScopeKey / getChannels / canRead / resolveScopePath
  resources: [taskResource, ...],
});
app.route('/entities', sync.routes);   // app + public stream + catchup
app.use('/task/:id', sync.cache.app);  // cache presets
```

**What the plugin absorbs:** ActivityBus, CDC websocket, dispatcher + subscriber manager, both
stream routes, both catchup operations, both caches, token signing, `withSync`, and the resource
registry. **What stays in the consumer:** the Drizzle entity tables, the REST list/detail handlers
(delta fetch must hit *their* endpoints), business validation, and the `ScopeProvider`/`canRead`
implementations (their auth model).

### What unification does and does not buy

| | Effect |
|---|---|
| Removes per-handler copy-paste | ✅ Level 1 — pure win, do now |
| Collapses 4 scattered `appConfig` reads into 1 registry | ✅ Level 2 — the key decoupling |
| Makes auth a single explicit boundary (`canRead`) | ✅ security hardening side-effect |
| Eliminates the hierarchy/scope coupling | ⚠️ relocates it into `ScopeProvider`; does not delete it |
| Generalizes `recalculate-counters` / multi-level catchup | ❌ still the hardest part; counter recompute likely stays app-specific |

### Backend rollup

| Bundle | Scope | Effort | Notes |
|---|---|---|---|
| `@sync/primitives` (`core/stx/` + `lib/` caches + signing) | ~20 files | **2–3 days** | Publishable now, shared with frontend twin where applicable |
| `withSync()` refactor in Raak | handlers | **2–3 days** | Pure refactor, no packaging needed, immediate value |
| `@sync/backend` plugin (streams + catchup + caches + registry) | stream/ + operations/ + helpers/ + middlewares | **3–5 weeks** | Gated on `ScopeProvider` + `SyncResource` registry + `canRead` |
| `recalculate-counters` + multi-level catchup | helpers/ | excluded / app-specific | Ships as a documented example, not library code |

Realistic total to make the *sync-relevant* backend generic (excluding `recalculate-counters` and
app-specific counter recompute): **~4–6 weeks**, dominated entirely by `modules/entities/operations`
and `helpers` — the same hierarchy/scope/permission logic that the `ScopeProvider` contract from the
top of this document is designed to absorb. As with the frontend, this cannot be finished
independently: the `ScopeProvider` / `SyncResource` / `canRead` shapes are the **shared contract**
both ends and the CDC substrate must agree on.
