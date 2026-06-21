# Cella agent guidelines (AGENTS.md)

## Project summary
Cella is a TypeScript template to build web apps with sync engine for offline and realtime use. Postgres, openapi & react-query are foundational layers. 

 Cella is an implementation-ready template with quite some modules and a default entity config. The base config lives in [shared/config/config.default.ts](../shared/config/config.default.ts), with entity hierarchy and roles defined in [shared/config/hierarchy-config.ts](../shared/config/hierarchy-config.ts). Those feed into `appConfig`, which is the main merged runtime config object exposed by shared. Each fork will typically change the underlying config, hierarchy and permissions, so it is important to write entity-agnostic code rather than hardcoding assumptions about the default entity set and their roles. 

## Architecture & tech stack
See [info/ARCHITECTURE.md](./ARCHITECTURE.md) for tech stack, file structure, data modeling, security, and sync/offline design.

## Routing
- **Backend (Hono + OpenAPI)**:
  - `backend/src/server.ts` creates the base app, mounts global middleware and the error handler (`appErrorHandler`).
  - Routes: `backend/src/modules/<module>/<module>-routes.ts` using `createXRoute`.
  - Handlers: `backend/src/modules/<module>/<module>-handlers.ts` using `.openapi()` on `OpenAPIHono`.
- **Frontend (TanStack Router)** — **file-based**:
  - Route files live in `frontend/src/routes/` and are auto-registered by the router vite plugin into the generated `frontend/src/routes/routeTree.gen.ts` (committed, not hand-edited).
  - Route files are thin shims: path/staticData/glue only. Components and `beforeLoad` logic live in modules (`route-logic.ts`, `route-components.tsx`, `search-params-schemas.ts`), wired via `getRouteApi('<route id>')`.
  - Layout directories: `_public/` (pathless public layout), `_app/` (pathless authenticated layout), `_public/_content/` (public content), `_app/$tenantId.$organizationSlug/` (org context). Trailing underscore (e.g. `page_.$id.edit.tsx`) opts out of parent component nesting.
  - Router instance in `frontend/src/routes/router.ts`; shared route helpers in `frontend/src/routes/route-utils.tsx`.

## Middleware & guards
Global middleware chain (`backend/src/middlewares/app.ts`): secureHeaders → OpenTelemetry → observability → Sentry → pino logger → CORS → CSRF → body-limit → gzip.

Route-level guards in `backend/src/middlewares/guard/` control auth and tenant isolation:
- `authGuard`: Validates session, sets `ctx.var.user`, `ctx.var.memberships`, `ctx.var.db` (baseDb).
- `tenantGuard`: Verifies tenant membership, loads tenant row, sets `ctx.var.db = baseDb` and `ctx.var.tenantId`. Product entity handlers use `tenantRead()` for RLS-scoped reads and `tenantWrite()` for plain write transactions. Context entity handlers use `ctx.var.db` (baseDb) directly — no RLS.
- `orgGuard`: Resolves organization and verifies membership.
- `publicGuard`: For unauthenticated routes, sets `ctx.var.db` to baseDb. Public product entity handlers use `publicRead()` for RLS-scoped reads.
- `crossTenantGuard`: Validates authentication for cross-tenant routes, sets `ctx.var.db = baseDb`. Handlers use `tenantRead()` for cross-tenant product entity queries.
- Also: `sysAdminGuard`, `relatableGuard`.

### Database access patterns
- **Product entity handlers** wrap reads in `tenantRead(ctx, fn)` (RLS-scoped SELECT) and writes in `tenantWrite(fn)` (plain transaction — no RLS write policies) from `backend/src/db/tenant-context.ts`.
- **Context entity handlers** use `ctx.var.db` (baseDb) directly — no RLS.
- **Public product entity routes** use `publicRead(tenantId, fn)` for unauthenticated access.

## Error handling
`AppError` is the structured error class: `status`, `type` (i18n key from `locales/en/error`), `severity`, `entityType`, `meta`. PostgreSQL error codes are mapped automatically (FK violation → 400, unique constraint → 409, RLS denial → 403, deadlock → 409). The global handler `appErrorHandler` is registered in `backend/src/server.ts`.

## Auth
Auth is split into five sub-modules in `backend/src/modules/auth/`: `general/` (session, cookies, MFA, verification emails), `passwords/`, `oauth/`, `passkeys/` (WebAuthn), `totps/` (TOTP 2FA). Session management lives in `general/helpers/session.ts`; cookie handling in `general/helpers/cookie.ts`.

## Permissions
The permission system (in `backend/src/permissions/`) provides: `checkPermission` (membership + role checks with hierarchy traversal), `canAccessEntityType`, `canCreateEntity`, `getValidContextEntity`, `getValidProductEntity` (fetch + permission check), `splitByPermission` (batch filtering). Access policies are defined using `configureAccessPolicies()` in `shared/config/permissions-config.ts` with three values: `1` (allowed), `0` (denied), `'own'` (allowed only for the entity's creator — implicit owner relation). The engine checks `entity.createdBy === userId` for `'own'` policies. On the frontend, `computeCan()` produces a three-state map (`true | false | 'own'`); use `resolvePermission()` from `shared` to resolve `'own'` per-entity. Guards invoke these functions; see ARCHITECTURE.md for defense-in-depth layers (Permission Manager → RLS → composite FKs).

## State management & API
- **Server state**: TanStack Query (`offlineFirst` network mode, IndexedDB persistence via `PersistQueryClientProvider`). Query options/keys/mutations in `frontend/src/modules/<module>/query.ts`. Paused mutations resume after reload via mutation registry (`frontend/src/query/mutation-registry.ts`). See ARCHITECTURE.md "Query layer" section for full architecture.
- **Client state**: Zustand stores in `frontend/src/store/`. Prefer Zustand over React context. Context is only for tree-local wiring of compound UI components (e.g. `Carousel`, `Select`, `Stepper`) or third-party libs that require a provider — never for app/feature state.
- **Persistence boundaries**: Server entities → React Query cache (persisted via global persister). Local UI selections/preferences → Zustand `persist` (see `navigation-store`, `ui-store`). Never call `localStorage` directly from hooks/components. Never mirror entities into Zustand. Storage key is always `${appConfig.slug}-<store>`; per-tenant/org/entity scoping goes inside state (e.g. `Record<\`${tenantId}:${orgId}\`, T>`), never in the key.
- **API client**: Generated SDK in `sdk/gen/`, consumed from the `sdk` workspace package. **Never modify manually** — run `pnpm sdk` after backend route/schema changes.
- **DB schemas**: `backend/src/db/schema/` (Drizzle ORM). Run `pnpm generate` for migrations. Entity IDs use UUID v7 by default (time-ordered, via `uuidv7`). Nanoid is used only where short IDs are needed (e.g., tenant IDs) or longer IDs are required.
- **API validation**: Zod schemas in `backend/src/modules/<module>/<module>-schema.ts` (using `@hono/zod-openapi`). Shared base schemas in `backend/src/schemas/`.
- **Frontend types**: Generated in `sdk/gen/` and imported from `sdk`; module-specific types live in `frontend/src/modules/<module>/types.ts`.
- Types are inferred from Zod schemas (`z.infer`). Avoid `as` type assertions — prefer `Object.assign`, `satisfies`, or `as const`. **Never use `as unknown as`** without explicit permission. If a double cast seems necessary, first try: `isNull()` instead of `eq(col, null as unknown as T)`, `Object.assign` instead of casting augmented functions, generic type parameters instead of widening, or a dedicated type/interface. If no alternative exists (e.g., library type gap, test mocks), add an inline comment explaining why.

### Query infrastructure patterns
- **Query keys**: Use `createEntityKeys<Filters>('myEntity')` and register with `registerEntityQueryKeys('myEntity', keys)` in the module's `query.ts`. Keys follow `[entityType, 'list'|'detail', ...]` convention.
- **Optimistic updates**: Use `mutateQueryData(queryKey)` for cache mutations. Generate placeholder entities with `createOptimisticEntity(zodSchema, overrides)` — it auto-fills IDs, timestamps, and Zod defaults.
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
- Frontend: openapi-parser plugin in `sdk/src/plugins/openapi-parser/` → output in `sdk/gen/docs.gen/` (served at `/static/docs.gen/` by Vite). Docs UI in `frontend/src/modules/docs/`.

**Mocks** (`backend/mocks/mock-*.ts`, utils in `backend/mocks/utils/`):
- Each entity has **insert mocks** (`mockUser()` → `Insert*Model`) and **response mocks** (`mockUserResponse()` → deterministic via `withFakerSeed`).
- OpenAPI examples: pass `mockXResponse()` to `.openapi('Name', { example })` and route `example:`.
- Seeding (`backend/scripts/seeds/`): call `setMockContext('script')` + `mockMany(mockEntity, count)`.
- Tests (`backend/tests/`): use insert mocks via `backend/tests/helpers.ts`. Call `resetXMockEnforcers()` in cleanup.
- Key utils: `mockMany()`, `mockPaginated()`, `mockTimestamps()`, `mockPastIsoDate()`, `generateMockContextIdColumns()` (all configured context columns) / `generateMockEntityContextIdColumns()` (one product entity's columns).

## Sync engine details
- **Stx helpers** (`frontend/src/query/offline/`): `createStxForCreate()`, `createStxForUpdate()`, `createStxForDelete()` build sync transaction metadata from cached entity version.
- **Conflict detection**: `checkFieldConflicts()` compares per-field versions; `isTransactionProcessed()` checks idempotency via `activities` table.
- **Realtime backend** (`backend/src/sync/`): `activityBus` → `createStreamDispatcher()` → `streamSubscriberManager` for SSE fan-out. `CdcWebSocketServer` accepts the CDC worker connection on `/internal/cdc`.
- **Realtime frontend** (`frontend/src/query/realtime/`): Two streams — `AppStream` (authenticated, leader-tab via Web Locks + BroadcastChannel, echo prevention via `stx.sourceId`, catchup via `seq` delta) and `PublicStream` (unauthenticated, per-tab connection, catches up deletes on connect then live-only).
- **Seen-by tracking**: Frontend marks entities seen via `IntersectionObserver`, batches IDs in a Zustand store, flushes on timer + `sendBeacon` on unload. Flushed IDs persist in localStorage. Unseen badges are optimistically decremented in React Query cache. Backend: `seen_by` table (one row per user+entity), `product_counters` (denormalized view/usage counts).
- **Entity cache**: CDC-invalidated in-memory cache in `backend/src/middlewares/entity-cache/`. `coalesce()` deduplicates concurrent fetches.

## Coding patterns
- **Entities**: `ContextEntityType` (has memberships) and `ProductEntityType` (content-related). See `info/ARCHITECTURE.md`.
- **Configuration**: `shared/config/config.default.ts` defines the base config (validated against `RequiredConfig`). Per-deploy overrides (e.g. `shared/config/config.development.ts`) deep-merge over it, selected by `NODE_ENV` in `shared/app-config.ts`. Check `.env` for secrets and environment variables.
- **Debug mode**: Set `VITE_DEBUG_MODE=true` in `frontend/.env`.
- **OpenAPI nullable**: Use `z.union([schema, z.null()])` instead of `schema.nullable()` for named schemas.
- **OpenAPI schema naming**: Only register schemas as named components (`.openapi('Name')`) for whole entity responses or crucial shared base types. Inline enums and request body schemas. Share a single schema when shape is identical across contexts.

## Coding style & naming conventions
- Formatter/Linter: Biome (`biome.json`). Run `pnpm lint:fix`.
- Indentation: 2 spaces; line width: 100; quotes: single; semicolons: as needed; trailing commas: ES5.
- Zod v4 only: `import { z } from 'zod'`. In backend: `import { z } from '@hono/zod-openapi'`.
- camelCase for variables/functions (including constants), PascalCase for components, kebab-case for files, snake_case for translation keys.
- JSDoc on all exports. Backend: full JSDoc with params/response. Frontend: 1-3 lines. No standalone file-level comments above imports.
- Code comments explain non-trivial logic only. Do not narrate decision history, what was considered and rejected, or how the code evolved — that belongs in commit messages, not source. A comment should describe *what* the code does and *why*, not *what it replaced* or *what it is not*.
- Storybook: Stories in `stories/` folder within the module, named `<component-filename>.stories.tsx`.
- Icons: lucide with Icon suffix (e.g., `PencilIcon`).
- UI primitives: Base UI (`@base-ui/react`), **not** Radix. Shadcn-style components in `frontend/src/modules/ui/` wrap Base UI primitives.
- Keep existing code comments intact unless cleanup is explicitly requested.
- Console: `console.log` for temp debugging (remove before commit), `console.info` for logging, `console.debug` for dev (stripped in prod).
- Links as buttons: Use `<Link>` with `buttonVariants()` for linkable actions. Allow new-tab opening for URL-targetable sheet content.
- React-compiler: `useMemo`/`useCallback` can be avoided in most cases.
- Translations: All UI text via `useTranslation()` and `t('c:key')`. Never hardcode. Files in `locales/en/`. General translations go in `common.json`, app-specific ones in `app.json`. Both are merged into the `common` namespace at runtime, so always use `t('c:key')` — never `t('app:key')`.

## Testing
- Framework: Vitest. Name tests `*.test.ts`; place near source or under `tests/`.
- See [info/TESTING.md](./TESTING.md) for test modes and detailed documentation.

## Commits & pull requests
- Use `git` and `gh` CLI. Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`.
- PRs: concise description, linked issues, passing checks. Keep changes scoped.

## Commands
- `pnpm dev`: Dev with PostgreSQL + CDC Worker (requires Docker).
- `pnpm check`: Runs `sdk` + typecheck + `lint:fix`.
- `pnpm generate`: Create Drizzle migrations from schema changes.
- `pnpm sdk`: Regenerate OpenAPI spec and frontend SDK.
- `pnpm seed`: Seed database with test data.
- `pnpm test`: Run the default full test suite and emit summary coverage output. Use `pnpm test:core` for the narrower core-mode suite without CDC/CLI coverage.
- `pnpm infra`: Manage deployment using Infra CLI: [infra/README.md](../infra/README.md)
- `pnpm bench`: Run benchmark scenarios: [bench/README.md](../bench/README.md)
- `pnpm cella`: CLI to sync with cella and more: [cli/cella/README.md](../cli/cella/README.md)
- `pnpm story`: Start storybook

