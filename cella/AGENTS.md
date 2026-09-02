# Cella agent guidelines (AGENTS.md)

## Project summary

Cella is a TypeScript template for collaborative web apps with a sync engine for offline and realtime use. Postgres, OpenAPI and react-query are foundational layers.

Base config: [shared/config/config.default.ts](../shared/config/config.default.ts); entity hierarchy and roles: [shared/config/hierarchy-config.ts](../shared/config/hierarchy-config.ts). Both feed `appConfig`, the merged runtime config exposed by `shared`. Every app changes config, hierarchy and permissions, so write entity-agnostic code and never hardcode the default entity set or its roles.

## Before you finish
**Always run `pnpm check` at the repo root after any code change, and only report the work done once it passes clean.** `pnpm check` runs `sdk` regen + typecheck + `lint:fix`: it is the single gate for "is this change sound?". Also run `pnpm generate` if you touched DB schemas. Never claim a change is complete without a clean `pnpm check`; if it fails, fix it or say so explicitly.

## Architecture

Tech stack, file structure, data modeling, security and sync/offline design: [Architecture](/docs/page/architecture).

## Routing

- **Backend (Hono + OpenAPI)**:
  - `backend/src/server.ts`: base app, global middleware, error handler (`appErrorHandler`).
  - Routes: `backend/src/modules/<module>/<module>-routes.ts` using `createXRoute`.
  - Handlers: `backend/src/modules/<module>/<module>-handlers.ts` using `.openapi()` on `OpenAPIHono`.
- **Frontend (TanStack Router, file-based)**:
  - Route files in `frontend/src/routes/`; the router vite plugin registers them into `routeTree.gen.ts` (committed, never hand-edited).
  - Route files are thin shims: path/staticData/glue only. Components and `beforeLoad` logic live in modules (`route-logic.ts`, `route-components.tsx`, `search-params-schemas.ts`) via `getRouteApi('<route id>')`.
  - Layouts: `_public/` (pathless public), `_app/` (pathless authenticated), `_public/_content/` (public content), `_app/$tenantId.$organizationSlug/` (org context). A trailing underscore (`page_.$id.edit.tsx`) opts out of parent component nesting.
  - Router: `frontend/src/routes/router.ts`; shared route helpers: `route-utils.tsx` next to it.

## Middleware & guards

Global chain in `backend/src/middlewares/app.ts`: secureHeaders → OpenTelemetry → observability → Sentry → pino logger → CORS → CSRF → body-limit → gzip.

Route-level guards in `backend/src/middlewares/guard/`:

- `authGuard`: validates the session; sets `ctx.var.user`, `ctx.var.memberships`, `ctx.var.db` (baseDb).
- `tenantGuard`: verifies tenant membership, loads the tenant row; sets `ctx.var.db = baseDb` and `ctx.var.tenantId`.
- `orgGuard`: resolves the organization and verifies membership.
- `publicGuard`: unauthenticated routes; sets `ctx.var.db` to baseDb.
- `crossTenantGuard`: authenticated cross-tenant routes; sets `ctx.var.db = baseDb`, handlers use `tenantRead()` for product entity queries.
- Also: `sysAdminGuard`, `relatableGuard`.

### Database access patterns

- **Product entity handlers** wrap reads in `tenantRead(ctx, fn)` (RLS-scoped SELECT) and writes in `tenantContext(ctx, fn)` (read-write transaction; sets RLS session vars so internal SELECTs/RETURNING pass; write authorization stays with guards, permissions, FKs and triggers), both from `backend/src/db/tenant-context.ts`.
- **Channel entity handlers** use `ctx.var.db` (baseDb) directly, no RLS.

Read/write boundary and table categories: [Multi-tenancy](./MULTI_TENANCY.md).

## Error handling

`AppError` is the structured error class: `status`, `type` (i18n key from `locales/en/error`), `severity`, `entityType`, `meta`. PostgreSQL error codes map automatically (FK violation → 400, unique constraint → 409, RLS denial → 403, deadlock → 409).

## Auth

Five sub-modules in `backend/src/modules/auth/`: `general/` (session, cookies, MFA, verification emails), `magic/`, `oauth/`, `passkeys/` (WebAuthn), `totps/` (TOTP 2FA). Sessions: `general/helpers/session.ts`; cookies: `general/helpers/cookie.ts`.

## Permissions

`backend/src/permissions/` exposes `checkAccess`, `checkAccessBatch` (one actor, many subjects) and `checkAccessFanout` (many actors, one subject), all taking an `Access` from `accessFrom(ctx)` and returning `PermissionResult`, plus `canCreateEntity`, `getValidChannel`, `getValidProduct` and `splitByPermission`. `configurePermissions()` defines the policy matrix; each cell is `1` (allowed), `0` (denied) or `'own'` (only when `entity.createdBy === userId`). Frontend: `computeCan()` yields `true | false | 'own'`; resolve `'own'` per entity with `resolveCan()` from `shared`. Naming: Access is the input (who is asking), Policy the configured matrix, Permission the engine's verdict, Grant the recorded reason (`grantedBy`). Decision model: [Permissions](./PERMISSIONS.md); database backstop: [Multi-tenancy](./MULTI_TENANCY.md).

## State & API

- **Server state**: TanStack Query (`offlineFirst` network mode, IndexedDB persistence via `PersistQueryClientProvider`). Query options/keys/mutations in `frontend/src/modules/<module>/query.ts`. Registered, serializable paused mutations replay best-effort after reload. Model: [Client](./CLIENT.md).
- **Client state**: Zustand stores as `*-store.ts` inside their module. Prefer Zustand over React context; context only for tree-local composition of compound UI (`Carousel`, `Select`, `Stepper`) or third-party providers, never for app/feature state.
- **Persistence boundaries**: server entities → React Query cache (global persister); local UI selections/preferences → Zustand `persist` (`navigation-store`, `ui-store`). Never call `localStorage` directly from hooks/components. Never mirror entities into Zustand. All per-user client state (Zustand kv, query cache, attachment blobs, failed-sync) lives in ONE IndexedDB per user, `${appConfig.slug}:${userId}` (`frontend/src/query/local-user-db.ts`, lifecycle in `local-user-storage.ts`); only the bootstrap stores `ui-store`/`user-store` stay in localStorage. New per-user stores: `idbKvStorage('<base>')` + `skipHydration: true`, registered in `local-user-storage.ts` (app-owned: `extra-local-user-stores.ts`). Tenant/org/entity scoping goes inside state (`Record<\`${tenantId}:${orgId}\`, T>`), never in the key.
- **API client**: generated SDK in `sdk/gen/`, consumed from the `sdk` workspace package. **Never modify manually**; run `pnpm sdk` after backend route/schema changes.
- **Frontend membership enrichment**: backend channel-entity responses may include `included.membership` for external API clients. Frontend code uses it only to seed `meKeys.memberships`; `entity.membership` comes from the enrichment pipeline. Never flatten `included.membership` onto entities or read `entity.included.membership` in UI, cache mutations or feature logic.
- **DB schemas**: Drizzle tables live in module `*-db.ts` files, registered as lazy getters in the pinned `backend/src/db/channel-tables.ts` or `product-tables.ts` (`tables.ts` derives `entityTables` from both). Run `pnpm generate` for migrations. Entity IDs use UUID v7 (via `uuidv7`); nanoid only where short IDs are needed (tenant IDs) or longer IDs are required.
- **API validation**: Zod schemas in `backend/src/modules/<module>/<module>-schema.ts` (`@hono/zod-openapi`); shared base schemas in `backend/src/schemas/`.
- **Frontend types**: generated in `sdk/gen/`, imported from `sdk`; module-specific types in `frontend/src/modules/<module>/types.ts`.
- Types are inferred from Zod schemas (`z.infer`). Avoid `as` assertions; prefer `Object.assign`, `satisfies` or `as const`. **Never use `as unknown as`** without explicit permission; first try `isNull()` over `eq(col, null as unknown as T)`, `Object.assign` over casting augmented functions, generic type parameters over widening, or a dedicated type. If none applies (library type gap, test mocks), add an inline comment saying why.

### Query infrastructure patterns

- **Query keys**: `createEntityKeys<Filters>('myEntity')`, registered with `registerEntityQueryKeys('myEntity', keys)` in the module's `query.ts`. Keys follow `[entityType, 'list'|'detail', ...]`.
- **Optimistic updates**: `mutateQueryData(queryKey)` for cache mutations; `createOptimisticEntity(zodSchema, overrides)` for placeholders (fills IDs, timestamps, Zod defaults).
- **Invalidation**: `invalidateIfLastMutation(queryClient, mutationKey, queryKey)` in `onSettled` avoids over-invalidation with concurrent mutations.
- **Mutation registry**: in each entity's `query.ts`, `addMutationRegistrar((qc) => { qc.setMutationDefaults(keys.create, { mutationFn: ... }) })` so paused offline mutations resume after reload.
- **Enrichment**: channel entity list items get `item.membership`, `item.can` and `item.ancestorSlugs` from a QueryCache subscriber in `frontend/src/query/enrichment/`; needs only registered query keys.
- **Slug resolution**: `fetchSlugCacheId(fetcher, cacheKey)` resolves slug routes to IDs, cached under the entity's detail key.

## OpenAPI & mocks

**Extension system** in `backend/src/core/`:

- `x-middleware.ts`: wrap guards/limiters/caches with `xMiddleware(options, fn)` so they appear in the spec and docs UI; `setMiddlewareExtension` for composed middleware.
- `x-routes.ts`: always `createXRoute`, never `createRoute`. Props: `xGuard` (required), `xRateLimiter`, `xCache`.
- `extensions-config.ts`: new `x-*` extension types go here.
- `docs.ts`: builds the spec, writes `openapi.cache.json`, mounts Scalar at `/docs`.
- Frontend: the openapi-parser plugin (`sdk/src/plugins/openapi-parser/`) writes generated docs, served by Vite at `/static/docs.gen/`; the docs UI is the frontend docs module.

**Mocks** in `backend/src/mocks/`:

- Per entity: **insert mocks** (`mockUser()` → `Insert*Model`) and **response mocks** (`mockUserResponse()`, deterministic via `withFakerSeed`).
- OpenAPI examples: pass `mockXResponse()` to `.openapi('Name', { example })` and route `example:`.
- Seeding (`backend/scripts/seeds/`): `setMockContext('script')` + `mockMany(mockEntity, count)`.
- Tests: insert mocks via `backend/tests/helpers.ts`; `resetXMockEnforcers()` in cleanup.
- Utils: `mockMany()`, `mockPaginated()`, `mockTimestamps()`, `mockPastIsoDate()`, `generateMockChannelIdColumns()` (all configured context columns) / `generateMockEntityChannelIdColumns()` (one product entity's columns).

## Sync engine

Model: [Sync engine](./SYNC_ENGINE.md).

- **Stx helpers** (`frontend/src/query/offline/`): `createStxForCreate()`, `createStxForUpdate()`, `createStxForDelete()` build sync transaction metadata from the cached entity version.
- **Conflict detection**: `checkFieldConflicts()` compares per-field versions; `isTransactionProcessed()` checks idempotency via the `activities` table.
- **Realtime backend** (`backend/src/modules/entities/stream/`): `activityBus` → `createStreamDispatcher()` → `streamSubscriberManager` (SSE fan-out). `CdcWebSocketServer` accepts the CDC worker on `/internal/cdc`.
- **Realtime frontend** (`frontend/src/query/realtime/`): `AppStream`, authenticated, leader-tab coordinated (Web Locks + BroadcastChannel), echo prevention via `stx.sourceId`, catchup through declared views over the org sequence.
- **Seen-by tracking**: `IntersectionObserver` marks entities seen; a Zustand store batches IDs, flushes on timer + `sendBeacon` on unload, persists flushed IDs in `localUserDb` (`kv` table); unseen badges decrement optimistically in the query cache. Backend: `seen_by` (one row per user+product), `product_counters` (denormalized counts).
- **Product cache**: CDC-invalidated in-memory cache in `backend/src/middlewares/product-cache/`; `coalesce()` deduplicates concurrent fetches.
- **Sync signals** (`frontend/src/query/realtime/sync-signals.ts`): the only extension point for per-user state derived from sync. `onChangeEvent` fires for every readable notification before any tier decision (muted and archived channels included), ids only. `onSyncedRows` fires once a range has settled with the rows, or an empty `degraded` batch meaning invalidate instead of derive. App modules subscribe here; never import module logic into the prioritizer.
- **Server-driven writes** (CDC fan-out, materialization, scheduled jobs) must strip the client's `changedFields` from the stored `stx`, else the CDC worker attributes the write to the wrong columns (absent key = WAL diff): `stripChangedFields` (`backend/src/db/utils/strip-changed-fields.ts`) or `stripChangedFieldsStx` in the CDC worker.
- **Schema evolution (lenses)**: breaking wire-shape changes to product entities ship as append-only lens modules in `shared/src/schema-evolution/`; never edit a shipped module. Until the first lens ships, bump `appConfig.clientCacheVersion` in the same PR as any breaking change to a cached entity's wire shape (`schema-bust-gate` CI enforces it). Playbook: [Schema evolution](/docs/page/architecture/schema-evolution).
- **Lens helpers (new entity modules)**: `createUpdateSchema(entityType, shape)` for update bodies, `widenBodySchema(entityType, schema)` for create bodies, `resolveUpdateOps(entityType, …)` for updates, `normalizeCreateItem(entityType, item)` for create items. Skipping them breaks version tolerance for that entity.

## Cross-product references

Relationships between products are data, never permission indirection (permissions and public read flow through the hierarchy's channel columns). Exactly two mechanisms:

1. **`productEmbeddings` host id arrays**: an id array column on the host product's table, declared in `appConfig.productEmbeddings`. All embedding machinery (CDC cleanup, owned-embedding GC, ref counters, SSE propagation hints, client cache patching) is config-driven; engine code never changes. `lifecycle: 'shared'` (default): embedded rows live independently, dead references are stripped from hosts. `lifecycle: 'owned'`: the CDC worker soft-deletes rows no live host references.
2. **The mutation bus** (`defineBackendModule` + `onMutation`/`dispatchMutation`): lifecycle side effects an embedding cannot express (e.g. seeding rows on `project.created`). Handlers run synchronously, optionally inside the write transaction.

A child-side host FK (nullable `<host>Id` column on one product pointing at another) is deprecated: invisible to sync views, CDC, propagation hints and counters. Conversion guide: `cella/migrations/20260730T1009-owned-host-embedding/`.

## Coding patterns

- **Entities**: `ChannelEntityType` (has memberships) and `ProductEntityType` (content). See `cella/ARCHITECTURE.md`.
- **Frontend modules & placements**: every `frontend/src/modules/<name>/` folder registers itself in `<name>-module.ts` (`.tsx` when tools render JSX) via `defineFrontendModule` (`~/lib/module`); `frontend/src/modules.ts` glob-imports these before first render. A **tool** is a component placed into a **slot**; the **consumer** is the page hosting the slot. Modules declare `tools`; consumers read `getTools(slot)` (typed by `SlotContexts`; `getChannelSettingsTools(channelType)` for channels) and resolve with `resolvePlacementList`. Slot families: `` `${channelType}.settings` ``, `` `${channelType}.tabs` ``, `account.settings`, `home.sections`, `user.profile` (profile page body) and the non-entity `system.tabs`. A tool's `render` returns the slot's full content unit (lazy-load heavy UI); a channel tool's entity context is the `ChannelEntityByType` interface (apps widen it via module augmentation). Gating: `requires` names a grant; `visibleTo` lists context-role pairs like `'organization.admin'` (matched over the ancestor chain via `heldContextRoles(entity, memberships)`, or `heldContextRoles(memberships)` for non-entity pages; a UI boundary only, never data authorization). Arrangement layers, in order: manifest defaults, app overrides in `frontend/src/placement-config.ts` (pinned), then the channel row's `toolsConfig` jsonb (per-slot `order`/`hidden`/`settings`, reconciled fail-closed: unknown ids drop, new tools append at default order; `locked` tools ignore channel hiding). Page tabs: `resolveNavTabs` merges child routes declaring `staticData.navTab` (a `PlacementDescriptor`) with the `.tabs` tools of the slot named in the layout route's `staticData.tabsSlot` into one gated, ordered bar. Entity links target the layout route tab-less; its `beforeLoad` calls `guardNavTabs` (redirects to `defaultTabId`, else the first visible tab; forwards navigations aimed at a disabled tab). A settings slot costs its forms, one `channelSettingsTools(...)` call and a `<ChannelSettingsPage entity={...} />` route; a tabs slot costs a one-line `$tool` route (`SlotTabHost`) plus its `.tabs` tools. Shells: `ToolCard` (`modules/common`), `ToolsArrangementCard` (`modules/entities`); the danger-zone tool lives inside `channelSettingsTools`.
- **Entity id columns**: the hierarchy is the ONE source of truth for id-column names (`organization` → `organizationId`). Never hand-write `` `${type}Id` `` or hardcode `'organizationId'`/`'projectId'`. Prefer, in order: `EntityIdColumns<TS, V>` (shared) for an entity-type → id-column map _type_; `EntityIdColumnKey<T>` for one key type; `appConfig.entityIdColumnKeys[type]` or `entityIdColumnKey(type)` / `entityIdColumnName(type)` at runtime. Root channel id: `EntityIdColumnKey<RootChannelType>` / `appConfig.entityIdColumnKeys[rootChannelType]`, not `'organizationId'`. Row-location logic and entity-kind guards (`isChannel`, `isProduct`, `getRoles`, `hierarchy.resolveDeepestAncestorId`, `hierarchy.computeProductPath`, `hierarchy.pathColumnSql`, ...) are bound arrow methods on `EntityHierarchy` (destructuring keeps `this`), no free-function twin. `shared` re-exports the singleton's `isChannel`/`isProduct` as aliases, so a `vi.mock('shared')` factory replacing `hierarchy` must also override `isChannel: h.isChannel, isProduct: h.isProduct`. Injectable-hierarchy parameters are typed `EntityHierarchy`, defaulting to the app singleton (`options.hierarchy` on permission checks).
- **Configuration**: `shared/config/config.default.ts` is the base config (validated against `RequiredConfig`); per-deploy overrides (`config.development.ts`) deep-merge over it, selected by `NODE_ENV`. Secrets: `.env`.
- **Debug mode**: `VITE_DEBUG_MODE=true` in `frontend/.env`.
- **Icons**: import from `lucide-react` with `*Icon`-suffixed names (`LoaderCircleIcon`, not `Loader2`/`Loader2Icon`; Biome-enforced). Size with classes only: `icon-xs/sm/md/lg/xl` (12-24px) or `size-*`; NEVER lucide's `size` prop (a global `:where(svg.lucide)` rule overrides its px attributes). Never combine two `icon-*`/`size-*` classes on one element (tailwind-merge does not dedupe them). strokeWidth defaults via `LucideProvider` in main.tsx (`appConfig.theme.strokeWidth`); per-icon `strokeWidth` overrides. Custom SVG icons in `frontend/src/modules/common/icons/` carry the `lucide` class. Icon-as-prop declarations use `IconComponent` from `~/modules/common/icons/types` (omits `size`).
- **Migrations** (`cella/migrations/<YYYYMMDDThhmm>-<slug>/`, see `cella/migrations/README.md`): the UTC-minute timestamp is the stable id and sort key; the target cella `version` lives in `manifest.json` (per folder: `kind`, `syncBreaking`, `clientCacheBump`, `script`, `roots`, `requires`), never in the folder name, so folders are never renamed.
  - **Authoring:** every sync-breaking change (codemod sweep, schema shift, renamed contract) adds a folder (from `_TEMPLATE.md`) plus its manifest entry in the same PR; `syncBreaking` with no migration counts as a missing `clientCacheVersion` bump.
  - **Applying (apps):** `pnpm exec tsx cella/migrations/run.ts` diffs the manifest against `cella/cella.migrations.json` and prints the plan; the `migrate` skill (`cella/skills/migrate/SKILL.md`) drives apply → `pnpm check` → `run.ts mark <id>`.
- **Syncing (apps)**: the `cella-sync` skill (`cella/skills/cella-sync/SKILL.md`) drives `pnpm cella sync` / `pnpm cella analyze`: conflict triage, silent-damage sweep, migration bookkeeping, drift triage.
- **Skills**: `cella/skills/` is the single home for agent skills (synced to apps). Claude Code only discovers `.claude/skills` (gitignored): `ln -s ../cella/skills .claude/skills`.
- **Sync markers (apps)**: mark every intentional edit in a template-owned file with a marker comment (syntax in the `cella-sync` skill), one per contiguous edit, naming the customization axis, not the diff. JSON cannot carry markers: pin or ignore changed JSON. Unmarked drift counts as accidental.
- **OpenAPI nullable**: `z.union([schema, z.null()])`, never `schema.nullable()`, for named schemas.
- **OpenAPI schema naming**: register named components (`.openapi('Name')`) only for whole entity responses or crucial shared base types. Inline enums and request body schemas. Share one schema when the shape is identical across contexts.

## Style & naming

- Biome (`biome.jsonc`); run `pnpm lint:fix`.
- Indentation 2 spaces; line width 100; single quotes; semicolons as needed; trailing commas ES5.
- Zod v4 only: `import { z } from 'zod'`; backend: `import { z } from '@hono/zod-openapi'`.
- camelCase variables/functions (constants included), PascalCase components, kebab-case files, snake_case translation keys.
- JSDoc: backend exports get full JSDoc with params/response. Frontend exports get one line, and none when identifier and types already carry the meaning (`useAttachmentDeleteMutation` earns one: it also cancels paused offline creates). No file-level comments above imports. A comment longer than three prose lines must document a declaration or local executable block; cross-file architecture, workflows and failure-mode narratives go to the nearest canonical README.
- Comments explain non-trivial logic only: _what_ and _why_, never decision history, rejected alternatives or _what it replaced_.
- **Comment budget:**
  - **Members**: one line when name and type underdetermine the contract (default, constraint, unit or encoding, null/empty condition, population source), and always for `unknown`, `any` or a bare `string`/`number`/`boolean`. Drop it when a named type carries the meaning (`items: FloatingNavItem[]`) or default and behavior are visible in the same file.
  - **Locals and JSX**: one line of rationale for a local (two lines means rename or extract). JSX keeps the constraint only: `{/* min-h-14 matches the bar row so the grid holds position */}`; measurement and motivation go in the commit.
  - **No repeats**: the same comment text never appears in two files. Put it once at the shared abstraction or delete every copy.
- **Never use em dashes (`—`, U+2014) anywhere in text** (code, YAML, config, docs). Split the sentence, use a colon, or drop the clause; `shared/scripts/check-comment-style.ts` (in `pnpm check`) fails the build on any em dash. Contrast and history phrases (`instead`, `rather than`, `previously`, `used to`, `maybe`, `we should`) are review signals: rewrite around the current behavior, delete the rest.
- **Agent-associated vocabulary**: name the concrete behavior. Replace `load-bearing` with the dependency, requirement or failure consequence it abbreviates. `seam`, `land`, `surface` as a verb, `wiring`, `scaffold`, `floor`, `decisive`, `genuinely`, `cleanly`, `honest take` and `silently` are review signals; prefer the exact term (boundary, merge, report, registration, minimum, the missing error). Keep exact domain terms (`canonical`, `idempotent`, `parity`, `guard`, `stale`, `round-trip`, `fallback`, `authoritative`, `verdict`). Never rename identifiers, files, APIs or domain concepts for prose style. `pnpm prose:audit` reports review terms; required replacements fail `pnpm docs:style` (generated output, migrations, changelog, `infra/` excluded).
- **Template/app vocabulary**: `template` for Cella; `app`, `app-owned` or `app-specific` for projects built from it; `sync-breaking` for an upstream change that requires app work after a sync. The Cella CLI keeps its source-control term in `cella/cella.config.ts`; compatibility migrations may name legacy identifiers they replace.
- `materialize`/`materialization` only for the Yjs operation that converts collaborative state into durable entity data; elsewhere `persist`, `provision`, `create` or `resolve`.
- **Prefer plain composable functions over configuration factories.** `createX(config)` returning behavior is justified only to bind long-lived shared state for many call sites (e.g. mutation options bound to a QueryClient); otherwise write a small function with explicit arguments.
- **Reserved domain vocabulary.** These words name a subsystem; never reuse them:
  - `sync` -> the entity sync engine (`sync-store`, `sync-service`, `SyncTier`, `syncStaleTime`, `declareSyncView`).
  - `schema` / `lens` -> schema evolution (`currentSchemaVersion`, `defineLens`, `markBundleStale`).
  - `channel` -> channel entities (`ChannelEntityType`, `channelId`); not a transport or a `BroadcastChannel`.
  - `own` / `owner` -> the permission engine's creator relation.
  - `tool` / `slot` / `consumer` -> UI placements (`defineFrontendModule` tools, `toolsConfig`, `visibleTo`); an MCP tool is always written "MCP tool".
  - `leader tab` / `election` -> cross-tab coordination of the single SSE connection (`tab-coordinator`).
  Name modules for their domain role, not the primitive underneath (`tab-coordinator`, not `leader-lease`). When splitting a module, name the remainder deliberately, never payload plus generic verb.
- **Docs headings**: `##` headings in `frontend/src/content/docs/**` and in any `.md` those pages import (`cella/*.md`, `bench/README.md`, `cdc/README.md`, `infra/README.md`, `yjs/README.md`) max out at 25 rendered characters (the aside truncates longer ones). Measure rendered text, not markup. Only `##` is affected; `cella/CHANGELOG.md` is exempt.
- Storybook: stories in `stories/` inside the module, named `<component-filename>.stories.tsx`.
- UI primitives: Base UI (`@base-ui/react`), **not** Radix. Shadcn-style components in `frontend/src/modules/ui/` wrap Base UI.
- Keep existing comment content intact unless cleanup is explicitly requested; trimming to the comment budget is always in scope (an over-budget comment is a defect).
- Console: `console.log` for temp debugging (remove before commit), `console.info` for logging, `console.debug` for dev (stripped in prod).
- Links as buttons: `<Link>` with `buttonVariants()` for linkable actions. Allow new-tab opening for URL-targetable sheet content.
- React compiler: `useMemo`/`useCallback` are rarely needed.
- Translations: all UI text via `useTranslation()` and `t('c:key')`, never hardcoded. Files in `locales/en/`: general keys in `common.json`, app-specific in `app.json`; both merge into the one `c` namespace, so never `t('app:key')` or `t('common:key')`. `app.json` is app-owned and never synced, so every key a template component reads lives in `common.json` (apps override from `app.json`).

## Testing

- Vitest. Name tests `*.test.ts`; place near source or under `tests/`.
- Test modes: [Testing](/docs/page/guides/testing).

## Deploy debugging

Prod deploys are immutable VM generations on Scaleway (Pulumi + S3 control object); the LB-overlap cutover waits for the new VM to serve `X-App-Version: <SHA>` (`/health` → 204 backend/yjs/mcp, 200 frontend). "cutover unhealthy / wait-for-version timeout" means the app never bound its port: almost always a **boot-time crash**, not the LB.

1. **Read the boot logs first.** The boot runner ([infra/boot/src/boot.ts](../infra/boot/src/boot.ts)) runs `docker compose up --wait` and uploads a crashed container's stdout/stderr to the `boot-diag/` prefix of the boot-diag bucket. Read it with `pnpm --filter infra diag` (`--service backend`, `--list`, `--mode staging`, `--replay`). [infra/tasks/deploy-run.ts](../infra/tasks/deploy-run.ts) runs it automatically on rollout failure.
2. **No SSH, no serial-log API.** SecurityGroup drops inbound; the only channels are the S3 boot-diag above and the Scaleway **web** serial console (`::cella::` markers + `BOOT FAILED (exit N)`).
3. **Reproduce locally.** Pull the exact image tag and `docker run` it with minimal valid env (or `node dist/main.js`); runtime crashes (`ERR_MODULE_NOT_FOUND`) show in seconds. macOS keychain blocks `docker login` save: use a throwaway `--config` dir with a base64 `auth`.
4. **Common boot-crash classes**: workspace dep left as a bare external (must be in tsup `noExternal`); multiline secret in a line-based env file; image SHA predates a DB/secret contract change; node-postgres TLS hostname check vs. the dialed IP (`sslmode=require` + host-pinned `checkServerIdentity`); `SecretManagerSecretAccess` missing on the VM reader key (403 on decrypt); instance-type quota too low for create-before-destroy.
5. **Validate infra changes** with `pnpm --filter infra exec vitest run` (infra is **Biome-ignored**; match style by hand) and `pnpm check` at the root.

## Commits & PRs

- Use `git` and `gh` CLI. Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`.
- PRs: concise description, linked issues, passing checks, scoped changes.
- Breaking OpenAPI diffs fail the `schema-bust-gate` CI job unless the PR bumps `clientCacheVersion` (or ships a lens module); title such PRs `feat!:` so release-please cuts a major.

## Commands

- `pnpm dev`: Dev with PostgreSQL + CDC Worker (requires Docker).
- `pnpm check`: Runs `sdk` + typecheck + `lint:fix`.
- `pnpm generate`: Create Drizzle migrations from schema changes.
- `pnpm sdk`: Regenerate OpenAPI spec and frontend SDK.
- `pnpm seed`: Seed database with test data.
- `pnpm test`: Run the full test suite with summary coverage; Storybook component tests run separately via `pnpm test:storybook`.
- `pnpm infra`: Infra CLI for deployment: [Infra docs](/docs/page/guides/deployment)
- `pnpm bench`: Run benchmark scenarios: [Bench docs](/docs/page/guides/load-testing)
- `pnpm cella`: Sync with cella and more (`@cellajs/cli`).
- `pnpm story`: Start storybook
