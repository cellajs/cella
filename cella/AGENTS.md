# Cella agent guidelines (AGENTS.md)

## Project summary

Cella is a TypeScript template for collaborative web apps with a sync engine for offline and realtime use. Postgres, OpenAPI and react-query are foundational layers.

Base config: [shared/config/config.default.ts](../shared/config/config.default.ts). Entity hierarchy and roles: [shared/config/hierarchy-config.ts](../shared/config/hierarchy-config.ts). Both feed `appConfig`, the merged runtime config exposed by `shared`. Every app changes config, hierarchy and permissions, so write entity-agnostic code and never hardcode the default entity set or its roles. Mode overrides: [shared/README.md](../shared/README.md). Secrets: `.env`. Entity kinds: [Architecture](./ARCHITECTURE.md).

## Before you finish
**Always run `pnpm check` at the repo root after any code change, and only report the work done once it passes clean.** Also run `pnpm generate` if you touched DB schemas. If `pnpm check` fails, fix it or say so explicitly.

## Architecture

Tech stack, file structure, data modeling, security and sync/offline design: [Architecture](/docs/page/architecture).

## Routing

- **Backend (Hono + OpenAPI)**:
  - `backend/src/server.ts`: base app, global middleware, error handler (`appErrorHandler`).
  - Routes: `backend/src/modules/<module>/<module>-routes.ts` using `createXRoute`.
  - Handlers: `backend/src/modules/<module>/<module>-handlers.ts` using `.openapi()` on `OpenAPIHono`.
- **Frontend (TanStack Router, file-based)**:
  - Route files in `frontend/src/routes/`. The router vite plugin registers them into `routeTree.gen.ts` (committed, never hand-edited).
  - Route files are thin shims: path/staticData/glue only. Components and `beforeLoad` logic live in modules (`route-logic.ts`, `route-components.tsx`, `search-params-schemas.ts`) via `getRouteApi('<route id>')`.
  - Layouts: `_public/` (pathless public), `_app/` (pathless authenticated), `_public/_content/` (public content), `_app/$tenantId.$organizationSlug/` (org context). A trailing underscore (`page_.$id.edit.tsx`) opts out of parent component nesting.
  - Router: `frontend/src/routes/router.ts`. Shared route helpers: `-route-utils.tsx` next to it.

## Middleware & guards

Global chain in `backend/src/middlewares/app.ts`: log context → referrer override → secureHeaders → OpenTelemetry → pino logger → CSRF → client version → dynamic body-limit → gzip (GET only). No CORS middleware: the API is same-origin.

Route-level guards in `backend/src/middlewares/guard/`:

- `authGuard`: validates the session and sets `ctx.var.user`, `ctx.var.memberships`, `ctx.var.db` (baseDb).
- `tenantGuard`: verifies tenant membership, loads the tenant row, and sets `ctx.var.db = baseDb` and `ctx.var.tenantId`.
- `orgGuard`: resolves the organization and verifies membership.
- `publicGuard`: unauthenticated routes. Sets `ctx.var.db` to baseDb.
- `crossTenantGuard`: authenticated cross-tenant routes. Sets `ctx.var.db = baseDb`. Handlers use `tenantRead()` for product entity queries.
- Also: `sysAdminGuard`, `relatableGuard`.

### Database access patterns

- Product entity handlers use the tenant helpers in `backend/src/db/tenant-context.ts`. Channel entity handlers use `ctx.var.db` (baseDb).

Read/write boundary and table categories: [Multi-tenancy](./MULTI_TENANCY.md).

## Error handling

`AppError` is the structured error class: `status`, `type` (i18n key from `locales/en/error`), `severity`, `entityType`, `meta`, `willRedirect`. PostgreSQL error codes map automatically (FK violation → 400, unique constraint → 409, RLS denial → 403, deadlock → 409).

## Auth

Five sub-modules in `backend/src/modules/auth/`: `general/` (session, cookies, MFA, verification emails), `magic/`, `oauth/`, `passkeys/` (WebAuthn), `totps/` (TOTP 2FA). Sessions: `general/helpers/session.ts`. Cookies: `general/helpers/cookie.ts`.

## Permissions

Every check takes an `Access` from `accessFrom(ctx)`. Never assemble one by hand. The frontend `can` map shapes the interface only, the backend is authoritative. Decision model, helper family, and enforcement paths: [Permissions](./PERMISSIONS.md). Database backstop: [Multi-tenancy](./MULTI_TENANCY.md).

## State & API

- **Server state**: TanStack Query (`offlineFirst` network mode, IndexedDB persistence via `PersistQueryClientProvider`). Query options/keys/mutations in `frontend/src/modules/<module>/query.ts`. Model: [Client](./CLIENT.md).
- **Client state**: Zustand stores as `*-store.ts` inside their module. Prefer Zustand over React context. Use context only for tree-local composition of compound UI (`Carousel`, `Select`, `Stepper`) or third-party providers, never for app/feature state.
- **Persistence boundaries**: server entities → React Query cache (global persister). Local UI selections/preferences → Zustand `persist` (`navigation-store`, `ui-store`). Never call `localStorage` directly from hooks/components. Never mirror entities into Zustand. All per-user client state (Zustand kv, query cache, attachment blobs, failed-sync) lives in ONE IndexedDB per user, `${appConfig.slug}:${userId}` (`frontend/src/query/local-user-db.ts`, lifecycle in `local-user-storage.ts`). Only the bootstrap stores `ui-store`/`user-store` stay in localStorage. New per-user stores: `idbKvStorage('<base>')` + `skipHydration: true`, registered in `local-user-storage.ts` (app-owned: `extra-local-user-stores.ts`). Tenant/org/entity scoping goes inside state (`Record<\`${tenantId}:${orgId}\`, T>`), never in the key.
- **API client**: generated SDK in `sdk/gen/`, consumed from the `sdk` workspace package. **Never modify manually**. Run `pnpm sdk` after backend route/schema changes.
- **Frontend membership enrichment**: backend channel-entity responses may include `included.membership` for external API clients. Frontend code uses it only to seed `meKeys.memberships`. `entity.membership` comes from the enrichment pipeline. Never flatten `included.membership` onto entities or read `entity.included.membership` in UI, cache mutations or feature logic.
- **DB schemas**: Drizzle tables live in module `*-db.ts` files, registered as lazy getters in the pinned `backend/src/db/channel-tables.ts` or `product-tables.ts` (`backend/src/tables.ts` derives `entityTables` from both). Entity IDs use UUID v7 (via `uuidv7`). Use nanoid only where short IDs are needed (tenant IDs) or longer IDs are required.
- **API validation**: Zod schemas in `backend/src/modules/<module>/<module>-schema.ts` (`@hono/zod-openapi`). Shared base schemas live in `backend/src/schemas/`.
- **Frontend types**: generated in `sdk/gen/`, imported from `sdk`. Module-specific types live in `frontend/src/modules/<module>/types.ts`.
- Types are inferred from Zod schemas (`z.infer`). Avoid `as` assertions. Prefer `Object.assign`, `satisfies` or `as const`. **Never use `as unknown as`** without explicit permission. First try `isNull()` over `eq(col, null as unknown as T)`, `Object.assign` over casting augmented functions, generic type parameters over widening, or a dedicated type. If none applies (library type gap, test mocks), add an inline comment saying why.

### Query infrastructure patterns

- **Query keys**: `createEntityKeys<Filters>('myEntity')`, registered with `registerEntityQueryKeys('myEntity', keys)` in the module's `query.ts`. Keys follow `[entityType, 'list'|'detail', ...]`.
- **Optimistic updates**: `cacheCreate` / `cacheUpdate` / `cacheRemove` (`frontend/src/query/basic/cache-mutations.ts`) for cache mutations. Use `createOptimisticEntity(zodSchema, overrides)` for placeholders (fills IDs, timestamps, Zod defaults).
- **Invalidation**: `invalidateIfLastMutation(queryClient, mutationKey, queryKey)` in `onSettled` avoids over-invalidation with concurrent mutations.
- **Mutation registry**: in each entity's `query.ts`, `addMutationRegistrar((qc) => { qc.setMutationDefaults(keys.create, { mutationFn: ... }) })` so paused offline mutations resume after reload.
- **Enrichment** (`frontend/src/query/enrichment/`): [Client](./CLIENT.md#subscribers).
- **Slug resolution**: `fetchSlugCacheId(fetcher, cacheKey)` resolves slug routes to IDs, cached under the entity's detail key.

## OpenAPI & mocks

**Extension system** in `backend/src/core/`:

- `x-middleware.ts`: wrap guards/limiters/caches with `xMiddleware(options, fn)` so they appear in the spec and docs UI. Use `setMiddlewareExtension` for composed middleware.
- `x-routes.ts`: always `createXRoute`, never `createRoute`. Props: `xGuard` (required), `xRateLimiter`, `xCache`.
- `openapi-extensions.ts`: new `x-*` extension types go here.
- `openapi-registration.ts`: builds the spec and writes `openapi.cache.json`.
- Frontend: the openapi-parser plugin (`sdk/src/plugins/openapi-parser/`) writes generated docs, served by Vite at `/static/docs.gen/`. The docs UI is the frontend docs module.

**Mocks** in `backend/src/mocks/`:

- Per entity: **insert mocks** (`mockUser()` → `Insert*Model`) and **response mocks** (`mockUserResponse()`, deterministic via `withFakerSeed`).
- OpenAPI examples: pass `mockXResponse()` to `.openapi('Name', { example })` and route `example:`.
- Seeding (`backend/scripts/seeds/`): `setMockContext('script')` + `mockMany(mockEntity, count)`.
- Tests: insert mocks via `backend/tests/helpers.ts`. Call `resetXMockEnforcers()` in cleanup (`backend/tests/test-utils.ts`).
- Utils: `mockMany()`, `mockPaginated()`, `mockTimestamps()`, `mockPastIsoDate()`, `generateMockChannelIdColumns()` (all configured context columns) / `generateMockEntityChannelIdColumns()` (one product entity's columns).

## Sync engine

Model: [Sync engine](./SYNC_ENGINE.md).

- **Stx helpers** (`frontend/src/query/offline/`): `createStxForCreate()`, `createStxForUpdate()`, `createStxForDelete()` build sync transaction metadata from the cached entity version. Idempotency runs through `isTransactionProcessed()` (`backend/src/utils/idempotency.ts`) against the `activities` table.
- **Realtime backend**: `activityBus` (`backend/src/lib/activity-bus.ts`) → `createStreamDispatcher()` → `streamSubscriberManager` (`backend/src/modules/entities/stream/`, SSE fan-out). `CdcWebSocketServer` (`backend/src/lib/cdc-websocket.ts`) accepts the CDC worker on `/internal/cdc`.
- **Seen-by tracking**: `IntersectionObserver` marks entities seen. A Zustand store batches IDs, flushes on timer + `sendBeacon` on unload, persists flushed IDs in `localUserDb` (`kv` table). Unseen badges decrement optimistically in the query cache. Backend: `seen_by` (one row per user+product), `product_counters` (denormalized counts).
- **Product cache** (`backend/src/middlewares/product-cache/`): [Sync engine](./SYNC_ENGINE.md#detail-cache).
- **Sync signals** (`frontend/src/query/realtime/sync-signals.ts`): the only extension point for sync-derived per-user state. Never import module logic into the prioritizer. Contract: [Sync engine](./SYNC_ENGINE.md#fetch-prioritization).
- **Server-driven writes** (CDC fan-out, materialization, scheduled jobs) must strip the client's `changedFields` from the stored `stx`, else the CDC worker attributes the write to the wrong columns (absent key = WAL diff): `stripChangedFields` (`backend/src/db/utils/strip-changed-fields.ts`) or `stripChangedFieldsStx` in the CDC worker.
- **Schema evolution (lenses)**: breaking wire-shape changes to product entities ship as append-only lens modules in `shared/src/schema-evolution/`. Never edit a shipped module. Until the first lens ships, a breaking wire-shape change bumps `appConfig.clientCacheVersion` (gate: Commits & PRs). Playbook: [Schema evolution](/docs/page/architecture/schema-evolution).
- **Evolution contract**: every entity module registers `evolutionContract.product` or `.channel` once and routes bodies through it. `lens:check` fails a configured type without one. Recipe: [New entity](./ADD_ENTITY.md). Model: [Schema evolution](./SCHEMA_EVOLUTION.md#evolution-contract).

## Cross-product references

Relationships between products are data, never permission indirection (permissions and public read flow through the hierarchy's channel columns). Exactly two mechanisms:

1. **`productEmbeddings` host id arrays**: an id array column on the host product's table, declared in `appConfig.productEmbeddings`. All embedding machinery (CDC cleanup, owned-embedding GC, ref counters, SSE propagation hints, client cache patching) is config-driven. Engine code never changes. `lifecycle: 'shared'` (default): embedded rows live independently, dead references are stripped from hosts. `lifecycle: 'owned'`: the CDC worker soft-deletes rows no live host references.
2. **The mutation bus** (`defineBackendModule` + `onMutation`/`dispatchMutation`): lifecycle side effects an embedding cannot express (e.g. seeding rows on `project.created`). Handlers run synchronously, optionally inside the write transaction.

A child-side host FK (nullable `<host>Id` column on one product pointing at another) is deprecated: invisible to sync views, CDC, propagation hints and counters. Conversion guide: `cella/migrations/20260730T1009-owned-host-embedding/`.

## Coding patterns

- **Frontend modules & placements**: every `frontend/src/modules/<name>/` folder registers itself in `<name>-module.ts` (`.tsx` when tools render JSX) via `defineFrontendModule` (`~/lib/module`). `frontend/src/modules.ts` glob-imports these before first render. A **tool** is a component placed into a **slot**. The **consumer** is the page hosting the slot. Modules declare `tools`. Consumers read `getTools(slot)` (typed by `SlotContexts`) and resolve with `resolvePlacementList`. Slot families: `` `${channelType}.settings` ``, `` `${channelType}.tabs` ``, `account.settings`, `home.sections`, `user.profile` (profile page body) and the non-entity `system.tabs`. A tool's `render` returns the slot's full content unit (lazy-load heavy UI). A channel tool's entity context is the `ChannelEntityByType` interface (apps widen it via module augmentation). Gating: `requires` names a grant. `visibleTo` lists context-role pairs like `'organization.admin'` (matched over the ancestor chain via `heldContextRoles(entity, memberships)`, a UI boundary only, never data authorization). Arrangement layers, in order: manifest defaults, app overrides in `frontend/src/placement-config.ts` (pinned), then the channel row's `toolsConfig` jsonb (per-slot `order`/`hidden`/`settings`, reconciled fail-closed: unknown ids drop, new tools append at default order, and `locked` tools ignore channel hiding). Page tabs: `resolveNavTabs` merges child routes declaring `staticData.navTab` (a `PlacementDescriptor`) with the `.tabs` tools of the slot named in the layout route's `staticData.tabsSlot` into one gated, ordered bar. Entity links target the layout route tab-less. Its `beforeLoad` calls `guardNavTabs` (redirects to `defaultTabId`, else the first visible tab, and forwards navigations aimed at a disabled tab). A settings slot costs its forms, a per-module `settings-tools.tsx` built from the `*ToolBase` helpers in `modules/entities/channel-settings-tools.tsx` (`dangerToolBase` plus `DeleteToolCard` is the danger zone), and a `<ChannelSettingsPage entity={...} />` route. A tabs slot costs a one-line `$tool` route (`SlotTabHost`) plus its `.tabs` tools. Shells: `ToolCard` (`modules/common`), `TabsArrangementCard` (`modules/entities`).
- **Entity id columns**: the hierarchy is the ONE source of truth for id-column names (`organization` → `organizationId`). Never hand-write `` `${type}Id` `` or hardcode a sub-organization key like `'projectId'`. Prefer, in order: `EntityIdColumns<TS, V>` (shared) for an entity-type → id-column map _type_, then `EntityIdColumnKey<T>` for one key type, then `appConfig.entityIdColumnKeys[type]` or `entityIdColumnKey(type)` / `entityIdColumnName(type)` at runtime. The organization is the fixed spine, not a configurable root: write `'organization'` and `organizationId` directly (there is no `rootChannelType`), and declare it with `organization()` in the hierarchy builder. Row-location logic and entity-kind guards (`isChannel`, `isProduct`, `getRoles`, `hierarchy.resolveDeepestAncestorId`, `hierarchy.computeProductPath`, `hierarchy.pathColumnSql`, ...) are bound arrow methods on `EntityHierarchy` (destructuring keeps `this`), no free-function twin. `shared` re-exports the singleton's `isChannel`/`isProduct` as aliases, so a `vi.mock('shared')` factory replacing `hierarchy` must also override `isChannel: h.isChannel, isProduct: h.isProduct`. Injectable-hierarchy parameters are typed `EntityHierarchy`, defaulting to the app singleton (`options.hierarchy` on permission checks).
- **Debug mode**: `VITE_DEBUG_MODE=true` in `frontend/.env`.
- **Icons**: import from `lucide-react` with `*Icon`-suffixed names (`LoaderCircleIcon`, not `Loader2`/`Loader2Icon`, Biome-enforced). Size with classes only: `icon-xs/sm/md/lg/xl` (12-24px) or `size-*`. NEVER lucide's `size` prop (a global `:where(svg.lucide)` rule overrides its px attributes). Never combine two `icon-*`/`size-*` classes on one element (tailwind-merge does not dedupe them). strokeWidth defaults via `LucideProvider` in main.tsx (`appConfig.theme.strokeWidth`). Per-icon `strokeWidth` overrides. Custom SVG icons in `frontend/src/modules/common/icons/` carry the `lucide` class. Icon-as-prop declarations use `IconComponent` from `~/modules/common/icons/types` (omits `size`).
- **Migrations**: every sync-breaking change ships a `cella/migrations/` folder plus manifest entry in the same PR: `cella/migrations/README.md`.
- **Syncing (apps)**: the `cella-sync` skill (`cella/skills/cella-sync/SKILL.md`) drives `pnpm cella sync` / `pnpm cella analyze`: conflict triage, silent-damage sweep, migration bookkeeping, drift triage.
- **Skills**: `cella/skills/` is the single home for agent skills (synced to apps). Claude Code only discovers `.claude/skills` (gitignored): `ln -s ../cella/skills .claude/skills`.
- **OpenAPI nullable**: `z.union([schema, z.null()])`, never `schema.nullable()`, for named schemas.
- **OpenAPI schema naming**: register named components (`.openapi('Name')`) only for whole entity responses or crucial shared base types. Inline enums and request body schemas. Share one schema when the shape is identical across contexts.

## Style & naming

- Biome (`biome.jsonc`). Run `pnpm lint:fix`.
- Indentation 2 spaces, line width 120, single quotes, Biome defaults for the rest.
- Zod v4 only: `import { z } from 'zod'`. Backend: `import { z } from '@hono/zod-openapi'`.
- camelCase variables/functions (constants included), PascalCase components, kebab-case files, snake_case translation keys.
- JSDoc: backend exports get full JSDoc with params/response. Frontend exports get one line, and none when identifier and types already carry the meaning (`useAttachmentDeleteMutation` earns one: it also cancels paused offline creates). No file-level comments above imports. A comment longer than three prose lines must document a declaration or local executable block. Cross-file architecture, workflows and failure-mode narratives go to the nearest canonical README.
- **Comment budget:**
  - **Members**: one line when name and type underdetermine the contract (default, constraint, unit or encoding, null/empty condition, population source), and always for `unknown`, `any` or a bare `string`/`number`/`boolean`. Drop it when a named type carries the meaning (`items: FloatingNavItem[]`) or default and behavior are visible in the same file.
  - **Locals and JSX**: one line of rationale for a local (two lines means rename or extract). JSX keeps the constraint only: `{/* min-h-14 matches the bar row so the grid holds position */}`. Measurement and motivation go in the commit. One comment above a repetitive block covers its shared constraint.
  - **No repeats**: the same comment text never appears in two files. Put it once at the shared abstraction or delete every copy.
- **Never use em dashes (`—`, U+2014) anywhere in text** (code, YAML, config, docs). Split the sentence, use a colon, or drop the clause. `shared/scripts/check-comment-style.ts` (in `pnpm check`) fails the build on em dashes in code and YAML comments, `shared/scripts/check-doc-style.ts` (`pnpm docs:style`) on em dashes in Markdown and MDX prose. Contrast and history phrases (`instead`, `rather than`, `previously`, `used to`, `maybe`, `we should`) are review signals: rewrite around the current behavior, delete the rest.
- **Agent-associated vocabulary**: name the concrete behavior. Replace `load-bearing` with the dependency, requirement or failure consequence it abbreviates. `seam`, `land`, `surface` as a verb, `wiring`, `scaffold`, `floor`, `decisive`, `genuinely`, `cleanly`, `honest take` and `silently` are review signals. Prefer the exact term (boundary, merge, report, registration, minimum, the missing error). Keep exact domain terms (`canonical`, `idempotent`, `parity`, `guard`, `stale`, `round-trip`, `fallback`, `authoritative`, `verdict`). Never rename identifiers, files, APIs or domain concepts for prose style. `pnpm prose:audit` reports review terms. Required replacements fail `pnpm docs:style` (generated output, migrations, changelog, `infra/` excluded).
- **Template/app vocabulary**: `template` for Cella. `app`, `app-owned` or `app-specific` for projects built from it. `sync-breaking` for an upstream change that requires app work after a sync. The Cella CLI keeps its source-control term in `cella/cella.config.ts`. Compatibility migrations may name legacy identifiers they replace.
- `materialize`/`materialization` only for the Yjs operation that converts collaborative state into durable entity data. Elsewhere use `persist`, `provision`, `create` or `resolve`.
- **Prefer plain composable functions over configuration factories.** `createX(config)` returning behavior is justified only to bind long-lived shared state for many call sites (e.g. mutation options bound to a QueryClient). Otherwise write a small function with explicit arguments.
- **Reserved domain vocabulary.** These words name a subsystem. Never reuse them:
  - `sync` -> the entity sync engine (`sync-store`, `sync-service`, `SyncTier`, `syncStaleTime`, `declareSyncView`).
  - `schema` / `lens` -> schema evolution (`currentSchemaVersion`, `defineLens`, `markBundleStale`).
  - `channel` -> channel entities (`ChannelEntityType`, `channelId`), not a transport or a `BroadcastChannel`.
  - `own` / `owner` -> the permission engine's creator relation.
  - `tool` / `slot` / `consumer` -> UI placements (`defineFrontendModule` tools, `toolsConfig`, `visibleTo`). An MCP tool is always written "MCP tool".
  - `leader tab` / `election` -> cross-tab coordination of the single SSE connection (`tab-coordinator`).
  Name modules for their domain role, not the primitive underneath (`tab-coordinator`, not `leader-lease`). When splitting a module, name the remainder deliberately, never payload plus generic verb.
- **Docs headings**: `##` headings in `frontend/src/content/docs/**` and in any `.md` those pages import (`cella/*.md`, `bench/README.md`, `cdc/README.md`, `yjs/README.md`) max out at 25 rendered characters (the sidebar truncates longer ones). Measure rendered text, not markup. Only `##` is affected. `cella/CHANGELOG.md` is exempt.
- Storybook: stories in `stories/` inside the module, named `<component-filename>.stories.tsx`.
- UI primitives: Base UI (`@base-ui/react`), **not** Radix. Shadcn-style components in `frontend/src/modules/ui/` wrap Base UI.
- Keep existing comment content intact unless cleanup is explicitly requested. Trimming to the comment budget is always in scope (an over-budget comment is a defect).
- Console: `console.log` for temp debugging (remove before commit), `console.info` for logging, `console.debug` for dev (stripped in prod).
- Links as buttons: `<Link>` with `buttonVariants()` for linkable actions. Allow new-tab opening for URL-targetable sheet content.
- React compiler: `useMemo`/`useCallback` are rarely needed.
- Translations: all UI text via `useTranslation()`/`t('c:key')`, never hardcoded. Template components read only `common.json` keys (apps override from `app.json`). Files and namespaces: [locales/README.md](../locales/README.md).

## Testing

- Test modes: [Testing](/docs/page/guides/testing).

## Deploy debugging

Prod deploys are immutable VM generations on Scaleway (Pulumi + S3 control object). The LB-overlap cutover waits for the new VM to serve `X-App-Version: <SHA>` (`/health` → 204 backend/yjs/mcp, 200 frontend). "cutover unhealthy / wait-for-version timeout" means the app never bound its port: almost always a **boot-time crash**, not the LB.

1. **Read the boot logs first.** The boot runner ([infra/boot/src/boot.ts](../infra/boot/src/boot.ts)) runs `docker compose up --wait` and uploads a crashed container's stdout/stderr to the `boot-diag/` prefix of the boot-diag bucket. Read it with `pnpm --filter infra diag` (`--service backend`, `--list`, `--mode staging`, `--replay`). [infra/tasks/deploy-run.ts](../infra/tasks/deploy-run.ts) runs it automatically on rollout failure.
2. **No SSH, no serial-log API.** SecurityGroup drops inbound. The only channels are the S3 boot-diag above and the Scaleway **web** serial console (`::cella::` markers + `BOOT FAILED (exit N)`).
3. **Reproduce locally.** Pull the exact image tag and `docker run` it with minimal valid env (or `node dist/main.js`). Runtime crashes (`ERR_MODULE_NOT_FOUND`) show in seconds. macOS keychain blocks `docker login` save: use a throwaway `--config` dir with a base64 `auth`.
4. **Common boot-crash classes**:
   - Workspace dep left as a bare external (must be in tsup `noExternal`).
   - Multiline secret in a line-based env file.
   - Image SHA predates a DB/secret contract change.
   - node-postgres TLS hostname check vs. the dialed IP (`sslmode=require` + host-pinned `checkServerIdentity`).
   - `SecretManagerSecretAccess` missing on the VM's service key (`<slug>-<mode>-vm-<service>`, 403 on hydrate).
   - Instance-type quota too low for create-before-destroy.
5. **Validate infra changes** with `pnpm --filter infra exec vitest run` (infra is **Biome-ignored**, match style by hand) and `pnpm check` at the root.

## Commits & PRs

- Use `git` and `gh` CLI. Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`.
- PRs: concise description, linked issues, passing checks, scoped changes.
- Breaking OpenAPI diffs: [Cache-bust](./SCHEMA_EVOLUTION.md#cache-bust-interim).

## Commands

- `pnpm dev`: Dev servers for every package. Start PostgreSQL first with `pnpm docker`.
- `pnpm check`: Runs `sdk` + typecheck + `lens:check` + `lint:fix` (which includes the style and doc checks).
- `pnpm generate`: Create Drizzle migrations from schema changes.
- `pnpm sdk`: Regenerate OpenAPI spec and frontend SDK.
- `pnpm seed`: Seed database with test data.
- `pnpm test`: Run the full test suite with summary coverage.
- `pnpm infra`: Infra CLI for deployment: [Infra docs](/docs/page/guides/deployment)
- `pnpm bench`: Run benchmark scenarios: [Bench docs](/docs/page/guides/load-testing)
- `pnpm cella`: Sync with cella and more (`@cellajs/cli`).
- `pnpm story`: Start storybook
