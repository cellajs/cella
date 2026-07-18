# Architecture

This document describes the high-level architecture of Cella.

## Overview

This diagram shows the normal production topology of a Cella app. Your own setup could be different since you can choose to add or remove workers or 'cohost' them into a single backend VM.

```
   ┌──────────────┐                          ┌──────────────────────────────┐
   │    Client    │ ◀─────── HTTP ─────────▶ │          API server          │
   │ React Query  │ ◀╌╌╌╌╌╌╌╌ SSE ╌╌╌╌╌╌╌╌╌╌ │         OpenAPI spec         │
   └──────────────┘                          └──────────────────────────────┘
          ▲                                      ▲                    ▲
          ╎ WS · Yjs updates                 SQL │                    ╎ WS · changes
          ▼                                      ▼                    ╎
   ┌──────────────┐           ┌────────────────────────┐            ┌─┴────────────────┐
   │  Yjs worker  │    SQL    │        Postgres        │    WAL     │    CDC worker    │
   │  (optional)  │ ◀────────▶│       (managed)        │╌╌╌╌╌╌╌╌╌╌╌▶│                  │
   │              │           │                        │◀───────────│                  │
   └──────────────┘           └────────────────────────┘ SQL · seq  └──────────────────┘

   ── request/response    ╌╌ stream (WAL · WS · SSE)
```

### Target product

- Frequent-use or heavy-use web applications focused on user-generated content
- A strong experience across devices, without prioritizing native apps
- Full-stack development as a way to work effectively across the product

### Philosophy

- Postgres, OpenAPI, and TanStack Query are the core libraries. Cella is a template around them.
- Avoid unnecessary abstraction layers; use composable functions and let the libraries do the work.
- Deliberately narrow: Cella uses Drizzle ORM and does not try to make the ORM replaceable.
- Modular: forks should be able to keep only the modules they need.
- Use open standards and be interoperable from the start.
- Focus on client-side rendering (CSR), with room for static generation.
- EU data sovereignty: deploy on European-owned cloud infrastructure.

### Stack

Investing in a narrow all-TypeScript stack using open standards and well-positioned libraries has been fundamental. We always try to let the libraries be the abstraction layer, not Cella itself.

| Backend    | Frontend    | Build    | Deploy    |
|------------|-------------|----------|-----------|
| [nodejs](https://nodejs.org) | [react](https://reactjs.org) | [pnpm](https://pnpm.io) | [pulumi](https://www.pulumi.com) |
| [hono](https://hono.dev) | [tanstack-router](https://github.com/tanstack/router) | [vite](https://vitejs.dev) | [scaleway](https://www.scaleway.com) |
| [postgres](https://www.postgresql.org) | [tanstack-query](https://github.com/tanstack/query) | [vite-pwa](https://github.com/antfu/vite-plugin-pwa) | [github-actions](https://github.com/features/actions) |
| [drizzle-orm](https://orm.drizzle.team/) | [zustand](https://github.com/pmndrs/zustand) | [storybook](https://storybook.js.org) |  |
| [zod](https://github.com/colinhacks/zod) | [dexie](https://github.com/dexie/Dexie.js) | [biome](https://biomejs.dev) |  |
| [openapi](https://www.openapis.org) | [base-ui](https://base-ui.com/) | [lefthook](https://github.com/evilmartians/lefthook) |  |
| [yjs](https://yjs.dev) | [lucide-icons](https://lucide.dev) | [artillery](https://artillery.io) |  |


## Data modeling

Tables can be split into `entity`, `resource`, and other tables. Entities are split into categories:

- `ChannelEntityType`: has memberships (`organization`)
- `ProductEntityType`: content-related and inherits access from channel membership (`attachment`)
- `EntityType`: the union of `user`, channel entities, and product entities

The template config has one channel entity, `organization`, and one product entity, `attachment`, whose parent is `organization`. Forks commonly add deeper channels and products; examples in comments use `project`, `task`, and `label`, but those are not part of the default hierarchy.

Both frontend and backend have business logic split in modules. Most of them are in both backend and frontend, such as `authentication`, `user` and `organization`. The benefit of modularity is twofold: better code (readability, portability etc) and to pull upstream cella changes with less friction.

### Entity hierarchy builder

The entity taxonomy is defined using `createEntityHierarchy()`. Forks customize their entity setup in `shared/config/hierarchy-config.ts`.

```
createEntityHierarchy(roles).user().channel('organization', ...).product('attachment', ...).build()
```

The builder validates that parents exist before children, products have a channel, channel/entity roles are valid, and optional `relatedChannels`/`nullableAncestors` are structurally valid. Public readability is declared and validated separately by `configurePermissions()` in `shared/config/permissions-config.ts`. The resulting frozen `EntityHierarchy` drives schema helpers, permission traversal, count attribution, id-path materialization, menu construction, and stream dispatch.

Key methods: `getParent()`, `getOrderedAncestors()`, `getRelatedChannels()`, `getNullableAncestors()`, `getChildren()`, and `getOrderedDescendants()`.

## Sync engine

Cella has a selective approach to sync and offline. Channel entities such as organizations use standard CRUD OpenAPI endpoints. Product entities such as attachments add `stx`, sequence/view-based catchup, offline mutation plumbing, and a notify-then-fetch realtime path. TanStack Query is the client-side merge point for both channel and product entities as well as other resources.

The pipeline flows: **Postgres WAL → CDC worker → WebSocket → ActivityBus → SSE → client**. There is one realtime endpoint:

- **App stream** (`/entities/app/stream`): authenticated, carries permitted product-entity notifications and membership changes. Product and membership payloads share `event: change` and are distinguished by `kind: 'entity' | 'membership'`. One leader tab holds SSE; followers receive notifications through BroadcastChannel.

All product types share one org-wide sequence: the CDC worker stamps product creates and updates (including soft deletes and restores) in WAL commit order and rolls up frontier/count summaries to the org and every non-null ancestor node, so clients sync path-prefix views at any level. See [Sync engine](/docs/page/architecture/sync-engine) for the complete lifecycle, merge semantics, and current implementation limitations.

### Schema evolution (WIP)

Offline and PWA clients don't update in lockstep with deploys, so breaking schema changes to channel and product entities can ship as **append-only lens modules** in `shared/src/schema-evolution/` (global schema version = lens count). See [Schema evolution](/docs/page/architecture/schema-evolution) for the shipping playbook.

## Query layer

TanStack Query is the central frontend server-state layer, in `frontend/src/query/`. Entity modules create standardized keys with `createEntityKeys(entityType)` and register stream-facing keys plus an optional delta fetcher through `registerEntityQueryKeys()`. A separate list-queries config builds channel/menu sync queries. Optimistic updates (`createOptimisticEntity`) and last-mutation-wins invalidation helpers are core patterns.

Product entity queries can use a sync-aware `staleTime` (`syncStaleTime` in `frontend/src/query/basic/sync-stale-config.ts`): Infinity while the app stream is live and 5 minutes while disconnected. The default attachment canonical/list queries opt in. Non-synced queries keep the global 30-second default unless their module overrides it; global `refetchOnMount` is `false` and `refetchOnReconnect` is `true`.

### Canonical vs derived queries

The default attachment module has one **canonical query** per organization: a flat list the sync layer patches in place. Components derive narrower views with `select()` (for example, attachments by group). Server-filtered lists use distinct, non-persisted keys and are not the canonical sync target. Fork-added product modules should follow the same one-canonical-query-per-effective-scope convention and register their delta fetcher explicitly.

### Client storage (`appdb`)

Most durable signed-in client state lives in **one IndexedDB database per user**, named `${appConfig.slug}:${userId}` and managed by `frontend/src/query/app-db.ts`. It unifies persisted Zustand app state, the React Query cache, attachment blobs, and the failed-sync quarantine. Putting the user id in the database name means nothing inside needs its own per-user scoping, cross-user isolation is structural, and there is a single boundary to encrypt later.

The database is tied to the signed-in user: it opens on sign-in, closes on sign-out, and swaps when switching accounts. Among signed-in app stores, `ui-store` and `user-store` stay in plain localStorage because they bootstrap who the user is and must be readable before the database opens. Public docs-search history and the development React Scan preference are separate browser-local exceptions.

### Cache persistence

The React Query cache is persisted into `appdb` via Dexie with two modes controlled by the `offlineAccess` toggle:

- **Offline mode** (`offlineAccess=true`): scope `rq`, survives browser restart and eagerly fills read caches for all orgs. It does not by itself make failed writes durable.
- **Session mode** (`offlineAccess=false`): per-tab scope `s-<uuid>`, survives refresh but cleaned up on tab close (orphans swept on next startup). Sync service only resolves staleness for the current org.

While signed out the persister simply does nothing and the cache stays in memory, so the provider can stay mounted at the app root and persistence follows the user automatically. Within each mode the persister uses a **hybrid storage layout**: product entity queries are stored as individual records in the `queries` table for incremental diffing (only changed queries are written), while channel queries are bundled into the `meta` record, since they are few, small, and all needed at startup.

On app routes, only the leader tab's paused mutations pass `shouldDehydrateMutation`; all tabs can still persist query changes. In the shared offline `rq` scope, channel queries and mutations occupy the same meta record, so a follower query write can still replace the leader's dehydrated mutation array. Leader-only dehydration therefore reduces duplication but is not a complete cross-tab single-writer guarantee. Since `mutationFn` cannot be serialized, entity modules register replay defaults through `addMutationRegistrar()` before restoration; serialized variables must include every ID the default needs after reload.

The meta record also carries a `schemaVersion` ordinal (see [Schema evolution](/docs/page/architecture/schema-evolution)): when it's behind the running bundle, a chunked boot-migration pass rewrites cached rows and queued mutations in place before hydration; when it's ahead (another tab migrated forward, or a rollback), the bundle marks itself stale and stops persisting rather than downgrade the store.

### Enrichment pipeline

A QueryCache subscriber in `frontend/src/query/enrichment/` auto-enriches channel entity list data whenever cache entries change. Three enrichers run in sequence on each item:

1. **Membership**: attaches the user's cached membership to the entity.
2. **Permissions**: computes a `can` map (action → `true | false | 'own'`, keyed by entity type + descendants) from the membership role and `accessPolicies`. The `'own'` value indicates the action is allowed only for entities created by the current user (implicit owner relation). Use `resolvePermission(permission, entity.createdBy?.id, userId)` to resolve per-entity. System admins get full permissions.
3. **Ancestor slugs**: walks the entity hierarchy to build URL-friendly slug paths from cached data.

This is how `item.membership`, `item.can`, and `item.ancestorSlugs` are populated on channel entities without extra API calls.

## Authentication

Cella supports four configurable auth-strategy families; the default config enables all four and enables GitHub as its sole OAuth provider:

| Strategy       | Description | Key details |
|----------------|-------------|-------------|
| Magic Link | Email magic link | Single-use tokenized link sent via email |
| Passkey | WebAuthn | Credentials stored in `passkeys` table |
| OAuth | GitHub by default; Google and Microsoft supported | Uses `arctic`; Google and Microsoft use PKCE |
| TOTP | Time-based one-time password | MFA verification option; the UI enables MFA only after both a passkey and TOTP are configured |

Cookie-based sessions (hashed, typed as `regular`/`impersonation`/`mfa`) with single-use tokens for verification and invitation flows. Auth endpoints are rate-limited with parallel brute-force protection. Sysadmin impersonation is supported with IP allowlist enforcement.

## Multi-tenancy

A `tenant` is not an entity, but just a `resource` that acts as top-level isolation unit.

Tenant-scoped routes use `/:tenantId/` in the path. Organization-scoped product routes use the `authGuard` → `tenantGuard` → `orgGuard` chain; the guards load the authorized context and initially set `ctx.var.db` to `baseDb`. Product entity handlers then wrap their DB operations in `tenantRead()` (read-only) or `tenantContext()` (read-write) to get an RLS-scoped transaction. Channel entity handlers use `baseDb` directly (no RLS), with the guard set appropriate to their route. See AGENTS.md for the full guard matrix.

## Permissions

Cella tries to apply a defense-in-depth strategy. The permission manager and guard chain are the primary authorization mechanisms; tenant RLS, composite FKs, and immutability triggers are safety nets that catch application bugs.

| Layer | What it catches | Key files |
|-------|----------------|-----------|
| Guard chain (orgGuard) | Cross-org access within a tenant | `backend/src/middlewares/guard/` |
| Permission Manager | Unauthorized actions (role/membership checks) | `backend/src/permissions/` (engine in `shared/src/permissions/`) |
| Row-Level Security | Cross-tenant reads from tenant-scoped product/support tables | `backend/src/db/rls-helpers.ts`, `backend/src/db/tenant-context.ts` |
| Composite Foreign Keys | Franken-rows (mismatched tenant/org references) | Module `*-db.ts` files, registered in `backend/src/tables.ts` |

The permission decision engine (`checkPermission` / `getAllDecisions`) lives in `shared/src/permissions/` so it is computed by exactly one implementation across tiers: backend handlers and the standalone Yjs relay both authorize against the same engine, with no backend round-trip from the relay.

### Boundaries

RLS session variables (`app.tenant_id`, `app.user_id`, `app.include_deleted`) are set per transaction by the helpers in `backend/src/db/tenant-context.ts`. `tenant_id` is the hard DB-enforced SELECT boundary for product tables and tenant-scoped support tables such as `yjs_documents`.

**Channel entities** (organizations in the template) and **memberships** do not use RLS. Access control for these tables is enforced at the application layer by the relevant guard/permission path.

Organization isolation is enforced at the **application layer** by the guard/permission path, not at the RLS level. This avoids expensive `EXISTS` membership subqueries on every row access. On organization-scoped product routes, `orgGuard` validates membership before the handler runs. Cross-org API tests in `backend/tests/security/cross-org.test.ts` verify this boundary.

Tenant SELECT policies are fail-closed: missing or empty `app.tenant_id` returns zero rows.

### RLS read/write split

Product entity handlers use helpers from `backend/src/db/tenant-context.ts`:

- **`tenantRead(ctx, fn)`**: opens a read-only transaction with RLS session variables set. `tenantReadIncludingDeleted()` additionally sets `app.include_deleted=true` for delta/tombstone reads.
- **`tenantContext(ctx, fn)`**: opens a read-write transaction and sets the same variables, so SELECT policies pass for reads/`RETURNING` inside the write. Because tables use `FORCE ROW LEVEL SECURITY`, the schema installs unconditional write-through policies; write isolation is enforced by guards, permissions, composite FKs, and immutability triggers rather than restrictive RLS write predicates. `tenantContextIncludingDeleted()` can see tombstones.

The `tenantRead` callback receives a `readCtx` with `{ var: { ...ctx.var, db: tx } }` so query functions can use the RLS-scoped transaction.

### RLS policy categories

| Category | SELECT | Write | Builder | Use case |
|----------|--------|-------|---------|----------|
| Tenant-scoped | Fail-closed tenant match; tombstones hidden unless requested | Unconditional write-through policy; app-layer authorization | `tenantSelectPolicy()`, `writeThroughPolicies()` | `attachments`, `yjs_documents`; fork-added tenant-scoped products |
| No RLS | - | - | - | Channel entities, memberships, and ordinary resources |

### Database roles

| Role | RLS | Purpose |
|------|-----|---------|
| `runtime_role` | Enforced | All app requests via Hono handlers |
| `admin_role` | `BYPASSRLS` | Migrations, seeds, system jobs, CDC worker (needs `REPLICATION`) |

### Immutability triggers

Identity columns (`tenant_id`, `organization_id`, `user_id` on memberships, etc.) are protected by BEFORE UPDATE triggers that reject changes after creation. Activities are fully append-only. See `backend/src/db/immutability-triggers.ts`.

### Permission manager

`getAllDecisions()` resolves permissions by walking the entity hierarchy (most-specific channel → root), matching memberships against policies defined with `configurePermissions()` in `shared/config/permissions-config.ts`. Policies support `1` (allowed), `0` (denied), and `'own'` (allowed only when `entity.createdBy === userId`). Grant attribution records membership, relation, public, or system-admin sources. System admins bypass ordinary checks.

See [Permissions](/docs/page/architecture/permissions) for the full permission model, including row conditions, public read grants, the per-tier enforcement paths, and their constraints.

### Fork contract

> Every product has a channel. Tenant-scoped tables carry `tenant_id`; rows with an organization ancestor also carry `organization_id` and use composite FKs to keep IDs in the same tenant. A product's root channel must remain non-null even when nearer ancestors are configured nullable. The hierarchy and DB schema must be changed together.


## Observability

Observability spans backend, CDC, optional Yjs, and frontend code, with [Maple.dev](https://maple.dev) as the default telemetry backend. Node services share `createOtelSDK()` for traces, metrics, and logs, gated by `MAPLE_SECRET_INGEST_KEY`; Pino can fan logs out through `pino-opentelemetry-transport`. In the browser, the Maple SDK owns production tracing/error/replay when `appConfig.maplePublicIngestKey` is enabled. A local `WebTracerProvider` keeps tracing helpers active when Maple is disabled or in ordinary development.

See [Observability](/docs/page/architecture/observability) for the full observability architecture, including per-service setup, health endpoints, and graceful shutdown.


## API design

The API uses [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) to build an OpenAPI 3.1 specification. The `sdk` workspace runs [`@hey-api/openapi-ts`](https://github.com/hey-api/openapi-ts) to generate the typed client, Zod schemas, and API types consumed by the frontend.

### OpenAPI extensions & doc generation

The OpenAPI spec is enriched with custom `x-*` specification extensions that describe guards, rate limiters, and caches per operation. Middleware wrapped with `xMiddleware` carries typed metadata; `createXRoute` (used instead of `createRoute`) automatically collects this metadata into `x-guard`, `x-rate-limiter`, and `x-cache` spec extensions. New extension types are added via a central registry.

At startup the backend builds the full spec (including `info.x-extensions`), validates/normalizes it, serves `/openapi.json`, and atomically updates `backend/openapi.cache.json` when content changes. During `pnpm sdk`, the SDK's `openapi-parser` plugin writes doc summaries, and Vite copies those generated assets to `/static/docs.gen/` for the frontend docs UI.


### Mocks

Mock generators live beside the backend source in `backend/src/mocks/` (plus module-specific mock files) and serve three purposes:

- **OpenAPI examples**: deterministic, seeded response mocks provide `example:` values on Zod schemas and route responses.
- **Database seeding**: insert mocks return Drizzle `Insert*Model` types; generators use `UniqueEnforcer` where seeded values must be unique.
- **Tests and load tests**: reusable mock data generators.


## Testing

See [Testing](/docs/page/guides/testing) for test modes, infrastructure, and writing guidelines.


## File structure

Cella is a flat-root monorepo.

```
.
├── backend
│   ├── drizzle               DB migrations
│   ├── emails                Email templates
│   ├── scripts               Seed scripts and other dev scripts
├── bench                     Artillery load testing
├── cdc                       Change Data Capture worker (WAL → activities/seq → API WS)
├── frontend                  Vite + React SPA/PWA
├── infra                     Pulumi IaC (Scaleway) deployment with CLI
├── cella                     Documentation, changelog, migration plans
├── json                      Static JSON data
├── locales                   Translations
├── mcp                       Optional Model Context Protocol service entrypoint
├── sdk                       Auto-generated SDK (types, zod schemas, fetch client)
├── shared                    Shared config, types & utils
├── studio                    Drizzle Studio launcher for local DB inspection
└── yjs                       Yjs collaborative editing worker (ws binary relay)
```
