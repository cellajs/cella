# Cella agent guidelines (AGENTS.md)

## Project summary
Cella is a TypeScript template to collaborative web apps with sync engine for offline and realtime use. Postgres, openapi & react-query are foundational layers. 

 Cella is an implementation-ready template with quite some modules and a default entity config. The base config lives in [shared/config/config.default.ts](../shared/config/config.default.ts), with entity hierarchy and roles defined in [shared/config/hierarchy-config.ts](../shared/config/hierarchy-config.ts). Those feed into `appConfig`, which is the main merged runtime config object exposed by shared. Each fork will typically change the underlying config, hierarchy and permissions, so it is important to write entity-agnostic code rather than hardcoding assumptions about the default entity set and their roles. 

## Architecture
See [Architecture](/docs/page/architecture) for tech stack, file structure, data modeling, security, and sync/offline design.

## Routing
- **Backend (Hono + OpenAPI)**:
  - `backend/src/server.ts` creates the base app, mounts global middleware and the error handler (`appErrorHandler`).
  - Routes: `backend/src/modules/<module>/<module>-routes.ts` using `createXRoute`.
  - Handlers: `backend/src/modules/<module>/<module>-handlers.ts` using `.openapi()` on `OpenAPIHono`.
- **Frontend (TanStack Router, file-based)**:
  - Route files live in `frontend/src/routes/` and are auto-registered by the router vite plugin into the generated `routeTree.gen.ts` (committed, not hand-edited).
  - Route files are thin shims: path/staticData/glue only. Components and `beforeLoad` logic live in modules (`route-logic.ts`, `route-components.tsx`, `search-params-schemas.ts`), wired via `getRouteApi('<route id>')`.
  - Layout directories: `_public/` (pathless public layout), `_app/` (pathless authenticated layout), `_public/_content/` (public content), `_app/$tenantId.$organizationSlug/` (org context). Trailing underscore (e.g. `page_.$id.edit.tsx`) opts out of parent component nesting.
  - Router instance in `frontend/src/routes/router.ts`; shared route helpers in `route-utils.tsx` next to it.

## Middleware & guards
Global middleware chain in `backend/src/middlewares/app.ts`: secureHeaders → OpenTelemetry → observability → Sentry → pino logger → CORS → CSRF → body-limit → gzip.

Route-level guards in `backend/src/middlewares/guard/` control auth and tenant isolation:
- `authGuard`: Validates session, sets `ctx.var.user`, `ctx.var.memberships`, `ctx.var.db` (baseDb).
- `tenantGuard`: Verifies tenant membership, loads tenant row, sets `ctx.var.db = baseDb` and `ctx.var.tenantId`. Product entity handlers use `tenantRead()` for RLS-scoped reads and `tenantContext()` for read-write transactions (which also set RLS session vars so internal SELECTs/RETURNING pass). Channel entity handlers use `ctx.var.db` (baseDb) directly, no RLS.
- `orgGuard`: Resolves organization and verifies membership.
- `publicGuard`: For unauthenticated routes, sets `ctx.var.db` to baseDb. Public product entity handlers use `publicRead()` for RLS-scoped reads.
- `crossTenantGuard`: Validates authentication for cross-tenant routes, sets `ctx.var.db = baseDb`. Handlers use `tenantRead()` for cross-tenant product entity queries.
- Also: `sysAdminGuard`, `relatableGuard`.

### Database access patterns
- **Product entity handlers** wrap reads in `tenantRead(ctx, fn)` (RLS-scoped SELECT) and writes in `tenantContext(ctx, fn)` (read-write transaction that sets RLS session vars so internal SELECTs/RETURNING pass; no RLS write policies: write isolation via guards + FKs + triggers) from `backend/src/db/tenant-context.ts`.
- **Channel entity handlers** use `ctx.var.db` (baseDb) directly, no RLS.
- **Public product entity routes** use `publicRead(tenantId, fn)` for unauthenticated access.

## Error handling
`AppError` is the structured error class: `status`, `type` (i18n key from `locales/en/error`), `severity`, `entityType`, `meta`. PostgreSQL error codes are mapped automatically (FK violation → 400, unique constraint → 409, RLS denial → 403, deadlock → 409). The global handler `appErrorHandler` is registered in `backend/src/server.ts`.

## Auth
Auth is split into five sub-modules in `backend/src/modules/auth/`: `general/` (session, cookies, MFA, verification emails), `magic/`, `oauth/`, `passkeys/` (WebAuthn), `totps/` (TOTP 2FA). Session management lives in `general/helpers/session.ts`; cookie handling in `general/helpers/cookie.ts`.

## Permissions
The permission system in `backend/src/permissions/` provides: `checkPermission` (membership + role checks with hierarchy traversal), `canAccessEntityType`, `canCreateEntity`, `getValidChannelEntity`, `getValidProductEntity` (fetch + permission check), `splitByPermission` (batch filtering). Access policies are defined using `configureAccessPolicies()` with three values: `1` (allowed), `0` (denied), `'own'` (allowed only for the entity's creator, an implicit owner relation). The engine checks `entity.createdBy === userId` for `'own'` policies. On the frontend, `computeCan()` produces a three-state map (`true | false | 'own'`); use `resolvePermission()` from `shared` to resolve `'own'` per-entity. Guards invoke these functions; see ARCHITECTURE.md for defense-in-depth layers (Permission Manager → RLS → composite FKs).

## State & API
- **Server state**: TanStack Query (`offlineFirst` network mode, IndexedDB persistence via `PersistQueryClientProvider`). Query options/keys/mutations in `frontend/src/modules/<module>/query.ts`. Paused mutations resume after reload via the mutation registry. See ARCHITECTURE.md "Query layer" section for full architecture.
- **Client state**: Zustand stores live as `*-store.ts` files inside their module (e.g. `frontend/src/modules/navigation/navigation-store.ts`). Prefer Zustand over React context. Context is only for tree-local wiring of compound UI components (e.g. `Carousel`, `Select`, `Stepper`) or third-party libs that require a provider; never for app/feature state.
- **Persistence boundaries**: Server entities → React Query cache (persisted via global persister). Local UI selections/preferences → Zustand `persist` (see `navigation-store`, `ui-store`). Never call `localStorage` directly from hooks/components. Never mirror entities into Zustand. Per-user client state (persisted Zustand kv, query cache, attachment blobs, failed-sync) lives in ONE IndexedDB per user, `${appConfig.slug}:${userId}`; see `frontend/src/query/app-db.ts` + auth-driven lifecycle in `app-storage.ts`. Only `ui-store`/`user-store` stay in plain localStorage (bootstrap stores). New per-user stores: `idbKvStorage('<base>')` + `skipHydration: true` and register in `app-storage.ts`. Per-tenant/org/entity scoping goes inside state (e.g. `Record<\`${tenantId}:${orgId}\`, T>`), never in the key.
- **API client**: Generated SDK in `sdk/gen/`, consumed from the `sdk` workspace package. **Never modify manually**; run `pnpm sdk` after backend route/schema changes.
- **Frontend membership enrichment**: Backend channel-entity responses may include `included.membership` for external API clients. Frontend app code should use that field only to seed `meKeys.memberships`; channel entities get their direct `entity.membership` field from the enrichment pipeline. Do not flatten `included.membership` onto entities or read `entity.included.membership` in UI components, cache mutations, or feature logic.
- **DB schemas**: Drizzle tables live in module `*-db.ts` files, registered in `backend/src/tables.ts`. Run `pnpm generate` for migrations. Entity IDs use UUID v7 by default (time-ordered, via `uuidv7`). Nanoid is used only where short IDs are needed (e.g., tenant IDs) or longer IDs are required.
- **API validation**: Zod schemas in `backend/src/modules/<module>/<module>-schema.ts` (using `@hono/zod-openapi`). Shared base schemas in `backend/src/schemas/`.
- **Frontend types**: Generated in `sdk/gen/` and imported from `sdk`; module-specific types live in `frontend/src/modules/<module>/types.ts`.
- Types are inferred from Zod schemas (`z.infer`). Avoid `as` type assertions; prefer `Object.assign`, `satisfies`, or `as const`. **Never use `as unknown as`** without explicit permission. If a double cast seems necessary, first try: `isNull()` instead of `eq(col, null as unknown as T)`, `Object.assign` instead of casting augmented functions, generic type parameters instead of widening, or a dedicated type/interface. If no alternative exists (e.g., library type gap, test mocks), add an inline comment explaining why.

### Query infrastructure patterns
- **Query keys**: Use `createEntityKeys<Filters>('myEntity')` and register with `registerEntityQueryKeys('myEntity', keys)` in the module's `query.ts`. Keys follow `[entityType, 'list'|'detail', ...]` convention.
- **Optimistic updates**: Use `mutateQueryData(queryKey)` for cache mutations. Generate placeholder entities with `createOptimisticEntity(zodSchema, overrides)`; it auto-fills IDs, timestamps, and Zod defaults.
- **Invalidation**: Use `invalidateIfLastMutation(queryClient, mutationKey, queryKey)` in `onSettled` to prevent over-invalidation when multiple mutations are in flight.
- **Mutation registry**: In each entity's `query.ts`, call `addMutationRegistrar((qc) => { qc.setMutationDefaults(keys.create, { mutationFn: ... }) })` so paused offline mutations can resume after reload.
- **Enrichment**: Channel entity list items are auto-enriched with `item.membership`, `item.can` (permission map), and `item.ancestorSlugs` via a QueryCache subscriber in `frontend/src/query/enrichment/`. No manual wiring needed; just ensure query keys are registered.
- **Slug resolution**: Use `fetchSlugCacheId(fetcher, cacheKey)` to resolve slug-based routes to IDs and cache the result under the entity's detail key.

## OpenAPI & mocks

**Extension system** in `backend/src/core/`:
- `x-middleware.ts`: Wrap guards/limiters/caches with `xMiddleware(options, fn)`; they auto-appear in the spec and docs UI. Use `setMiddlewareExtension` for composed middleware.
- `x-routes.ts`: Always use `createXRoute` instead of `createRoute`. Props: `xGuard` (required), `xRateLimiter`, `xCache`.
- `extensions-config.ts`: Add new `x-*` extension types here.
- `docs.ts`: Orchestrates spec build, writes `openapi.cache.json`, mounts Scalar at `/docs`.
- Frontend: the openapi-parser plugin in `sdk/src/plugins/openapi-parser/` writes generated docs output, served at `/static/docs.gen/` by Vite; the docs UI lives in the frontend docs module.

**Mocks** in `backend/src/mocks/`:
- Each entity has **insert mocks** (`mockUser()` → `Insert*Model`) and **response mocks** (`mockUserResponse()` → deterministic via `withFakerSeed`).
- OpenAPI examples: pass `mockXResponse()` to `.openapi('Name', { example })` and route `example:`.
- Seeding via `backend/scripts/seeds/`: call `setMockContext('script')` + `mockMany(mockEntity, count)`.
- Tests: use insert mocks via `backend/tests/helpers.ts`. Call `resetXMockEnforcers()` in cleanup.
- Key utils: `mockMany()`, `mockPaginated()`, `mockTimestamps()`, `mockPastIsoDate()`, `generateMockChannelIdColumns()` (all configured context columns) / `generateMockEntityChannelIdColumns()` (one product entity's columns).

## Sync engine
- **Stx helpers** in `frontend/src/query/offline/`: `createStxForCreate()`, `createStxForUpdate()`, `createStxForDelete()` build sync transaction metadata from cached entity version.
- **Conflict detection**: `checkFieldConflicts()` compares per-field versions; `isTransactionProcessed()` checks idempotency via `activities` table.
- **Realtime backend** in `backend/src/modules/entities/stream/`: `activityBus` → `createStreamDispatcher()` → `streamSubscriberManager` for SSE fan-out. `CdcWebSocketServer` accepts the CDC worker connection on `/internal/cdc`.
- **Realtime frontend** in `frontend/src/query/realtime/`: Two streams, `AppStream` (authenticated, leader-tab via Web Locks + BroadcastChannel, echo prevention via `stx.sourceId`, catchup via `seq` delta) and `PublicStream` (unauthenticated, per-tab connection, catches up deletes on connect then live-only).
- **Seen-by tracking**: Frontend marks entities seen via `IntersectionObserver`, batches IDs in a Zustand store, flushes on timer + `sendBeacon` on unload. Flushed IDs persist in the per-user `appdb` (`kv` table). Unseen badges are optimistically decremented in React Query cache. Backend: `seen_by` table (one row per user+entity), `product_counters` (denormalized view/usage counts).
- **Entity cache**: CDC-invalidated in-memory cache in `backend/src/middlewares/entity-cache/`. `coalesce()` deduplicates concurrent fetches.
- **Schema evolution (lenses)**: breaking wire-shape changes to product entities ship as append-only lens modules in `shared/src/schema-evolution/`; never edit a shipped module. Until the first lens ships, bump `appConfig.clientCacheVersion` in the same PR as any breaking change to a cached entity's wire shape (`schema-bust-gate` CI enforces this). Playbook: [Schema evolution](/docs/page/architecture/schema-evolution).
- **Lens seams (new entity modules)**: build update bodies with `createUpdateSchema(entityType, shape)`, create bodies with `widenBodySchema(entityType, schema)`, resolve updates via `resolveUpdateOps(entityType, …)`, and map create items through `normalizeCreateItem(entityType, item)`. These carry the lens widening/normalization; skipping them breaks version tolerance for that entity.

## Coding patterns
- **Entities**: `ChannelEntityType` (has memberships) and `ProductEntityType` (content-related). See `cella/ARCHITECTURE.md`.
- **Entity id columns**: an entity's id-column name (e.g. `organization` → `organizationId`) has ONE source of truth. Never hand-write `` `${type}Id` `` or hardcode `'organizationId'`/`'projectId'`. Use, in order of preference: the `EntityIdColumns<TS, V>` generic (shared) for a "map each entity type → its id column" *type*; `EntityIdColumnKey<T>` for a single key type; `appConfig.entityIdColumnKeys[type]` at runtime. For the root context id use `EntityIdColumnKey<RootChannelType>` / `appConfig.entityIdColumnKeys[rootChannelType]`, not `'organizationId'`. **Exception:** code that walks an *injected or under-construction* hierarchy whose types may not be in the current fork's config (`resolve-row-channel.ts`, `warnMissingAncestors` in cdc, the hierarchy builder itself) keeps `` `${type}Id` `` on purpose (a config lookup would return `undefined`); those sites carry a comment saying so. This keeps forks that rename/restructure entities working without touching engine code.
- **Configuration**: `shared/config/config.default.ts` defines the base config (validated against `RequiredConfig`). Per-deploy overrides (e.g. `config.development.ts`) deep-merge over it, selected by `NODE_ENV`. Check `.env` for secrets and environment variables.
- **Debug mode**: Set `VITE_DEBUG_MODE=true` in `frontend/.env`.
- **Icons**: Import directly from `lucide-react` using modern `*Icon`-suffixed names (`LoaderCircleIcon`, not `Loader2` or `Loader2Icon`; Biome-enforced). Size with classes only: semantic `icon-xs/sm/md/lg/xl` utilities (12-24px equivalents) or `size-*`; NEVER lucide's `size` prop: a global `:where(svg.lucide)` rule overrides its px attributes so icons default to 1rem and scale with the mobile root-font-size bump. Don't combine two `icon-*`/`size-*` classes on one element (tailwind-merge doesn't dedupe the custom utilities). strokeWidth defaults via `LucideProvider` in main.tsx (`appConfig.theme.strokeWidth`); per-icon `strokeWidth` props still override. Custom SVG icons in `frontend/src/modules/common/icons/` carry the `lucide` class to opt into the same defaults. Icon-as-prop declarations (`icon: …` in props/configs) use `IconComponent` from `~/modules/common/icons/types`: it omits `size`, so passing the inert prop is a type error.
- **Migrations**: Codemod sweeps that rewrite a pattern across the codebase ship their tooling in `cella/migrations/<yyyy-mm>-<slug>/`, so forks can run the same sweep on fork-specific code after pulling. See `cella/migrations/README.md`.
- **OpenAPI nullable**: Use `z.union([schema, z.null()])` instead of `schema.nullable()` for named schemas.
- **OpenAPI schema naming**: Only register schemas as named components (`.openapi('Name')`) for whole entity responses or crucial shared base types. Inline enums and request body schemas. Share a single schema when shape is identical across contexts.

## Style & naming
- Formatter/Linter: Biome, configured in `biome.jsonc`. Run `pnpm lint:fix`.
- Indentation: 2 spaces; line width: 100; quotes: single; semicolons: as needed; trailing commas: ES5.
- Zod v4 only: `import { z } from 'zod'`. In backend: `import { z } from '@hono/zod-openapi'`.
- camelCase for variables/functions (including constants), PascalCase for components, kebab-case for files, snake_case for translation keys.
- JSDoc on all exports. Backend: full JSDoc with params/response. Frontend: 1-3 lines. No standalone file-level comments above imports.
- Code comments explain non-trivial logic only. Do not narrate decision history, what was considered and rejected, or how the code evolved; that belongs in commit messages, not source. A comment should describe *what* the code does and *why*, not *what it replaced* or *what it is not*.
- Avoid em dashes in source comments. Split the sentence, use a colon, or remove the secondary clause. Treat contrast, history, and conversational phrases such as `instead`, `rather than`, `previously`, `used to`, `maybe`, and `we should` as review signals. Rewrite useful comments around the current behavior or invariant, and delete the rest.
- Reserve `materialize` and `materialization` for the named Yjs operation that converts collaborative state into durable entity data. Use concrete verbs such as `persist`, `provision`, `create`, or `resolve` elsewhere.
- Storybook: Stories in `stories/` folder within the module, named `<component-filename>.stories.tsx`.
- Icons: lucide with Icon suffix (e.g., `PencilIcon`).
- UI primitives: Base UI (`@base-ui/react`), **not** Radix. Shadcn-style components in `frontend/src/modules/ui/` wrap Base UI primitives.
- Keep existing code comments intact unless cleanup is explicitly requested.
- Console: `console.log` for temp debugging (remove before commit), `console.info` for logging, `console.debug` for dev (stripped in prod).
- Links as buttons: Use `<Link>` with `buttonVariants()` for linkable actions. Allow new-tab opening for URL-targetable sheet content.
- React-compiler: `useMemo`/`useCallback` can be avoided in most cases.
- Translations: All UI text via `useTranslation()` and `t('c:key')`. Never hardcode. Files in `locales/en/`. General translations go in `common.json`, app-specific ones in `app.json`. Both are merged into the `common` namespace at runtime, so always use `t('c:key')`, never `t('app:key')`.

## Testing
- Framework: Vitest. Name tests `*.test.ts`; place near source or under `tests/`.
- See [Testing](/docs/page/guides/testing) for test modes and detailed documentation.

## Deploy debugging
Prod deploys are immutable VM generations on Scaleway (Pulumi + S3 control object), with an LB-overlap cutover gated on the new VM serving `X-App-Version: <SHA>` (`/health` → 204 backend/yjs/ai, 200 frontend). A "cutover unhealthy / wait-for-version timeout" means the new VM's app never bound its port: almost always a **boot-time crash**, not the LB. Debug it densely:
- **First, read the boot logs.** Each VM's boot agent ([infra/agent/src/boot.ts](../infra/agent/src/boot.ts)) starts the app with `docker compose up --wait` (fails the boot if the container exits or never becomes healthy) and uploads the crashed container's stdout/stderr to the `boot-diag/` prefix of the boot-diag bucket. Read it with `pnpm --filter infra diag` (zero-config: derives bucket/region from `appConfig`; `--service backend`, `--list`, `--mode staging`). CI auto-runs this on a failed rollout (`if: failure()` step in [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)).
- **No SSH / no serial-log API.** SecurityGroup drops inbound; the only live channels are the S3 boot-diag above and the Scaleway **web** serial console (`::cella::` markers + `BOOT FAILED (exit N)`).
- **Reproduce locally: fastest oracle.** A build can succeed yet crash at runtime (bundling/env). Pull the exact image tag and `docker run` it with minimal valid env (or `node dist/main.js`); a crash like `ERR_MODULE_NOT_FOUND` surfaces in seconds. macOS keychain blocks `docker login` save → use a throwaway `--config` dir with a base64 `auth`.
- **Common boot-crash classes** (all have bitten prod): backend bundle leaves a workspace dep as a bare external (must be in tsup `noExternal`); multiline secret in a line-based env file; image SHA predates a DB/secret contract change; node-postgres TLS hostname check vs. the dialed IP (`sslmode=require` + host-pinned `checkServerIdentity`); `SecretManagerSecretAccess` missing on the VM reader key (403 on decrypt); instance-type quota too low for create-before-destroy.
- **Validate infra changes** with `pnpm --filter infra exec vitest run` (infra is **Biome-ignored**; match style by hand) and `pnpm check` at the root.

## Commits & PRs
- Use `git` and `gh` CLI. Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`.
- PRs: concise description, linked issues, passing checks. Keep changes scoped.
- Breaking OpenAPI diffs fail the `schema-bust-gate` CI job unless the PR bumps `clientCacheVersion` (or ships a lens module); title such PRs `feat!:` so release-please cuts a major.

## Commands
- `pnpm dev`: Dev with PostgreSQL + CDC Worker (requires Docker).
- `pnpm check`: Runs `sdk` + typecheck + `lint:fix`.
- `pnpm generate`: Create Drizzle migrations from schema changes.
- `pnpm sdk`: Regenerate OpenAPI spec and frontend SDK.
- `pnpm seed`: Seed database with test data.
- `pnpm test`: Run the full test suite and emit summary coverage output. Storybook component tests run separately via `pnpm test:storybook`.
- `pnpm infra`: Manage deployment using Infra CLI: [Infra docs](/docs/page/guides/deployment)
- `pnpm bench`: Run benchmark scenarios: [Bench docs](/docs/page/guides/load-testing)
- `pnpm cella`: CLI to sync with cella and more, provided by `@cellajs/cli`.
- `pnpm story`: Start storybook
