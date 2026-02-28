# Cella agent guidelines (AGENTS.md)

## Project summary
Cella is a TypeScript template to build web apps with sync engine for offline and realtime use. Postgres, openapi & react-query are foundational layers. 

Cella is an implementation-ready template with quite some modules and a default entity config, see [shared/default-config.ts](../shared/default-config.ts) and [shared/hierarchy-config.ts](../shared/hierarchy-config.ts). Each fork will extend and change the entity config and its hierarchy, so its important to write entity-agnostic code.

## Architecture & tech stack
See [info/ARCHITECTURE.md](./ARCHITECTURE.md) for tech stack, file structure, data modeling, security, and sync/offline design.

## Routing
- **Backend (Hono + OpenAPI)**:
  - `backend/src/server.ts` creates the base app, mounts global middleware and the error handler (`appErrorHandler`).
  - Routes: `backend/src/modules/<module>/<module>-routes.ts` using `createXRoute`.
  - Handlers: `backend/src/modules/<module>/<module>-handlers.ts` using `.openapi()` on `OpenAPIHono`.
  - All module handlers are chained in `backend/src/routes.ts` via `.route(path, handler)`.
- **Frontend (TanStack Router)** — **code-based, NOT file-based**:
  - Routes in `frontend/src/routes/*.tsx` must be manually added to `frontend/src/routes/route-tree.tsx`.
  - Layouts in `frontend/src/routes/base-routes.tsx`; router instance in `frontend/src/routes/router.ts`.

## Middleware & guards
Global middleware chain (`backend/src/middlewares/app.ts`): secureHeaders → OpenTelemetry → observability → Sentry → pino logger → CORS → CSRF → body-limit → gzip.

Route-level guards in `backend/src/middlewares/guard/` control auth and tenant isolation:
- `authGuard`: Validates session, sets `ctx.var.user`, `ctx.var.memberships`, `ctx.var.db` (baseDb).
- `tenantGuard`: Verifies tenant membership, wraps handler in an RLS-enabled transaction — sets `ctx.var.db` to a transaction with `SET LOCAL` RLS session variables (`tenant_id`, `user_id`, `role`). This is how RLS policies are enforced: all handler DB access goes through `ctx.var.db`.
- `orgGuard`: Resolves organization and verifies membership within the tenant transaction.
- `publicGuard`: For unauthenticated routes, sets `ctx.var.db` to baseDb (no RLS transaction).
- Also: `sysAdminGuard`, `crossTenantGuard`, `relatableGuard`.

## Error handling
`AppError` is the structured error class: `status`, `type` (i18n key from `locales/en/error`), `severity`, `entityType`, `meta`. PostgreSQL error codes are mapped automatically (FK violation → 400, unique constraint → 409, RLS denial → 403, deadlock → 409). The global handler `appErrorHandler` is registered in `backend/src/server.ts`.

## Auth
Auth is split into five sub-modules in `backend/src/modules/auth/`: `general/` (session, cookies, MFA, verification emails), `passwords/`, `oauth/`, `passkeys/` (WebAuthn), `totps/` (TOTP 2FA). Session management lives in `general/helpers/session.ts`; cookie handling in `general/helpers/cookie.ts`.

## Permissions
The permission system (in `backend/src/permissions/`) provides: `checkPermission` (membership + role checks with hierarchy traversal), `canAccessEntity`, `canCreateEntity`, `getValidContextEntity`, `getValidProductEntity` (fetch + permission check), `splitByPermission` (batch filtering). Access policies are defined using `configureAccessPolicies()` in `shared/permissions-config.ts`. Guards invoke these functions; see ARCHITECTURE.md for defense-in-depth layers (Permission Manager → RLS → composite FKs).

## State management & API
- **Server state**: TanStack Query (`offlineFirst` network mode, IndexedDB persistence via `PersistQueryClientProvider`). Query options/keys/mutations in `frontend/src/modules/<module>/query.ts`. Paused mutations resume after reload via mutation registry (`frontend/src/query/mutation-registry.ts`). See ARCHITECTURE.md "Query layer" section for full architecture.
- **Client state**: Zustand stores in `frontend/src/store/`.
- **API client**: Generated SDK in `frontend/src/api.gen/`. **Never modify manually** — run `pnpm generate:openapi` after backend route/schema changes.
- **DB schemas**: `backend/src/db/schema/` (Drizzle ORM). Run `pnpm generate` for migrations.
- **API validation**: Zod schemas in `backend/src/modules/<module>/<module>-schema.ts` (using `@hono/zod-openapi`). Shared base schemas in `backend/src/schemas/`.
- **Frontend types**: Generated in `frontend/src/api.gen/`; module-specific types in `frontend/src/modules/<module>/types.ts`.
- Types are inferred from Zod schemas (`z.infer`). Avoid `as` type assertions — prefer `Object.assign`, `satisfies`, or `as const`.

### Query infrastructure patterns
- **Query keys**: Use `createEntityKeys<Filters>('myEntity')` and register with `registerEntityQueryKeys('myEntity', keys)` in the module's `query.ts`. Keys follow `[entityType, 'list'|'detail', ...]` convention.
- **Optimistic updates**: Use `useMutateQueryData(queryKey)` for cache mutations. Generate placeholder entities with `createOptimisticEntity(zodSchema, overrides)` — it auto-fills IDs, timestamps, and Zod defaults.
- **Invalidation**: Use `invalidateIfLastMutation(queryClient, mutationKey, queryKey)` in `onSettled` to prevent over-invalidation when multiple mutations are in flight.
- **Mutation registry**: In each entity's `query.ts`, call `addMutationRegistrar((qc) => { qc.setMutationDefaults(keys.create, { mutationFn: ... }) })` so paused offline mutations can resume after reload.
- **Enrichment**: Context entity list items are auto-enriched with `item.membership`, `item.can` (permission map), and `item.ancestorSlugs` via a QueryCache subscriber in `frontend/src/query/enrichment/`. No manual wiring needed — just ensure query keys are registered.
- **Slug resolution**: Use `fetchSlugCacheId(fetcher, cacheKey)` to resolve slug-based routes to IDs and cache the result under the entity's detail key.

## Docs, mocks & OpenAPI extensions

**Extension system** (`backend/src/docs/`):
- `x-middleware.ts`: Wrap guards/limiters/caches with `xMiddleware(options, fn)` — they auto-appear in the spec and docs UI. Use `setMiddlewareExtension` for composed middleware.
- `x-routes.ts`: Always use `createXRoute` instead of `createRoute`. Props: `xGuard` (required), `xRateLimiter`, `xCache`.
- `extensions-config.ts`: Add new `x-*` extension types here.
- `docs.ts`: Orchestrates spec build, writes `openapi.cache.json`, mounts Scalar at `/docs`.
- Frontend: Vite plugin in `frontend/vite/openapi-parser/` → output in `frontend/public/static/docs.gen/`. Docs UI in `frontend/src/modules/docs/`.

**Mocks** (`backend/mocks/mock-*.ts`, utils in `backend/mocks/utils/`):
- Each entity has **insert mocks** (`mockUser()` → `Insert*Model`) and **response mocks** (`mockUserResponse()` → deterministic via `withFakerSeed`).
- OpenAPI examples: pass `mockXResponse()` to `.openapi('Name', { example })` and route `example:`.
- Seeding (`backend/scripts/seeds/`): call `setMockContext('script')` + `mockMany(mockEntity, count)`.
- Tests (`backend/tests/`): use insert mocks via `backend/tests/helpers.ts`. Call `resetXMockEnforcers()` in cleanup.
- Key utils: `mockMany()`, `mockPaginated()`, `mockTimestamps()`, `pastIsoDate()`, `mockContextEntityIdColumns()`.

## Sync engine details
- **Stx helpers** (`frontend/src/query/offline/`): `createStxForCreate()`, `createStxForUpdate()`, `createStxForDelete()` build sync transaction metadata from cached entity version.
- **Conflict detection**: `checkFieldConflicts()` compares per-field versions; `isTransactionProcessed()` checks idempotency via `activities` table.
- **Realtime backend** (`backend/src/sync/`): `activityBus` → `createStreamDispatcher()` → `streamSubscriberManager` for SSE fan-out. `CdcWebSocketServer` accepts the CDC worker connection on `/internal/cdc`.
- **Realtime frontend** (`frontend/src/query/realtime/`): Two streams — `AppStream` (authenticated, leader-tab via Web Locks + BroadcastChannel, echo prevention via `stx.sourceId`, catchup via `seq` delta) and `PublicStream` (unauthenticated, per-tab connection, catches up deletes on connect then live-only).
- **Seen-by tracking**: Frontend marks entities seen via `IntersectionObserver`, batches IDs in a Zustand store, flushes on timer + `sendBeacon` on unload. Flushed IDs persist in localStorage. Unseen badges are optimistically decremented in React Query cache. Backend: `seen_by` table (one row per user+entity), `seen_counts` (denormalized view count).
- **Entity cache**: CDC-invalidated in-memory cache in `backend/src/middlewares/entity-cache/`. `coalesce()` deduplicates concurrent fetches.

## Coding patterns
- **Entities**: `ContextEntityType` (has memberships) and `ProductEntityType` (content-related). See `info/ARCHITECTURE.md`.
- **Configuration**: `shared/default-config.ts` defines the base config (validated against `RequiredConfig`). Per-deploy overrides (e.g. `shared/development-config.ts`) deep-merge over it, selected by `NODE_ENV` in `shared/app-config.ts`. Check `.env` for secrets and environment variables.
- **Debug mode**: Set `VITE_DEBUG_MODE=true` in `frontend/.env`.
- **Stores, no Providers**: Favour Zustand stores over React Provider pattern.
- **OpenAPI nullable**: Use `z.union([schema, z.null()])` instead of `schema.nullable()` for named schemas.
- **OpenAPI schema naming**: Only register schemas as named components (`.openapi('Name')`) for core entity responses or shared base types. Inline enums and request body schemas. Share a single schema when shape is identical across contexts.

## Coding style & naming conventions
- Formatter/Linter: Biome (`biome.json`). Run `pnpm lint:fix`.
- Indentation: 2 spaces; line width: 100; quotes: single; semicolons: as needed; trailing commas: ES5.
- Zod v4 only: `import { z } from 'zod'`. In backend: `import { z } from '@hono/zod-openapi'`.
- camelCase for variables/functions (including constants), PascalCase for components, kebab-case for files, snake_case for translation keys.
- JSDoc on all exports. Backend: full JSDoc with params/response. Frontend: 1-3 lines. No standalone file-level comments above imports.
- Storybook: Stories in `stories/` folder within the module, named `<component-filename>.stories.tsx`.
- Icons: lucide with Icon suffix (e.g., `PencilIcon`).
- Keep existing code comments intact unless cleanup is explicitly requested.
- Console: `console.log` for temp debugging (remove before commit), `console.info` for logging, `console.debug` for dev (stripped in prod).
- Links as buttons: Use `<Link>` with `buttonVariants()` for linkable actions. Allow new-tab opening for URL-targetable sheet content.
- React-compiler: `useMemo`/`useCallback` can be avoided in most cases.
- Translations: All UI text via `useTranslation()` and `t('namespace:key')`. Never hardcode. Files in `locales/en/`.

## Testing
- Framework: Vitest. Name tests `*.test.ts`; place near source or under `tests/`.
- See [info/TESTING.md](./TESTING.md) for test modes and detailed documentation.

## Commits & pull requests
- Use `git` and `gh` CLI. Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`.
- PRs: concise description, linked issues, passing checks. Keep changes scoped.

## Commands
- `pnpm quick`: Dev with PGlite (fast, no Docker).
- `pnpm dev:core`: Dev with PostgreSQL (no CDC).
- `pnpm dev`: Dev with PostgreSQL + CDC Worker.
- `pnpm check`: Runs `generate:openapi` + typecheck + `lint:fix`.
- `pnpm generate`: Create Drizzle migrations from schema changes.
- `pnpm generate:openapi`: Regenerate OpenAPI spec and frontend SDK.
- `pnpm seed`: Seed database with test data.
- `pnpm test`: Run all tests (alias for `test:core`). Also: `test:basic` (no Docker), `test:full` (includes CDC).
- `pnpm cella`: run Cella CLI to sync with upstream or downstream: [cli/cella/README.md](../cli/cella/README.md)
