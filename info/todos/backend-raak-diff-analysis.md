# Backend diff analysis: main vs contrib/raak

> Generated 2026-02-10. Covers `backend/` changes between `main` and `contrib/raak`.

## Summary

**~375 files changed** across the backend. The raak fork introduces a fundamentally different architecture centered on **multi-tenancy with Row-Level Security (RLS)**, a **real-time sync engine via CDC WebSocket**, and significant **structural refactoring** of modules, error handling, guards, and schemas. Many changes are intertwined — the tenant model touches nearly every schema, handler, guard, and mock.

---

## 1. Multi-tenancy & RLS infrastructure (NEW)

### New files

| File | Purpose |
|------|---------|
| `src/db/schema/tenants.ts` | Tenants table — top-level isolation boundary |
| `src/db/tenant-context.ts` | `setTenantRlsContext`, `setUserRlsContext`, `setPublicRlsContext` — wraps queries in RLS-scoped transactions |
| `src/db/rls-helpers.ts` | SQL helpers: `tenantMatch()`, `isAuthenticated`, `membershipExists()`, `userMatch()` for pgPolicy definitions |
| `src/db/immutability-triggers.ts` | Prevents modification of identity columns (`id`, `tenant_id`, `organization_id`) via SQL triggers |
| `src/middlewares/guard/tenant-guard.ts` | Extracts `tenantId` from URL, validates access, wraps handler in RLS transaction |
| `src/middlewares/guard/cross-tenant-guard.ts` | User RLS context for cross-tenant membership queries (e.g., `/me`) |
| `src/middlewares/guard/public-guard.ts` | Public RLS context for unauthenticated routes |
| `scripts/db/create-db-roles.ts` | Creates PostgreSQL roles (`runtime_role`, `cdc_role`) for RLS enforcement |
| `scripts/migrations/rls-migration.ts` | Generates RLS setup migration |
| `scripts/migrations/immutability-migration.ts` | Generates immutability trigger migration |
| `scripts/migrations/partman-migration.ts` | pg_partman setup for session/token/activity partitioning |
| `tests/integration/rls-security.test.ts` | RLS regression tests |

### Schema changes for tenancy

Every tenant-scoped table now has:
- `tenantId` column referencing `tenantsTable`
- Composite foreign keys: `(tenantId, organizationId)` → `(organizations.tenantId, organizations.id)`
- Composite unique constraints replacing `uniqueKey` varchar (memberships, inactive_memberships)
- `pgPolicy()` definitions inline in Drizzle schema
- Indexes on `tenant_id`

**Affected schemas**: `memberships`, `inactive-memberships`, `organizations`, `attachments`, `pages`, `activities`, `sessions`, `tokens`

### Category assessment

| Aspect | Category |
|--------|----------|
| Tenant table + RLS infrastructure | **Needs cella adaptation** — Multi-tenancy is a real architecture need for production apps. Cella should adopt the pattern but may want a simpler default (single-tenant out-of-the-box, opt-in multi-tenant). |
| `pgPolicy()` in schemas | **Needs cella adaptation** — RLS policies are deeply coupled to the tenant model. Cella needs to decide if RLS is core or opt-in. |
| Immutability triggers | **Template improvement** — Defense-in-depth for identity columns is universally good. |
| `tenant-context.ts` transaction wrapping | **Template improvement** — Clean pattern for RLS-scoped transactions regardless of whether tenancy is used. |
| `create-db-roles.ts` | **Needs cella adaptation** — PostgreSQL role creation is good but needs to work with PGlite dev mode. |
| Partitioning (pg_partman) | **Fork-specific** — Valuable for scale but adds complexity. Consider as opt-in feature. |

---

## 2. Sync engine (NEW — replaces event-bus + Electric)

### New `src/sync/` directory (entirely new)

| File | Purpose |
|------|---------|
| `activity-bus.ts` | Strongly-typed `ActivityBus` (replaces `event-bus.ts`). EventEmitter with typed events like `membership.created` |
| `cdc-websocket.ts` | WebSocket server that CDC Worker connects to (replaces pg LISTEN/NOTIFY) |
| `cache-invalidation.ts` | Registers ActivityBus handlers to invalidate entity cache on changes |
| `create-server-stx.ts` | Server-side sync transaction (stx) creation |
| `field-versions.ts` | Per-field version tracking for conflict resolution |
| `idempotency.ts` | Idempotency check for CDC messages |
| `request-coalescing.ts` | Deduplicates concurrent identical requests |
| `sync-metrics.ts` | OTel metrics for CDC messages, SSE notifications, active connections |
| `stream/` | SSE streaming infrastructure: `subscriber-manager.ts`, `dispatcher.ts`, `build-message.ts`, `send-to-subscriber.ts` |

### Deleted files

| File | Reason |
|------|--------|
| `src/lib/event-bus.ts` | Replaced by `sync/activity-bus.ts` |
| `src/lib/sse.ts` | Replaced by `sync/stream/` module |
| `src/utils/electric-utils.ts` | Electric sync removed entirely |

### Category assessment

| Aspect | Category |
|--------|----------|
| ActivityBus replacing EventBus | **Template improvement** — Better typed, cleaner API, same EventEmitter pattern |
| CDC WebSocket (replacing LISTEN/NOTIFY) | **Needs cella adaptation** — WebSocket is more reliable than LISTEN/NOTIFY but adds complexity. Cella should support both. |
| SSE stream infrastructure | **Template improvement** — Well-structured with subscriber manager, dispatcher, multi-channel routing |
| Request coalescing | **Template improvement** — Universal performance optimization |
| Field versions / stx | **Fork-specific** — Sync transaction metadata is specific to raak's offline-first needs |
| Electric removal | **Fork-specific** — Cella may still want Electric as an option |

---

## 3. Database connection refactoring

### `src/db/db.ts` — major rewrite

**Key changes**:
- `db` → `unsafeInternalDb` (explicit naming indicates bypasses RLS)
- New `migrationDb` and `unsafeInternalAdminDb` using `DATABASE_ADMIN_URL`
- Schema passed to drizzle config: `drizzle({ schema, ...dbConfig })` — enables relational queries
- Proper type exports: `PgDB`, `LiteDB`, `DB`, `Tx`, `DbOrTx`
- `DEV_MODE` adds `'none'` option (for openapi generation without DB)
- `dbConfig` uses `satisfies DrizzleConfig<DBSchema>` instead of type annotation

### Category assessment

| Aspect | Category |
|--------|----------|
| `unsafeInternalDb` naming | **Template improvement** — Makes RLS bypass explicit |
| Schema-typed drizzle | **Template improvement** — Enables `.query.` relational API |
| Separate `migrationDb` / `adminDb` | **Needs cella adaptation** — Good for prod but needs to not break PGlite dev mode |
| `DEV_MODE: 'none'` | **Template improvement** — Useful for CI/generation steps |
| `DbOrTx` / `Tx` types | **Template improvement** — Clean typing for transaction passing |

---

## 4. Guard middleware refactoring

### Renames

| Old | New | Change |
|-----|-----|--------|
| `is-authenticated.ts` | `auth-guard.ts` | Renamed + adds `ctx.set('db')` and `ctx.set('sessionToken')` |
| `has-system-access.ts` | `sys-admin-guard.ts` | Renamed, `isSystemAdmin` inlined as private |
| `is-public-access.ts` | `public-guard.ts` | Now sets up public RLS context |
| `has-org-access.ts` | `org-guard.ts` | Uses `orgId` param (not `orgIdOrSlug`), uses RLS-scoped `db` from context |
| `is-system-admin.ts` | Deleted | Inlined into `sys-admin-guard.ts` |

### New guards

- `tenant-guard.ts` — Tenant scope validation + RLS wrapping
- `cross-tenant-guard.ts` — User-scoped RLS for cross-tenant queries

### Context changes (`lib/context.ts`)

- Removed all `getContext*()` helper functions (no more `hono/context-storage` usage)
- Added `db: DbOrTx`, `tenantId: string`, `sessionToken: string`, `requestId: string` to Env
- `userRole` → `userSystemRole` (type `SystemRoleModel['role'] | null` instead of `| 'user'`)
- Direct `ctx.var.*` access replaces `getContext*()` pattern

### Category assessment

| Aspect | Category |
|--------|----------|
| Guard renaming (consistent `*Guard` naming) | **Template improvement** |
| Removing `getContext*()` helpers | **Template improvement** — Direct `ctx.var.` is clearer, avoids indirection |
| `db` in context | **Template improvement** — Explicit DB access through context |
| `userRole` → `userSystemRole` (null vs 'user') | **Template improvement** — Cleaner semantics |
| `orgIdOrSlug` → `orgId` (no slug lookup in guard) | **Needs cella adaptation** — Slug lookup is useful for UX but adds query. Cella should decide. |
| Tenant/cross-tenant guard | Tied to multi-tenancy (see §1) |

---

## 5. Module structure changes (plural → singular)

### Renamed/restructured modules

| Old (plural) | New (singular) | Notes |
|--------------|----------------|-------|
| `modules/organizations/` | `modules/organization/` | Singular handlers, routes |
| `modules/users/` | `modules/user/` | Singular handlers, routes |
| `modules/pages/` | `modules/page/` | Singular + `publicAccess` field |
| `modules/attachments/` | `modules/attachment/` | Singular + RLS-scoped |

### New modules

| Module | Purpose |
|--------|---------|
| `modules/tenants/` | CRUD for tenants (system admin only) |
| `modules/entities/app-stream/` | SSE stream for authenticated entity updates |
| `modules/entities/public-stream/` | SSE stream for public entity updates |

### Route path changes (`routes.ts`)

- Old: `/:orgIdOrSlug/attachments`, `/:orgIdOrSlug/memberships`
- New: `/:tenantId/:orgId/attachments`, `/:tenantId/:orgId/memberships`, `/:tenantId/:orgId/users`
- Organization and page routes mounted at `/` with full paths in route definitions

### Category assessment

| Aspect | Category |
|--------|----------|
| Singular module naming | **Template improvement** — More consistent with entity naming |
| Tenants module | Tied to multi-tenancy (see §1) |
| App/public stream modules | **Template improvement** — Clean SSE implementation |
| URL path restructuring (`/:tenantId/:orgId/`) | Tied to multi-tenancy |

---

## 6. Error handling refactoring

### `lib/errors.ts` → `lib/error.ts`

- `AppError` constructor: `new AppError({ status, type, ... })` → `new AppError(status, type, severity, opts?)`
- Positional args instead of object — more concise
- `shouldRedirect` → `willRedirect`
- `originalError` → passed via `opts.originalError`, stored in `.stack` and `.cause`
- `handleAppError` → `appErrorHandler` with PostgreSQL error code mapping (`PG_ERROR_MAP`)
- Maps PG codes (23503, 23505, 42501, etc.) to user-friendly errors
- Uses `extractPgError()` to unwrap Drizzle-wrapped PG errors

### Category assessment

| Aspect | Category |
|--------|----------|
| Positional constructor args | **Template improvement** — Less verbose at call sites |
| PG error code mapping | **Template improvement** — Excellent addition for handling DB constraint violations |
| Drizzle error unwrapping | **Template improvement** — Handles Drizzle's error wrapping correctly |
| `willRedirect` rename | **Template improvement** — Clearer naming |

---

## 7. Schema centralization

### Old: `src/utils/schema/`

Deleted files:
- `utils/schema/common.ts`
- `utils/schema/success-responses.ts`
- `utils/schema/session-cookie.ts`
- `utils/schema/types.ts`

### New: `src/schemas/`

New centralized location:
- `schemas/index.ts` — Barrel export of all shared schemas
- `schemas/common-schemas.ts` — Extensive shared schemas (idSchema, slugSchema, entityTypeSchema, etc.)
- `schemas/count-schemas.ts` — Entity/member/related count schemas
- `schemas/success-response-schemas.ts` — Standardized success response schemas
- `schemas/error-response-schemas.ts` — Error response schemas
- `schemas/stream-schemas.ts` — SSE stream event schemas
- `schemas/stx-base-schema.ts` — Sync transaction base schema
- `schemas/sync-transaction-schemas.ts` — Full sync transaction schemas
- `schemas/api-error-schemas.ts` — API error schema (moved from utils)
- `schemas/entity-base.ts` — Base entity schema
- `schemas/user-schema-base.ts` — Base user schema

### Category assessment

| Aspect | Category |
|--------|----------|
| Centralized `schemas/` directory | **Template improvement** — Better organization than scattered `utils/schema/` |
| Count schemas | **Template improvement** — Standardized counting pattern |
| Stream/sync schemas | **Fork-specific** — Tied to raak's sync engine |

---

## 8. Caching infrastructure (NEW)

### New cache utilities

| File | Purpose |
|------|---------|
| `lib/lru-cache.ts` | LRU cache wrapper with prefix invalidation |
| `lib/ttl-cache.ts` | TTL cache wrapper with prefix invalidation |
| `lib/cache-metrics.ts` | OTel metrics for cache hit/miss/invalidation |
| `lib/cache-token-signer.ts` | HMAC signing for cache tokens |
| `middlewares/entity-cache/` | Entity cache middleware (reserve → enrich → serve pattern) |
| `lib/tests/lru-cache.test.ts` | LRU cache tests |
| `lib/tests/ttl-cache.test.ts` | TTL cache tests |

### Category assessment

| Aspect | Category |
|--------|----------|
| LRU/TTL cache utilities | **Template improvement** — Generic, well-tested, useful for any backend |
| Entity cache middleware | **Needs cella adaptation** — Good pattern but tightly coupled to CDC/sync flow |
| Cache metrics | **Template improvement** — Useful for observability |

---

## 9. Schema (database) detail changes

### `sessions` table
- `token` → `secret` (clearer naming)
- Composite primary key `(id, expiresAt)` for pg_partman partitioning
- `SessionModel` split into `UnsafeSessionModel` (with secret) and `SessionModel` (without)
- New `sessions_user_id_idx` index

### `tokens` table
- `token` → `secret` (same as sessions)
- Composite primary key `(id, expiresAt)` for partitioning
- `invokedAt` mode changed from `'date'` to `'string'`
- `TokenModel` → `UnsafeTokenModel` + safe `TokenModel`
- FK to `tokensTable` removed from `emails`, `requests`, `inactive_memberships` (no FK due to partitioning)

### `activities` table
- Added `tenantId`, `stx` (sync transaction), `seq` (sequence), `error` (CDC error tracking)
- Composite PK for partitioning
- Added `generateActivityContextColumns()` for dynamic context entity FK columns
- `resourceTypes` sourced from `appConfig.resourceTypes` instead of local config

### `memberships` table
- `order` → `displayOrder`
- `uniqueKey` replaced by composite `UNIQUE(tenantId, userId, contextType, organizationId, workspaceId, projectId)`
- RLS policies: restrictive guard + own/tenant/insert/update/delete policies

### `organizations` table
- Added `tenantId` with compound unique `(tenantId, id)` for composite FK targets
- RLS policies for select/insert/update/delete

### `pages` table
- Added `publicAccess` boolean field
- RLS policies for public read access + tenant-scoped writes

### Other
- `emails` / `requests` / `inactive-memberships`: FK to `tokens` removed (partitioning)
- `counters` table: New — generic `namespace:scope:key → value` pattern for atomic counters
- `rate-limits` table (schema file): New — likely for DB-backed rate limiting
- `schema/index.ts`: New barrel export for all schema tables

### Category assessment

| Aspect | Category |
|--------|----------|
| `token` → `secret` | **Template improvement** — Clearer naming, prevents accidental leaking |
| `Unsafe*Model` / safe `*Model` split | **Template improvement** — Security best practice |
| `order` → `displayOrder` | **Template improvement** — More descriptive |
| `uniqueKey` → composite unique constraints | **Template improvement** — Native DB constraint is better than app-level |
| Schema barrel export | **Template improvement** — Convenience |
| Composite PKs for partitioning | **Fork-specific** — Only needed at scale |
| Counters table | **Needs cella adaptation** — Useful generic pattern but currently only used for CDC seq tracking |
| `publicAccess` on pages | **Template improvement** — Common requirement |

---

## 10. Permission system changes

### Refactored files

- `is-permission-allowed.ts` → split into `add-permission.ts` + `check-permission.ts`
- `split-by-allowance.ts` → `split-by-permission.ts`
- `permission-manager/hierarchy.ts` → removed (logic integrated into `check.ts`)
- New: `permission-manager/action-helpers.ts`, `format.ts`, `validation.ts`
- New: `permission-manager/check.perf.test.ts` — Performance test
- `permission-manager/types.ts` — Expanded with `Action`, `PermissionOp`, `AllowedAction` types

### Key changes in `check.ts`

- Significantly rewritten (~348 lines of changes)
- New `canPerformAction()` and `getAllowedActions()` API
- Permission check now accounts for tenant context

### Category assessment

| Aspect | Category |
|--------|----------|
| Permission split (add/check) | **Template improvement** — Better separation of concerns |
| Performance test | **Template improvement** — Good practice |
| Action helpers / validation | **Template improvement** — Better modularization |
| Tenant-aware permissions | Tied to multi-tenancy (see §1) |

---

## 11. Environment & configuration

### `env.ts` changes
- `DEV_MODE`: Added `'none'` option
- New `DATABASE_ADMIN_URL` (required for migrations with RLS roles)
- New `CDC_INTERNAL_SECRET` (required in full/production mode)
- Removed: `ELECTRIC_API_SECRET`, `NOVU_API_KEY`, `NOVU_SLACK_WEBHOOK`
- Added `skipValidation` for Vitest
- `SKIP_DB` → `DEV_MODE: 'none'`

### Deleted config files
- `src/activities-config.ts` — activity actions moved to `sync/activity-bus.ts`
- `src/entity-config.ts` — entity config moved to `shared`
- `src/lib/entity.ts` — entity utilities moved to `lib/resolve-entity.ts`
- `src/db/types.ts` — types inlined or moved to `shared`

### New config files
- `src/table-config.ts` — Central mapping of entity types to their DB tables and models
- `scripts/scripts-config.ts` — Shared config for migration/seed scripts
- `scripts/types.ts` — Script type definitions

### Category assessment

| Aspect | Category |
|--------|----------|
| `DEV_MODE: 'none'` | **Template improvement** |
| `DATABASE_ADMIN_URL` | **Needs cella adaptation** — Good for prod, needs PGlite story |
| Electric removal | **Fork-specific** |
| Novu removal | **Fork-specific** |
| `skipValidation` for Vitest | **Template improvement** — Fixes test bootstrap issues |
| `table-config.ts` centralized table map | **Template improvement** — Good for dynamic entity operations |

---

## 12. Mock system overhaul

### New mocks
- `mock-auth.ts` — Authentication mock data
- `mock-entity-base.ts` — Base entity field mocks with tenant support
- `mock-error.ts` — Error response mocks
- `mock-request.ts` — Request entity mocks
- `mock-system.ts` — System-level mocks

### New mock utilities (`mocks/utils/`)
- `faker-seed.ts` — Deterministic faker seeding
- `mock-nanoid.ts` — Nanoid generation for mocks
- `mock-timestamps.ts` — Timestamp field mocks
- `mock-stx.ts` — Sync transaction mocks
- `mock-entity-counts.ts` / `mock-membership-counts.ts` / `mock-full-counts.ts`
- `mock-many.ts` / `mock-paginated.ts` / `mock-past-iso-date.ts`
- `mock-context-entity-id-columns.ts` — Context entity ID column mocks

### Deleted
- `mocks/index.ts` — Registration replaced by direct exports
- `mocks/example-registry.ts` — Old registry pattern removed

### Key changes in existing mocks
- All mocks updated for `tenantId` field
- `order` → `displayOrder` in membership mocks
- `uniqueKey` removed from membership/inactive membership mocks
- `token` → `secret` in session/token mocks

### Category assessment

| Aspect | Category |
|--------|----------|
| Mock utilities extraction | **Template improvement** — Good DRY pattern |
| `mock-entity-base.ts` | **Template improvement** — Centralized base fields |
| Mock-per-entity pattern (vs registry) | **Template improvement** — Simpler, more maintainable |
| Tenant-specific mock fields | Tied to multi-tenancy |
| stx mocks | **Fork-specific** |

---

## 13. Logger simplification

- `src/middlewares/logger/index.ts` + `external-logger.ts` → `src/middlewares/logger.ts` (single file)
- `src/pino-config.ts` → `src/pino.ts` (rename)
- `src/middlewares/README.md` deleted

### Category: **Template improvement** — Simpler logger setup

---

## 14. Email template updates

- Component renames: `avatar.tsx` → `email-avatar.tsx`, `container.tsx` → `email-container.tsx`, `app-logo.tsx` → `email-logo.tsx`
- New: `components/index.ts` barrel export
- New template: `member-added.tsx`
- Minor updates to all templates (import path changes, `config` → `shared`)

### Category: **Template improvement** — Better naming, barrel export

---

## 15. Test changes

### New tests
- `tests/auth-strategies/enforcement.test.ts` — Auth strategy enforcement tests
- `tests/integration/rls-security.test.ts` — RLS regression tests
- `src/lib/tests/lru-cache.test.ts` — LRU cache unit tests
- `src/lib/tests/ttl-cache.test.ts` — TTL cache unit tests
- `src/sync/tests/request-coalescing.test.ts` — Request coalescing tests
- `src/permissions/permission-manager/check.perf.test.ts` — Permission perf tests

### Changed tests
- All test files updated: `db` → `unsafeInternalDb as db` import
- `eventBus` → `activityBus` in CDC tests
- `cella_cdc_publication` → `cdc_pub`, `cella_cdc_slot` → `cdc_slot`
- `waitForEvent` return type changed to `ActivityEventWithEntity`
- Invitation tests updated for `tenantId`, removed `uniqueKey`
- OAuth tests updated for session `secret` field
- `global-setup.ts` updated for new env vars

### Category assessment

| Aspect | Category |
|--------|----------|
| Cache / coalescing tests | **Template improvement** — Good test coverage |
| Auth enforcement test | **Template improvement** |
| RLS security tests | Tied to multi-tenancy |
| Test import updates | Follows from other changes |

---

## 16. Miscellaneous changes

| Change | Category |
|--------|----------|
| `config` → `shared` import across all files | **Needs cella adaptation** — Package rename |
| `Dockerfile` added (was missing) | **Template improvement** |
| `.dockerignore` added | **Template improvement** |
| `drizzle.config.ts` updated for new migration format | Follows from partitioning |
| `package.json` dependency changes | Mixed (new deps for cache, tracing; removed Electric, Novu) |
| `tsconfig.json` updates | Minor path changes |
| `vitest.config.ts` updated env vars | Follows from env changes |
| `lib/resolve-entity.ts` (replaces `lib/entity.ts`) | **Template improvement** — Cleaner entity resolution |
| `utils/rejection-utils.ts` (new) | **Template improvement** — Utility for rejection handling |
| `utils/nanoid.ts` — added `nanoidTenant()` | Tied to multi-tenancy |
| `src/docs/` updates | Minor — tag config, extension config |
| `scripts/db-maintenance.ts` (new) | **Template improvement** — DB maintenance utilities |

---

## Priority recommendations for cella main

### Adopt immediately (low risk, high value)

1. **Error handling refactoring** — Positional `AppError` constructor + PG error mapping
2. **Guard renaming** — `*Guard` suffix convention, removing `getContext*()` helpers
3. **`token` → `secret` rename** + `Unsafe*Model` / safe `*Model` split
4. **`order` → `displayOrder`**, `uniqueKey` → composite unique constraints
5. **Schema centralization** — `src/schemas/` directory
6. **Mock utilities extraction** — `mocks/utils/` directory
7. **Logger simplification** — Single file logger
8. **Module singular naming** — `users/` → `user/`
9. **Cache utilities** (LRU, TTL) with tests
10. **Dockerfile + .dockerignore**
11. **`DEV_MODE: 'none'`** and vitest `skipValidation`
12. **Immutability triggers** for identity columns

### Adopt with cella-specific adaptation

1. **Multi-tenancy model** — Decide on single vs multi-tenant default. Consider opt-in tenancy.
2. **RLS infrastructure** — `tenant-context.ts` pattern is good but policies need to work without tenants too.
3. **`DATABASE_ADMIN_URL`** — Need migration path that still works with PGlite.
4. **CDC WebSocket** vs LISTEN/NOTIFY — Keep both options, WebSocket for production.
5. **Entity cache middleware** — Good pattern, adapt for non-CDC setups.
6. **`orgIdOrSlug` → `orgId` decision** — Consider keeping slug support.
7. **`config` → `shared` package rename** — Do as coordinated rename across all packages.

### Keep fork-specific

1. Partitioning (pg_partman) — Too complex for template default
2. Sync transaction (stx) metadata — Raak-specific offline-first feature
3. Field version tracking — Raak-specific conflict resolution
4. Electric removal — Cella may want to keep Electric option
5. Novu removal — Cella may want to keep notification service option
