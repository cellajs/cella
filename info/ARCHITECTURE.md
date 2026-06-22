# Architecture
This document describes the high-level architecture of Cella.

### Target product
* Frequent-use or heavy use web applications focused on user-generated content
* Requires a great UX on different devices, but native apps are not a priority
* Fullstack development is seen as beneficial to work effectively

### Philosophy
 * Postgres, OpenAPI & React Query are the core libraries. Cella is a template around these.
 * Prevent abstraction layers, let the libraries do the work. Use composable functions.
 * Deliberately narrow: Cella uses Drizzle ORM and will not make it replaceable with another ORM.
 * Modularity: As Cella grows, be able to scaffold only modules that you need.
 * Use open standards and be interoperable from the start.
 * Focused on client-side rendering (CSR) and in future static site generation (SSG).
 * EU Data Sovereignty: Deploy on European-owned cloud infrastructure. 

| Backend    | Frontend    | Build    | Deploy    |
|------------|-------------|----------|-----------|
| [nodejs](https://nodejs.org) | [react](https://reactjs.org) | [pnpm](https://pnpm.io) | [pulumi](https://www.pulumi.com) |
| [hono](https://hono.dev) | [tanstack-router](https://github.com/tanstack/router) | [vite](https://vitejs.dev) | [scaleway](https://www.scaleway.com) |
| [postgres](https://www.postgresql.org) | [tanstack-query](https://github.com/tanstack/query) | [vite-pwa](https://github.com/antfu/vite-plugin-pwa) | [github-actions](https://github.com/features/actions) |
| [drizzle-orm](https://orm.drizzle.team/) | [zustand](https://github.com/pmndrs/zustand) | [storybook](https://storybook.js.org) |  |
| [zod](https://github.com/colinhacks/zod) | [dexie](https://github.com/dexie/Dexie.js) | [biome](https://biomejs.dev) |  |
| [openapi](https://www.openapis.org) | [base-ui](https://base-ui.com/) | [lefthook](https://github.com/evilmartians/lefthook) |  |
| [yjs](https://yjs.dev) | [lucide-icons](https://lucide.dev) | [artillery](https://artillery.io) |  |


## Data modeling & modularity

Tables can be split in `entity`,  `resource` and _other_ tables (see `backend/src/db/schema/`). Entities are split in categories:
* `ContextEntityType`: Has memberships (`organization`)
* `ProductEntityType`: Content related, no membership (`attachment`, `page`)
* All entities, including `user`: (`user`, `organization`, `attachment`, `page`)

The cella template has a single context entity : `organization`. It has two product entities: `attachment` - with parent `organization` - and a public product entity, `page`. But in a typical app you would likely have more context entities such as a 'bookclub' and more product entities such as 'book' and 'review'.

Both frontend and backend have business logic split in modules. Most of them are in both backend and frontend, such as `authentication`, `user` and `organization`. The benefit of modularity is twofold: better code (readability, portability etc) and to pull upstream cella changes with less friction.

### Entity hierarchy builder

The entity taxonomy is defined using `createEntityHierarchy()` (in `shared/src/config-builder/`). Forks customize their entity setup in `shared/config/hierarchy-config.ts`.

```
createEntityHierarchy(roles).user().context('organization', ...).product('attachment', ...).build()
```

The builder validates at construction time that parents exist before children and that `publicRead` inheritance is consistent (e.g. `'publicParent'` requires a parent context with `'publicSelf'`). The resulting frozen `EntityHierarchy` object is the central configuration artifact — it drives RLS policy selection, permission checks, menu structure, count tracking, and SSE dispatcher routing.

Key methods: `getOrderedAncestors()`, `getChildren()`, `getOrderedDescendants()`, `getPublicReadMode()`.

## Sync engine

Cella has a pragmatic - yet harmonious - approach to sync and offline. Context entities (e.g. organizations) use standard CRUD OpenAPI endpoints — they only have offline read access. Product entities (e.g. attachments, pages) have a full sync layer using a 'notify-then-fetch' pattern. All data is collected by the react-query queryClient.

The pipeline flows: **Postgres WAL → CDC Worker → WebSocket → ActivityBus → SSE → Client**. There are two independent streams:
- **App stream** (`/entities/app/stream`): authenticated, carries membership events, org events, and product entity notifications. Uses leader-tab pattern (Web Locks API) — one tab holds the SSE connection, followers sync via BroadcastChannel.
- **Public stream** (`/entities/public/stream`): unauthenticated, carries events for public product entities (e.g. pages). Each tab maintains its own connection (no leader election).

Sequence numbers are hierarchy-aware: the CDC worker stamps `seq` on all product entity rows after processing each WAL event. The seq is scoped to the entity's direct parent context (e.g., `organization_id` for attachments, `project_id` for project-scoped entities in forks). Public entities without an org parent (e.g. pages) use a global `public` scope. List endpoints support `seqCursor` for delta fetches during catchup. Bulk operations in a single database transaction produce batched notifications — one per (entityType, action, context) — rather than per-entity, reducing SSE fan-out. See [SYNC_ENGINE.md](./SYNC_ENGINE.md) for details.

### Per-field merge strategies

Product entity mutations use per-field merge strategies instead of a single conflict model. The strategy is implicit from the value shape in the `ops` key:

| Strategy | CRDT type | Example fields | Merge rule |
|----------|-----------|----------------|------------|
| **LWW** | LWW-Register (HLC) | `name`, `status`, `points` | Latest HLC timestamp wins silently |
| **AWSet** | Add-Wins Set | `labels`, `assignedTo` | Commutative `{ add, remove }` deltas |
| **YATA** | Yjs CRDT | `description` | Character-level merge via standalone Yjs worker |

Scalars resolve silently via HLC comparison; set fields are conflict-free; descriptions use a dedicated Yjs WebSocket relay for real-time co-editing with client-side materialization of derived fields. See [FIELD_MERGE_STRATEGIES.md](./FIELD_MERGE_STRATEGIES.md) for full implementation details.

### Client sync cycle

On every stream connect (including reconnects), a two-phase sync cycle runs:

1. **Phase A (catchup)** — fast, synchronous, before SSE opens:
   - Applies any legacy hard-delete IDs directly
   - Compares entity-type seqs and delta-fetches changed ranges; soft-delete tombstones remove cached product entities
   - Handles membership changes
   - **Cache integrity check**: compares server entity counts vs cached totals

2. **Phase B (sync service)** — background, after SSE reaches `live`:
   - High priority: `ensureQueryData` for current org (resolves staleness from Phase A)
   - Low priority: `ensureQueryData` for other orgs (only when `offlineAccess` enabled, for offline cache fill)
   - Without `offlineAccess`, other orgs refetch naturally via React Query hooks on navigation

3. **Live SSE** — handles individual notifications with priority routing:
   - High priority (current org): range fetch the notified seq and patch into list caches
   - Low priority (other orgs): mark stale, refetch on next access

Offline mutations are queued with stx metadata (HLC timestamps for scalars, AWSet deltas for sets) and squashed per entity until connectivity returns.

For more details, see [SYNC_ENGINE.md](./SYNC_ENGINE.md).

## Query layer

React Query (TanStack Query) is the central data layer on the frontend (`frontend/src/query/`) for entities but also other data. Each entity module creates standardized query keys via `createEntityKeys(entityType)` and registers them in a central `contextEntityQueryRegistry` (see `frontend/src/list-queries-config.tsx`), enabling dynamic lookup by stream handlers, cache ops, and invalidation helpers. Optimistic updates (`createOptimisticEntity`) and last-mutation-wins invalidation helpers are core patterns.

Product entity queries (attachment, page) use a sync-aware `staleTime` (`syncStaleTime` in `query/basic/sync-stale-config.ts`): Infinity when the sync stream is live, 5 minutes as fallback when disconnected. Freshness is controlled by catchup-based seq invalidation and count-based integrity checks — not time-based staleness. Non-synced queries (users, tenants, requests) keep the global 30-second default.

### Canonical vs derived queries

Each product entity has one **canonical query** per parent-context scope — a flat list of all entities in that scope (per organization for attachments, global for pages). It's the single source of truth the sync layer keeps fresh and patches in place. Components derive narrower views from it via `select()` (e.g. filtering attachments by group) instead of issuing separate server queries. **Filtered** lists that rely on server-side params the client can't replicate are simply refetched on relevant events rather than patched. One canonical source per scope is what makes optimistic updates, offline persistence, and conflict-free patching tractable.

### Cache persistence

The React Query cache is persisted to IndexedDB via Dexie with two modes controlled by the `offlineAccess` toggle:
- **Offline mode** (`offlineAccess=true`): shared key, survives browser restart for full offline capability. Sync service eagerly fills cache for all orgs.
- **Session mode** (`offlineAccess=false`): per-tab session key, survives refresh but cleaned up on tab close. Sync service only resolves staleness for the current org.

Within each mode the persister uses a **hybrid storage layout** (two Dexie tables): product entity queries are stored as individual records in a `queries` table for incremental diffing — only changed queries are written — while context queries are bundled into the `meta` record, since they are few, small, and all needed at startup.

Only the leader tab (elected via Web Locks API) persists mutations to prevent cross-tab conflicts. Since `mutationFn` cannot be serialized, entity modules register their defaults via `addMutationRegistrar()` at load time so paused mutations can resume after page reload.

### Enrichment pipeline

A QueryCache subscriber (`frontend/src/query/enrichment/`) auto-enriches context entity list data whenever cache entries change. Three enrichers run in sequence on each item:
1. **Membership**: attaches the user's cached membership to the entity.
2. **Permissions**: computes a `can` map (action → `true | false | 'own'`, keyed by entity type + descendants) from the membership role and `accessPolicies`. The `'own'` value indicates the action is allowed only for entities created by the current user (implicit owner relation). Use `resolvePermission(permission, entity.createdBy?.id, userId)` to resolve per-entity. System admins get full permissions.
3. **Ancestor slugs**: walks the entity hierarchy to build URL-friendly slug paths from cached data.

This is how `item.membership`, `item.can`, and `item.ancestorSlugs` are populated on context entities without extra API calls.

## Authentication

Cella supports four auth strategies (configurable per fork via `appConfig.enabledAuthStrategies`, magic link is the default passwordless strategy):

| Strategy | Description | Key details |
|----------|-------------|-------------|
| Magic Link | Email magic link | Single-use tokenized link sent via email |
| Passkey | FIDO2/WebAuthn | Credentials stored in `passkeys` table |
| OAuth | GitHub, Google, Microsoft | Uses `arctic` library. Google + Microsoft use PKCE. |
| TOTP | Time-based one-time password | MFA fallback, only usable after passkey primary auth |

Cookie-based sessions (hashed, typed as `regular`/`impersonation`/`mfa`) with single-use tokens for verification and invitation flows. Auth endpoints are rate-limited with parallel brute-force protection. Sysadmin impersonation is supported with IP allowlist enforcement.

## Multi-tenancy

A `tenant` is not an entity — but a `resource` that acts as top-level isolation unit.

Tenant-scoped routes use `/:tenantId/` in the path. Guards (`authGuard` → `tenantGuard` → `orgGuard`) validate membership and set `ctx.var.db` to `baseDb`. Product entity handlers wrap their DB operations in `tenantRead()` or `tenantWrite()` to get an RLS-scoped transaction. Context entity handlers use `baseDb` directly (no RLS). See AGENTS.md for the full guard chain.

## Security & tenant isolation

Cella uses three defense-in-depth layers. The permission manager and guard chain are the primary authorization mechanisms; RLS (on product entities), composite FKs, and immutability triggers are safety nets that catch application bugs.

| Layer | What it catches | Key files |
|-------|----------------|-----------|
| Guard chain (orgGuard) | Cross-org access within a tenant | `backend/src/middlewares/guard/` |
| Permission Manager | Unauthorized actions (role/membership checks) | `backend/src/permissions/` |
| Row-Level Security | Cross-tenant data leaks (product entities only) | `backend/src/db/rls-helpers.ts`, `backend/src/db/tenant-context.ts` |
| Composite Foreign Keys | Franken-rows (mismatched tenant/org references) | `backend/src/db/schema/` |

### Boundaries

RLS session variables (`app.tenant_id`, `app.user_id`) are set per transaction by the `tenantRead()` helper in handler code. `tenant_id` is the **hard** DB-enforced boundary for **product entity** tables — every product entity table's SELECT policy compares the row's `tenant_id` directly against the session variable.

**Context entities** (organizations, projects, workspaces) and **memberships** do not use RLS. Access control for these tables is enforced entirely at the application layer by the guard chain (`authGuard` → `tenantGuard` → `orgGuard`). This avoids read-lock contention on shared relationship data.

Organization isolation is enforced at the **application layer** by the guard chain, not at the RLS level. This avoids expensive `EXISTS` membership subqueries on every row access. The orgGuard validates that the authenticated user has a membership in the target organization before any handler runs. Cross-org API tests (`backend/tests/security/cross-org.test.ts`) verify this boundary.

All RLS policies on product entities are fail-closed: missing or empty session context returns zero rows.

### RLS read/write split

Product entity handlers use helpers from `backend/src/db/tenant-context.ts`:

- **`tenantRead(ctx, fn)`** — Opens a read-only transaction with RLS session variables. `SET TRANSACTION READ ONLY` provides lock-free reads. SELECT policies are evaluated.
- **`tenantWrite(fn)`** — Opens a plain read-write transaction. No session variables are set — write isolation is enforced by guards + composite FKs + immutability triggers, not RLS.

The `tenantRead` callback receives a `readCtx` with `{ var: { ...ctx.var, db: tx } }` so query functions can use the RLS-scoped transaction.

### RLS policy categories

| Category | SELECT | Write | Builder | Use case |
|----------|--------|-------|---------|----------|
| Tenant-scoped | tenant + auth | No policy (app-layer) | `tenantSelectPolicy()` | Product entity tables (attachments, tasks, labels, yjs-docs) |
| No RLS | — | — | — | Context entities (organizations, projects, workspaces), memberships, pages |

### Database roles

| Role | RLS | Purpose |
|------|-----|---------|
| `runtime_role` | Enforced | All app requests via Hono handlers |
| `admin_role` | `BYPASSRLS` | Migrations, seeds, system jobs, CDC worker (needs `REPLICATION`) |

### Immutability triggers

Identity columns (`tenant_id`, `organization_id`, `user_id` on memberships, etc.) are protected by BEFORE UPDATE triggers that reject changes after creation. Activities are fully append-only. See `backend/src/db/immutability-triggers.ts`.

### Permission manager

`getAllDecisions()` resolves permissions by walking the entity hierarchy (most-specific context → root), matching memberships against access policies defined in `configureAccessPolicies()` (`shared/config/permissions-config.ts`). Policies support three values: `1` (allowed), `0` (denied), and `'own'` (allowed only when `entity.createdBy === userId` — an implicit "owner" relation inspired by Zanzibar). Grant attribution tracks whether access was granted via a membership or an owner relation. System admins bypass all checks.

### Fork contract

> Every tenant-scoped table must have `tenant_id`. Tables with an organization parent must also have `organization_id` with a composite FK to `organizations(tenant_id, id)`. Parentless product entities require `tenant_id` only. The entity hierarchy config (`shared/config/hierarchy-config.ts`) determines which pattern applies.


## Observability (WIP)

OTel-based observability across all services (backend, CDC, YJS, frontend) with [Maple.dev](https://maple.dev) as the default telemetry backend. Node services share a `createOtelSDK()` factory for traces, metrics, and logs (gated by the `MAPLE_SECRET_INGEST_KEY` env var); the frontend uses a browser `WebTracerProvider` for `traceparent` propagation and can export spans directly to Maple when `appConfig.maplePublicIngestKey` is set. Logging is Pino-based, bridged to OTel in production via `pino-opentelemetry-transport`.

See [OTEL.md](./OTEL.md) for the full observability architecture, including per-service setup, health endpoints, and graceful shutdown.


## API design

The API runs through [zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) to build an OpenAPI 3.1 specification. Please read the readme in this middleware before you get started. An api client is generated in the frontend using [openapi-ts](https://github.com/hey-api/openapi-ts), which produces zod schemas, types, and an sdk for the frontend.

### OpenAPI extensions & doc generation

The OpenAPI spec is enriched with custom `x-*` specification extensions that describe guards, rate limiters, and caches per operation. Middleware wrapped with `xMiddleware` carries typed metadata; `createXRoute` (used instead of `createRoute`) automatically collects this metadata into `x-guard`, `x-rate-limiter`, and `x-cache` spec extensions. New extension types are added via a central registry.

At startup the backend builds the full spec (including an `info.x-extensions` block with all definitions and values), writes a cached `openapi.cache.json`. A custom Vite plugin pre-parses the spec into static JSON at build time; the frontend docs UI dynamically generates table columns from the extension definitions — no hardcoding of extension names.


### Mocks

Mock generators in `backend/mocks/` serve three purposes:

- **OpenAPI examples** — Response mocks (deterministic via seeded faker) used as `example:` values on Zod schemas and route responses — the sole source of OpenAPI examples.
- **Database seeding** — Insert mocks return Drizzle `Insert*Model` types with `UniqueEnforcer`.
 **(Load) tests** — Reusable mock data generators.


## Testing

See [info/TESTING.md](./TESTING.md) for test modes, infrastructure, and writing guidelines.


## File structure
Cella is a flat-root monorepo.

```
.
├── ai                        AI worker entrypoint (delegates to backend)
├── backend
│   ├── drizzle               DB migrations
│   ├── emails                Email templates with jsx-email
│   ├── scripts               Seed scripts and other dev scripts
├── bench                     Artillery load testing
├── cdc                       Change Data Capture worker (WAL → activities → SSE)
├── cli/cella                 CLI for syncing forks with upstream Cella
├── frontend                  SPA using vite, React etc
├── infra                     Pulumi IaC (Scaleway) deployment with CLI
├── info                      Documentation, changelog, migration plans
├── json                      Static JSON data 
├── locales                   Translations
├── sdk                       Auto-generated SDK (types, zod schemas, fetch client)
├── shared                    Shared config, types & utils
├── studio                    Drizzle Studio launcher for local DB inspection
└── yjs                       Yjs collaborative editing worker (ws binary relay)
```



