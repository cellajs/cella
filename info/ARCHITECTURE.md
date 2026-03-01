# Architecture
This document describes the high-level architecture of Cella.

### Target product
* frequent-use or heavy use web applications
* focused on user-generated content that requires authentication/authorization
* Requires a great UX on different devices, bur native apps are not a direct priority
* Development budget and time is limited
* Fullstack development is seen as beneficial to work effectively

### DX aspects
 * Type safe, without overdoing it. 
 * Prevent abstraction layers, use composable functions.
 * A narrow stack: Cella uses Drizzle ORM and will not make it replaceable with another ORM.
 * Focus on proven Postgres, OpenAPI & React Query patterns. Three foundational layers.
 * Modularity: As Cella grows, be able to scaffold only modules that you need.
 * Open standards: long-term vision is that each Cella can speak with other cell(a)s.
 * Focused on client-side rendering (CSR) and in future static site generation (SSG).

### Backend
- [nodejs](https://nodejs.org)
- [hono](https://hono.dev)
- [postgres](https://www.postgresql.org)
- [drizzle-orm](https://orm.drizzle.team/)
- [zod](https://github.com/colinhacks/zod)
- [openapi](https://www.openapis.org)
- [jsx-email](https://jsx.email/)

### Frontend
- [react](https://reactjs.org)
- [tanstack-router](https://github.com/tanstack/router)
- [tanstack-query](https://github.com/tanstack/query)
- [zustand](https://github.com/pmndrs/zustand)
- [dexie](https://github.com/dexie/Dexie.js)
- [shadcn](https://ui.shadcn.com)
- [i18next](https://www.i18next.com)
- [lucide-icons](https://lucide.dev)

### Build tools
- [pnpm](https://pnpm.io)
- [vite](https://vitejs.dev)
- [vite-pwa](https://github.com/antfu/vite-plugin-pwa)
- [storybook](https://storybook.js.org)
- [biome](https://biomejs.dev)
- [lefthook](https://github.com/evilmartians/lefthook)
- [pglite](https://pglite.dev/)


## File structure
Cella is a flat-root monorepo.

```
.
├── backend
│   ├── .db                   Location of db when using pglite
│   ├── drizzle               DB migrations
│   ├── emails                Email templates with jsx-email
│   ├── scripts               Seed scripts and other dev scripts
│   ├── src
│   │   ├── db                Connect, table schemas
│   │   ├── lib               3rd party libs & important helpers
│   │   ├── middlewares       Hono middlewares
│   │   ├── modules           Modular distribution of routes, schemas etc
│   │   ├── permissions       Permission/authorization layer
│   │   ├── schemas           Shared Zod schemas
│   │   ├── sync              Sync engine utilities
│   │   └── utils             Reusable functions
├── cdc                       Change Data Capture worker (WAL → activities → SSE)
├── frontend
│   ├── public
│   ├── src
│   │   ├── api.gen           Generated SDK client from openapi.json
│   │   ├── hooks             Generic react hooks
│   │   ├── lib               Library code and core helper functions
│   │   ├── modules           Modular distribution of components
│   │   ├── query             Query client with offline/realtime logic
│   │   ├── routes            Code-based routes
│   │   ├── store             Zustand data stores
│   │   ├── styling           Tailwind styling
│   │   └── utils             Reusable functions
│   └── vite                  Vite-related plugins & scripts
├── infra                     Terraform IaC (Scaleway)
├── info                      Documentation, changelog, migration plans
├── locales                   Translations
└── shared                    Shared config, types and utils
```

## Data modeling & modularity

Tables can be split in `entity`,  `resource` and _other_ tables (see `backend/src/db/schema/`). Entities are split in categories:
* `ContextEntityType`: Has memberships (`organization`)
* `ProductEntityType`: Content related, no membership (`attachment`, `page`)
* All entities, including `user`: (`user`, `organization`, `attachment`, `page`)

The cella setup itself has a single context entity : `organization`. It has two product entities: `attachment` - with parent `organization` - and a public product entity, `page`. But in a typical app you would likely have more context entities such as a 'bookclub' and more product entities such as 'book' and 'review'.

Both frontend and backend have business logic split in modules. Most of them are in both backend and frontend, such as `authentication`, `user` and `organization`. The benefit of modularity is twofold: better code (readability, portability etc) and to pull upstream cella changes with less friction.

### Entity hierarchy builder

The entity taxonomy is defined using `createEntityHierarchy()` (in `shared/src/builder/`). Forks customize their entity setup in `shared/hierarchy-config.ts`.

```
createEntityHierarchy(roles).user().context('organization', ...).product('attachment', ...).build()
```

The builder validates at construction time that parents exist before children and that public-access inheritance is consistent. The resulting frozen `EntityHierarchy` object is the central configuration artifact — it drives RLS policy selection, permission checks, menu structure, count tracking, and SSE dispatcher routing.

Key methods: `getOrderedAncestors()`, `getChildren()`, `getOrderedDescendants()`, `canBePublic()`.

## Hybrid sync engine

Cella has a hybrid approach to sync and offline. Context entities (e.g. organizations) use standard CRUD OpenAPI endpoints — they have read-only offline access via prefetched menu data. Product entities (e.g. attachments, pages) can be upgraded with a full sync layer using a 'notify-then-fetch' pattern. All data is consistently collected by the react-query queryClient.

The pipeline flows: **Postgres WAL → CDC Worker → WebSocket → ActivityBus → SSE → Client**. There are two independent SSE streams:
- **App stream** (`/app/stream`): authenticated, carries membership events, org events, and product entity notifications. Uses leader-tab pattern (Web Locks API) — one tab holds the SSE connection, followers sync via BroadcastChannel.
- **Public stream** (`/public/stream`): unauthenticated, carries events for public product entities (e.g. pages). Each tab maintains its own connection (no leader election). On connect, catches up on deletes, then switches to live-only SSE.

Offline mutations are queued with stx metadata and squashed per entity until connectivity returns.

For full details on CDC, the realtime pipeline, stx transactions, offline mutations, and context counters, see [SYNC_ENGINE.md](./SYNC_ENGINE.md).

## Query layer

React Query (TanStack Query) is the central data layer on the frontend (`frontend/src/query/`). Each entity module creates standardized query keys via `createEntityKeys(entityType)` and registers them in a central `entityQueryRegistry`, enabling dynamic lookup by stream handlers, cache ops, and invalidation helpers. Optimistic updates (`useMutateQueryData`, `createOptimisticEntity`) and last-mutation-wins invalidation helpers are core patterns.

### Cache persistence

The React Query cache is persisted to IndexedDB via Dexie with two modes:
- **Offline mode** (`offlineAccess=true`): shared key, survives browser restart for full offline capability.
- **Session mode** (`offlineAccess=false`): per-tab session key, survives refresh but cleaned up on tab close. Orphaned sessions are garbage-collected on next startup.

Only the leader tab (elected via Web Locks API) persists mutations to prevent cross-tab conflicts. Since `mutationFn` cannot be serialized, entity modules register their defaults via `addMutationRegistrar()` at load time so paused mutations can resume after page reload.

### Enrichment pipeline

A QueryCache subscriber (`frontend/src/query/enrichment/`) auto-enriches context entity list data whenever cache entries change. Three enrichers run in sequence on each item:
1. **Membership**: attaches the user's cached membership to the entity.
2. **Permissions**: computes a `can` map (action → boolean, keyed by entity type + descendants) from the membership role and `accessPolicies`. System admins get full permissions.
3. **Ancestor slugs**: walks the entity hierarchy to build URL-friendly slug paths from cached data.

This is how `item.membership`, `item.can`, and `item.ancestorSlugs` are populated on context entities without extra API calls.

## Authentication

Cella supports four auth strategies (configurable per fork via `appConfig.authStrategies`):

| Strategy | Description | Key details |
|----------|-------------|-------------|
| Password | Email + password | Argon2id hashing via `ARGON_SECRET` |
| Passkey | FIDO2/WebAuthn | Credentials stored in `passkeys` table |
| OAuth | GitHub, Google, Microsoft | Uses `arctic` library. Google + Microsoft use PKCE. |
| TOTP | Time-based one-time password | MFA fallback, only usable after passkey primary auth |

Cookie-based sessions (hashed, typed as `regular`/`impersonation`/`mfa`) with single-use tokens for verification, password reset, and invitation flows. Auth endpoints are rate-limited with parallel brute-force protection. Sysadmin impersonation is supported with IP allowlist enforcement.

## Multi-tenancy

A `tenant` is the top-level isolation unit. Tenants are not entities — they are system resources managed by system admins only.

Tenant-scoped routes use `/:tenantId/` in the path. Guards (`authGuard` → `tenantGuard` → `orgGuard`) validate membership and wrap each request in a transaction with RLS session variables set. Session variables are transaction-scoped to prevent connection pool leakage. See AGENTS.md for the full guard chain.

## Security & tenant isolation

Cella uses three defense-in-depth layers. The permission manager is the primary authorization mechanism; RLS, composite FKs, and immutability triggers are safety nets that catch application bugs.

| Layer | What it catches | Key files |
|-------|----------------|-----------|
| Permission Manager | Unauthorized actions (role/membership checks) | `backend/src/permissions/` |
| Row-Level Security | Cross-tenant and cross-org data leaks | `backend/src/db/rls-helpers.ts`, `backend/src/db/schema/` |
| Composite Foreign Keys | Franken-rows (mismatched tenant/org references) | `backend/src/db/schema/` |

### Boundaries

RLS session variables (`app.tenant_id`, `app.user_id`, `app.is_authenticated`) are set per transaction by the guard chain. `tenant_id` is a **hard** column-match boundary — every tenant-scoped table's RLS policy compares the row's `tenant_id` directly against the session variable.

Organization isolation works differently: there is no `app.organization_id` session variable. Instead, org-scoped policies (`orgScopedCrudPolicies`, `orgOwnedCrudPolicies`) use a `membershipExists()` subquery — the user can only access rows in organizations where they have an active membership. Public/tenant-only entities (e.g. pages) have no org boundary since they lack `organization_id`.

In forks with nested context entities (e.g. projects within an org), isolation between sibling contexts is application-layer only — RLS checks membership at the organization level, not at the nested entity level. All policies are fail-closed: missing or empty session context returns zero rows.

### RLS policy categories

| Category | SELECT | Write | Builder | Use case |
|----------|--------|-------|---------|----------|
| Standard | tenant + org | tenant + org | `orgScopedCrudPolicies()` | Org-scoped product entities (attachments) |
| Org-owned | tenant + org OR createdBy | tenant + auth | `orgOwnedCrudPolicies()` | Context entities (projects, workspaces) — SELECT includes `createdBy` match so RETURNING works after INSERT before membership exists |
| Hybrid | public OR tenant+org | tenant + auth | `publicAccessCrudPolicies()` | Entities with `public_access` column (pages) |
| Cross-tenant | authenticated | tenant | Custom | Authenticated users can read all memberships; writes are tenant-scoped (memberships) |
| Privilege-based | role | role | Custom | Append-only / system-only (activities) |

### Database roles

| Role | RLS | Purpose |
|------|-----|---------|
| `runtime_role` | Enforced | All app requests via Hono handlers |
| `cdc_role` | No RLS | CDC worker — append-only, minimal privileges |
| `admin_role` | `BYPASSRLS` | Migrations, seeds, system jobs |

### Immutability triggers

Identity columns (`tenant_id`, `organization_id`, `user_id` on memberships, etc.) are protected by BEFORE UPDATE triggers that reject changes after creation. Activities are fully append-only. See `backend/src/db/immutability-triggers.ts`.

### Permission manager

`getAllDecisions()` resolves permissions by walking the entity hierarchy (most-specific context → root), matching memberships against access policies defined in `configureAccessPolicies()` (`shared/permissions-config.ts`). System admins bypass all checks. See AGENTS.md for the full list of permission helpers.

### Fork contract

> Every tenant-scoped table must have `tenant_id`. Tables with an organization parent must also have `organization_id` with a composite FK to `organizations(tenant_id, id)`. Parentless product entities require `tenant_id` only. The entity hierarchy config (`shared/hierarchy-config.ts`) determines which pattern applies.

## API design

The API runs through [zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) to build an OpenAPI 3.1 specification. Please read the readme in this middleware before you get started. An api client is generated in the frontend using [openapi-ts](https://github.com/hey-api/openapi-ts), which produces zod schemas, types, and an sdk for the frontend.

### OpenAPI extensions & doc generation

The OpenAPI spec is enriched with custom `x-*` specification extensions that describe guards, rate limiters, and caches per operation. Middleware wrapped with `xMiddleware` carries typed metadata; `createXRoute` (used instead of `createRoute`) automatically collects this metadata into `x-guard`, `x-rate-limiter`, and `x-cache` spec extensions. New extension types are added via a central registry.

At startup the backend builds the full spec (including an `info.x-extensions` block with all definitions and values), writes a cached `openapi.cache.json`. A custom Vite plugin pre-parses the spec into static JSON at build time; the frontend docs UI dynamically generates table columns from the extension definitions — no hardcoding of extension names.

### Mocks

Mock generators in `backend/mocks/` are a single source of truth serving three purposes:

| Purpose | Mock type | ID context |
|---------|-----------|------------|
| OpenAPI examples | Response mocks (deterministic via seeded faker) | `'example'` — no prefix |
| Database seeding | Insert mocks | `'script'` — `gen-` prefix |
| Test fixtures | Insert mocks | `'test'` — `test-` prefix |

Response mocks are passed as `example:` values to `.openapi()` on Zod schemas and route responses — the sole source of OpenAPI examples. Insert mocks return Drizzle `Insert*Model` types with `UniqueEnforcer` for uniqueness. The context-aware ID prefix system lets CDC workers and test cleanup distinguish generated data.


## Testing

See [info/TESTING.md](./TESTING.md) for test modes, infrastructure, and writing guidelines.


