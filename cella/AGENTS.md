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
  - Routes: `backend/src/modules/<module>/<module>-routes.ts` using `createXRoutes`.
  - Handlers: `backend/src/modules/<module>/<module>-handlers.ts` using `.openapi()` on `OpenAPIHono`.
- **Frontend (TanStack Router, file-based)**:
  - Route files in `frontend/src/routes/`. The router vite plugin registers them into `routeTree.gen.ts` (committed, never hand-edited).
  - Route files are thin shims: path/staticData/glue only. Components and `beforeLoad` logic live in modules (`route-logic.ts`, `route-components.tsx`, `search-params-schemas.ts`) via `getRouteApi('<route id>')`.
  - Layouts: `_public/` (pathless public), `_app/` (pathless authenticated), `_public/_content/` (public content), `_app/$tenantId.$organizationSlug/` (org context). A trailing underscore (`page_.$id.edit.tsx`) opts out of parent component nesting.
  - Router: `frontend/src/routes/router.ts`. Shared route helpers: `-route-utils.tsx` next to it.

## Middleware & guards

Global chain in `backend/src/middlewares/app.ts`: log context → referrer override → secureHeaders → OpenTelemetry → pino logger → CSRF (skipped for requests carrying an API key; the service guard refuses browser origins itself) → client version → dynamic body-limit → gzip (GET only). No CORS middleware: the API is same-origin.

Route-level guards in `backend/src/middlewares/guard/`:

- `userGuard`: validates the session and sets `ctx.var.user`, `ctx.var.memberships`, `ctx.var.actor`, `ctx.var.db` (baseDb). A route without `tenantGuard` reads across tenants: its handlers use `tenantRead()` for product entity queries.
- `serviceGuard`: a secret API key (`Authorization: Bearer <slug>_sk_…` or `x-api-key`) or an access token from the app's authorization server; sets `ctx.var.actor` (a service account, or the consenting user masked by the token scopes). Never system admin.
- `actorGuard`: a session, an API key or an access token, for routes whose operation takes `ActorContext`. `tokenGuard`: access tokens only (the MCP face), answering 401 with the RFC 9728 challenge.
- Contexts, narrowest first: `DbContext` (a connection), `ActorContext` (actor + tenant, no user row), `OrgContext` (plus the organization), `UserContext` (a signed-in user, session fields only behind `userGuard`). Type an operation on the narrowest it needs. Every guard declares the OpenAPI `security` it accepts; `createXRoute` emits it per operation.
- `tenantGuard`: verifies tenant membership, loads the tenant row, and sets `ctx.var.db = baseDb` and `ctx.var.tenantId`.
- `orgGuard`: resolves the organization and verifies membership.
- `publicGuard`: unauthenticated routes. Sets `ctx.var.db` to baseDb.
- `stepUpGuard`: after `userGuard` on account-security routes: the session must have proven its user's presence again recently, never an impersonation; else 403 `step_up_required` naming the methods. The routes, the proofs and the window: [Authentication](./AUTHENTICATION.md#step-up).
- Also: `sysAdminGuard` (never an impersonation: 403 `impersonation_forbidden` before the role check), `relatableGuard`.

### Database access patterns

- Product entity handlers use the tenant helpers in `backend/src/db/tenant-context.ts`. Channel entity handlers use `ctx.var.db` (baseDb).

Read/write boundary and table categories: [Multi-tenancy](./MULTI_TENANCY.md).

Secret columns (a hash, a session or token secret, a private key) are declared once, by table name, in `backend/src/db/secret-columns.ts`. Three things derive from it and nothing else lists them: `createSelectSchema` omits them from every response schema, `lib/redact-keys.ts` censors them in backend and worker logs, and the CDC worker strips them from the row image. Adding such a column means one line there; a column whose name ends like a secret but is not one goes in `secretLookingColumns` with its reason. `cdc/src/tests/secret-columns.test.ts` fails on a column in neither map.

## Error handling

`AppError` is the structured error class: `status`, `type` (i18n key from `locales/en/error`, or from the app-owned `locales/en/appError` for a type an app adds), `severity`, `entityType`, `meta`, `willRedirect`. PostgreSQL error codes map automatically (FK violation → 400, unique constraint → 409, RLS denial → 403, deadlock → 409). A route that answers 302 is a browser navigation: outside tests, whatever refuses it (the config switch, a guard, a limiter, the handler) answers with a redirect to `/auth/error`, the `ctx.var.errorPagePath` a handler may point elsewhere; `willRedirect` forces that redirect in every mode.

On the client the global handler (`frontend/src/query/on-error.ts`) toasts every `ApiError` with its type's title and text. A mutation shows an error toast of its own only when it sets `meta.suppressGlobalErrorToast`, as product entities do through `createResourceError`; any other local `onError` toast shows the failure twice.

## Auth

Authentication model and rate limits: [Authentication](./AUTHENTICATION.md). Machine access: [Interoperability](./INTEROPERABILITY.md). Permission decisions: [Permissions](./PERMISSIONS.md). Tenant database boundary: [Multi-tenancy](./MULTI_TENANCY.md). Listener and secret-delivery boundaries: [Deployment](./DEPLOYMENT.md). Secret-column handling: [Architecture](./ARCHITECTURE.md#trust-boundaries). Telemetry redaction: [Observability](./OTEL.md#redaction). Security testing: [Testing](./TESTING.md#goals).

Eleven sub-modules in `backend/src/modules/auth/`: `general/` (the shared routes, cookies, finishing a sign-in, account-security mail), `invitations/` (resending, reading and accepting invitation links; who may sign up), `sessions/` (creating, resolving and revoking sessions, impersonation, sign-out), `devices/` (browsers a user signed in from, new sign-in notices), `mfa/` (the MFA challenge and factor rules), `magic/`, `oauth/` (signing in with a provider), `passkeys/` (WebAuthn), `totps/` (TOTP 2FA), `step-up/` (proving presence again before account-security actions), `tokens/` (the token lifecycle: issue, redeem, read and spend, with one policy per token type; the only importer of `tokens-db`, enforced by Biome; a link type also has its handler in `tokens/operations/open-link-token.ts`). Sessions: `sessions/operations/resolve-session.ts` (`resolveSession` reads the app session from any request context). Cookies: `general/helpers/cookie.ts`.

Machine access ([Interoperability](/docs/page/architecture/interoperability)): `actors/` (the supertype that `createdBy`/`updatedBy`/`deletedBy` on channel and product tables reference), `service-accounts/` (accounts, role `bindings`, API keys in `api_keys`), `oauth-server/` (the app's authorization server; process entry in `oauth/`, tokens verified by the guards), `mcp/` (tokens-only endpoint; process entry in `mcp/`). Names: API key, access scope (`accessScopes` derived from the policy matrix), binding, OAuth client. Name the proof: session, API key or access token; `credential` is the WebAuthn word (passkeys) and nothing else.

## Permissions

Every check takes an `Access` from `accessFrom(ctx)`. Never assemble one by hand. The frontend `can` map shapes the interface only, the backend is authoritative. Decision model, helper family, and enforcement paths: [Permissions](./PERMISSIONS.md). Database backstop: [Multi-tenancy](./MULTI_TENANCY.md).

## State & API

- **Server state**: TanStack Query (`offlineFirst` network mode, IndexedDB persistence via `PersistQueryClientProvider`). Query options/keys/mutations in `frontend/src/modules/<module>/query.ts`. Model: [Client](./CLIENT.md).
- **Client state**: Zustand stores as `*-store.ts` inside their module. Prefer Zustand over React context. Use context only for tree-local composition of compound UI (`Carousel`, `Select`, `Stepper`) or third-party providers, never for app/feature state. Read a store through a selector, `useUIStore((state) => state.mode)`, with `useShallow` when a component picks four or more fields; a bare `useUIStore()` fails `pnpm style`.
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
- `x-routes.ts`: a module's routes are `createXRoutes(tags, { key: xRoute({ ... }) })`, never `createRoute`. Each route's `operationId` is its key (set it only when the SDK name differs), its tags are the module's, and the error responses (`errorResponseRefs`) are appended to every route. `json(description, schema, example?)` builds a JSON response, `jsonBody(schema)` a required JSON body. `createXRoute` finishes a single route the same way. Props, in this order, which is the order a request meets them: `method`, `path`, `xEnabledBy` (the config switch the route belongs to: `{ service }` 404s while that service is off, `{ strategy }` refuses an auth route while its sign-in method is off, `{ strategy: 'oauth', provider }` while that provider is; it runs before the guards, so it is for deployment switches that need no caller), `xGuard` (required: who may call), `xRateLimiter`, `xCache`, `xTool` (opts the route in as an MCP tool: `{ description, approvalRequired, entity }`; input derives from `request`, a call runs the route through the app with the caller's access token, so the route's guards must take one: `actorGuard` or `serviceGuard`, a cookie-only guard is refused at load), then `middleware` (after the guards: checks that need the caller, such as a plan or tenant flag), `summary`, `description`, `request`, `responses`. The spec shows the `x*` props as `x-*` extensions. The docs list a route whose switch is off and mark it off by the docs page's own config; to drop routes from the docs (they stay in the spec and SDK), set `hidden: true` on the module or add `'internal'` to a route's `tags`. Per-operation `security` follows the guard's declaration (`cookieAuth`, `apiKey`, `oauth2`).
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
- **Realtime backend**: `activityBus` (`backend/src/lib/activity-bus.ts`) → `createStreamDispatcher()` → `streamSubscriberManager` (`backend/src/modules/entities/stream/`, SSE fan-out). `CdcWebSocketServer` (`backend/src/lib/cdc-websocket.ts`) accepts the CDC worker on `/internal/cdc` of the internal listener (`backend/src/lib/listeners.ts`), which serves the server-to-server routes apart from the public API.
- **Seen-by tracking**: `IntersectionObserver` marks entities seen. A Zustand store batches IDs, flushes on timer + `sendBeacon` on unload, persists flushed IDs in `localUserDb` (`kv` table). Unseen badges decrement optimistically in the query cache. Backend: `seen_by` (one row per user+product), `product_counters` (denormalized counts).
- **Product cache** (`backend/src/middlewares/product-cache/`): [Sync engine](./SYNC_ENGINE.md#detail-cache).
- **Sync signals** (`frontend/src/query/realtime/sync-signals.ts`): the only extension point for sync-derived per-user state. Never import module logic into the prioritizer. Contract: [Sync engine](./SYNC_ENGINE.md#fetch-prioritization).
- **Collaborative descriptions** (`frontend/src/modules/common/blocknote/`): columns derived from a description register in the module's `query.ts` with `registerYjsOwnedFields` and `registerDescriptionDerivation`, the derivation its update operation runs. A description shown in place builds on `useDescriptionSlot` and `<DescriptionLayers>`. A backend write path that dispatches no `<type>.updated` calls `recordYjsOutsideWrite` (`yjs/operations/record-outside-write.ts`) after its UPDATE, and an update op stores `stripChangedFields(table.stx)` on a write that changes no field. Model: [Sync engine](./SYNC_ENGINE.md#yjs).
- **Server-driven writes** (CDC fan-out, materialization, scheduled jobs) must strip the client's `changedFields` from the stored `stx`, else the CDC worker attributes the write to the wrong columns (absent key = WAL diff): `stripChangedFields` (`backend/src/db/utils/strip-changed-fields.ts`) or `stripChangedFieldsStx` in the CDC worker.
- **Schema evolution (lenses)**: breaking wire-shape changes to product entities ship as append-only lens modules in `shared/src/schema-evolution/`. Never edit a shipped module. Until the first lens ships, a breaking wire-shape change bumps `appConfig.clientCacheVersion` (gate: Commits & PRs). Playbook: [Schema evolution](/docs/page/architecture/schema-evolution).
- **Evolution contract**: every entity module registers `evolutionContract.product` or `.channel` once and routes bodies through it. `lens:check` fails a configured type without one. Guide: [New entity](./ADD_ENTITY.md). Model: [Schema evolution](./SCHEMA_EVOLUTION.md#evolution-contract).

## Cross-product references

Relationships between products are data, never permission indirection (permissions and public read flow through the hierarchy's channel columns). Exactly two mechanisms:

1. **`productEmbeddings` host id arrays**: an id array column on the host product's table, declared in `appConfig.productEmbeddings`. All embedding machinery (CDC cleanup, owned-embedding GC, ref counters, SSE propagation hints, client cache patching) is config-driven. Engine code never changes. `lifecycle: 'shared'` (default): embedded rows live independently, dead references are stripped from hosts. `lifecycle: 'owned'`: the CDC worker soft-deletes rows no live host references.
2. **The mutation bus** (`defineBackendModule` + `onMutation`/`dispatchMutation`): lifecycle side effects an embedding cannot express (e.g. seeding rows on `project.created`). Handlers run synchronously, optionally inside the write transaction.

A child-side host FK (nullable `<host>Id` column on one product pointing at another) is deprecated: invisible to sync views, CDC, propagation hints and counters. Conversion guide: `cella/migrations/20260730T1009-owned-host-embedding/`.

## Coding patterns

- **Frontend modules & placements**: every `frontend/src/modules/<name>/` folder registers itself in `<name>-module.ts` (`.tsx` when tools render JSX) via `defineFrontendModule` (`~/lib/module`). `frontend/src/modules.ts` glob-imports these before first render. A **tool** is a component placed into a **slot**. The **consumer** is the page hosting the slot. Modules declare `tools`, and the module that owns an entity also declares `channel` or `product` (its menu section, list query and members-table icon / hidden-count default), read back through `~/lib/entity-modules`. Consumers read `getTools(slot)` (typed by `SlotContexts`) and resolve with `resolvePlacementList`. Slot families: `` `${channelType}.settings` ``, `` `${channelType}.tabs` ``, `account.settings`, `home.sections`, `user.profile` (profile page body) and the non-entity `system.tabs`. A tool's `render` returns the slot's full content unit (lazy-load heavy UI). A channel tool's entity context is the `ChannelEntityByType` interface (apps widen it via module augmentation). Gating: `requires` names a grant. `visibleTo` lists context-role pairs like `'organization.admin'` (matched over the ancestor chain via `heldContextRoles(entity, memberships)`, a UI boundary only, never data authorization). Arrangement layers, in order: the app's `appConfig.surfaces` (one ordered id list per slot; a listed surface is total, so an id left out has no placement there and the first id of a tab bar is its landing tab, while an unlisted surface keeps every placement in its declared `order`), then the channel row's `toolsConfig` jsonb (per-slot `order`/`hidden`/`settings`, reconciled fail-closed: unknown ids drop, new tools append at default order, and `locked` tools ignore channel hiding). Page tabs: `resolveNavTabs` merges child routes declaring `staticData.navTab` (a `PlacementDescriptor`) with the `.tabs` tools of the slot named in the layout route's `staticData.tabsSlot` into one gated, ordered bar. Entity links target the layout route tab-less. Its `beforeLoad` calls `guardNavTabs` (redirects to the first visible tab and forwards navigations aimed at a disabled tab). `Slot` lives in `shared/placements`, so `appConfig.surfaces`, the `toolsConfig` column and its wire schema share one key space; `assertSurfaces()` throws at startup for a listed id that names no placement. A settings slot costs its forms, a per-module `settings-tools.tsx` built from the `*ToolBase` helpers in `modules/entities/channel-settings-tools.tsx` (`dangerToolBase` plus `DeleteToolCard` is the danger zone), and a `<ChannelSettingsPage entity={...} />` route. A tabs slot costs a one-line `$tool` route (`SlotTabHost`) plus its `.tabs` tools. Shells: `ToolCard` (`modules/common`), `TabsArrangementCard` (`modules/entities`).
- **Entity id columns**: the hierarchy is the ONE source of truth for id-column names (`organization` → `organizationId`). Never hand-write `` `${type}Id` `` or hardcode a sub-organization key like `'projectId'`. Prefer, in order: `EntityIdColumns<TS, V>` (shared) for an entity-type → id-column map _type_, then `EntityIdColumnKey<T>` for one key type, then `appConfig.entityIdColumnKeys[type]` or `entityIdColumnKey(type)` / `entityIdColumnName(type)` at runtime. The organization is the fixed spine, not a configurable root: write `'organization'` and `organizationId` directly (there is no `rootChannelType`), and declare it with `organization()` in the hierarchy builder. Row-location logic and entity-kind guards (`isChannel`, `isProduct`, `getRoles`, `hierarchy.resolveDeepestAncestorId`, `hierarchy.computeProductPath`, `hierarchy.pathColumnSql`, ...) are bound arrow methods on `EntityHierarchy` (destructuring keeps `this`), no free-function twin. `shared` re-exports the singleton's `isChannel`/`isProduct` as aliases, so a `vi.mock('shared')` factory replacing `hierarchy` must also override `isChannel: h.isChannel, isProduct: h.isProduct`. Injectable-hierarchy parameters are typed `EntityHierarchy`, defaulting to the app singleton (`options.hierarchy` on permission checks).
- **Debug mode**: `VITE_DEBUG_MODE=true` in `frontend/.env`.
- **Icons**: import from `lucide-react` with `*Icon`-suffixed names (`LoaderCircleIcon`, not `Loader2`/`Loader2Icon`, Biome-enforced). Size with `size-*` classes only (`size-3` to `size-6`, 12-24px; unsized icons default to 1rem). NEVER lucide's `size` prop (a global `:where(svg.lucide)` rule overrides its px attributes). strokeWidth defaults via `LucideProvider` in main.tsx (`appConfig.theme.strokeWidth`). Per-icon `strokeWidth` overrides. Custom SVG icons in `frontend/src/modules/common/icons/` carry the `lucide` class. Icon-as-prop declarations use `IconComponent` from `~/modules/common/icons/types` (omits `size`).
- **Migrations**: every sync-breaking change ships a `cella/migrations/<id>/` folder in the same PR, its README opening with frontmatter: `cella/migrations/README.md`. The folder stays upstream; apps read and record the notes with `pnpm cella migrate`.
- **Syncing (apps)**: the `cella-sync` skill (`cella/skills/cella-sync/SKILL.md`) drives `pnpm cella sync` / `pnpm cella analyze`: conflict triage, silent-damage sweep, migration bookkeeping, drift triage.
- **Accessibility**: `pnpm a11y` audits the running app against WCAG 2.2 AA and fills `json/accessibility-conformance.json` (`a11y/README.md`). The `a11y-review` skill reviews the criteria it leaves open; an agent's decision stays provisional until a person confirms it.
- **Skills**: `cella/skills/` is the single home for agent skills (synced to apps): `verify` (launch, sign in and drive the frontend), `two-tab-sync-test` (realtime entity sync across two tabs, collaborative descriptions across two users, offline and through a relay outage), `cella-sync` and `migrate` (an app pulling the template), `a11y-review` (the open WCAG criteria), `screenshots` (re-shoot the marketing images the app ships). A skill names commands, files and log lines, so a change to any of those updates the skill in the same PR. Claude Code only discovers `.claude/skills` (gitignored): `ln -s ../cella/skills .claude/skills`.
- **OpenAPI nullable**: `z.union([schema, z.null()])`, never `schema.nullable()`, for named schemas.
- **OpenAPI schema naming**: register named components (`.openapi('Name')`) only for whole entity responses or crucial shared base types. Inline enums and request body schemas. Share one schema when the shape is identical across contexts.
- **OpenAPI named schema shape**: define it in the module's `*-schema.ts` and pass `{ description, example: mockXResponse(), 'x-tags': schemaTags(kind, module, 'cella') }`, kind first (`data`, `base` or `errors`). A variant of a named schema stays unnamed and overrides the parent's `description` and `example` with `.openapi({ ... })` when they no longer fit.

## Style & naming

- Biome (`biome.jsonc`). Run `pnpm lint:fix`.
- Indentation 2 spaces, line width 150, single quotes, Biome defaults for the rest.
- Zod v4 only: `import { z } from 'zod'`. Backend: `import { z } from '@hono/zod-openapi'`.
- camelCase variables/functions (constants included), PascalCase components, kebab-case files, snake_case translation keys.
- JSDoc: backend exports get full JSDoc with params/response. Frontend exports get one line, and none when identifier and types already carry the meaning (`useAttachmentDeleteMutation` earns one: it also cancels paused offline creates). No file-level comments above imports. A comment longer than three prose lines must document a declaration or local executable block. Cross-file architecture, workflows and failure-mode narratives go to the nearest canonical README.
- **Comment budget:**
  - **Members**: one line when name and type underdetermine the contract (default, constraint, unit or encoding, null/empty condition, population source), and always for `unknown`, `any` or a bare `string`/`number`/`boolean`. Drop it when a named type carries the meaning (`items: FloatingNavItem[]`) or default and behavior are visible in the same file.
  - **Locals and JSX**: one line of rationale for a local (two lines means rename or extract). JSX keeps the constraint only: `{/* min-h-14 matches the bar row so the grid holds position */}`. Measurement and motivation go in the commit. One comment above a repetitive block covers its shared constraint.
  - **No repeats**: the same comment text never appears in two files. Put it once at the shared abstraction or delete every copy.
- **Never use em dashes (`—`, U+2014) anywhere in text** (code, YAML, config, docs). Split the sentence, use a colon, or drop the clause. `pnpm style` (in `pnpm check`, `pnpm lint` and CI) fails on em dashes in code, YAML and config comments and in Markdown and MDX prose. In comments it also fails contrast and history phrases (`instead`, `rather than`, `previously`, `used to`, `maybe`, `we should`): rewrite around the current behavior, delete the rest.
- **Agent-associated vocabulary**: name the concrete behavior. Replace `load-bearing` with the dependency, requirement or failure consequence it abbreviates. `seam`, `land`, `surface` as a verb, `wiring`, `scaffold`, `floor`, `decisive`, `genuinely`, `cleanly`, `honest take` and `silently` are review signals. Prefer the exact term (boundary, merge, report, registration, minimum, the missing error). Keep exact domain terms (`canonical`, `idempotent`, `parity`, `guard`, `stale`, `round-trip`, `fallback`, `authoritative`, `verdict`). Never rename identifiers, files, APIs or domain concepts for prose style. `pnpm style:audit` lists review terms. Required replacements fail `pnpm style` (generated output, migrations, changelog, `infra/` excluded).
- **Template/app vocabulary**: `template` for Cella. `app`, `app-owned` or `app-specific` for projects built from it. `sync-breaking` for an upstream change that requires app work after a sync. The Cella CLI keeps its source-control term in `cella/cella.config.ts`, and the `// fork: <why>` markers the cella-sync skill requires on app edits are skipped by `pnpm style`. Compatibility migrations may name legacy identifiers they replace. `cella` in code names the template only where it contrasts with the app ("none in cella; apps with other vocabularies add theirs"), never the running system ("the app's authorization server", not "cella's"). The product name is never an identifier, claim, header, DNS record or URL literal in `backend/src`, `shared/src` or `frontend/src`: derive it from `appConfig.slug` / `appConfig.name` or pick a neutral name. `pnpm style` rejects `cella_*`, `Cella*`, `_cella-*` and `cellajs.com` there (tests, config, docs and marketing excluded).
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
- UI primitives: Base UI (`@base-ui/react`), **not** Radix. Shadcn-style components in `frontend/src/modules/ui/` wrap Base UI. When porting from the shadcn registry, start from the base-vega style (closest to cella's sizing). Its `data-horizontal:`/`data-vertical:` variants, `no-scrollbar` and `var(--radius-md)` work as-is; drop the `cn-*` hook classes (shadcn style CSS, not shipped here) and check every state selector against the attributes Base UI emits.
- Keep existing comment content intact unless cleanup is explicitly requested. Trimming to the comment budget is always in scope (an over-budget comment is a defect).
- Console: `console.log` for temp debugging (remove before commit), `console.info` for logging, `console.debug` for dev (stripped in prod).
- Links as buttons: `<Link>` with `buttonVariants()` for linkable actions. Allow new-tab opening for URL-targetable sheet content.
- React compiler: `useMemo`/`useCallback` are rarely needed.
- Translations: all UI text via `useTranslation()`/`t('c:key')`, never hardcoded. Template components read only `common.json` keys (apps override from `app.json`). Files and namespaces: [locales/README.md](../locales/README.md).

## Testing

- Test modes: [Testing](/docs/page/guides/testing).
- The authorization server runs in-process for tests: `backend/tests/oauth-helpers.ts` (`startTestOauthServer`, `clientCredentialsToken`, `authorizationCodeToken` through the consent routes).

## Deploy debugging

Prod deploys are immutable VM generations on Scaleway (Pulumi + S3 control object). The LB-overlap cutover waits for the new VM to serve `X-App-Version: <SHA>` (`/health` → 204 backend/yjs/mcp/oauth, 200 frontend). "cutover unhealthy / wait-for-version timeout" means the app never bound its port: almost always a **boot-time crash**, not the LB.

1. **Read the boot logs first.** The boot runner ([infra/boot/src/boot.ts](../infra/boot/src/boot.ts)) runs `docker compose up --wait` and uploads the VM's boot log (its phases and the migrate companion's output, mounted read-only into the runner) plus a crashed container's stdout/stderr to the `boot-diag/` prefix of the boot-diag bucket. Read it with `pnpm --filter infra diag --sha <sha>` (`--service backend`, `--list`, `--mode staging`, `--replay`): it prints only that release's bundle, and "no boot bundle for <sha>" means the boot runner never finished (a hung phase, or it never started). [infra/tasks/deploy-run.ts](../infra/tasks/deploy-run.ts) runs it for the deploying release on rollout failure.
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
- **PR size**: a PR that adds more lines than it removes ends its description with a `## Size` section. It holds the table that `pnpm cella stats --since origin/main --md` prints, then one line per kind that grew (source, tests, stories, generated, json, docs) saying what those lines are for; for source, also how much of it is comments. Lines that have no reason are the first to cut.
- Breaking OpenAPI diffs: [Cache-bust](./SCHEMA_EVOLUTION.md#cache-bust-interim).

## Commands

- `pnpm dev`: Dev servers for every package, including the `oauth/` and `mcp/` workers (each exits at once while its `appConfig.services` entry is disabled). Start PostgreSQL first with `pnpm docker`. A linked git worktree runs its stack on ports of its own, never the main checkout's (`appConfig.frontendUrl` names them, never pass `--port`): [Dev ports](../shared/README.md#dev-ports).
- `pnpm check`: Runs `sdk` + typecheck + `lens:check` + `lint:fix` (which includes the style and doc checks).
- `pnpm generate`: Create Drizzle migrations from schema changes.
- `pnpm sdk`: Regenerate OpenAPI spec and frontend SDK.
- `pnpm seed`: Seed database with test data.
- `pnpm test`: Run the full test suite with summary coverage.
- `pnpm infra`: Infra CLI for deployment: [Infra docs](/docs/page/guides/deployment)
- `pnpm bench`: Run benchmark scenarios: [Bench docs](/docs/page/guides/load-testing)
- `pnpm cella`: Sync with cella and more (`@cellajs/cli`).
- `pnpm story`: Start storybook
