# Cella agent guidelines (AGENTS.md)

## Project summary

Cella is a TypeScript template for collaborative web apps with a sync engine for offline and realtime use. Postgres, OpenAPI and react-query are foundational layers. Stack, data model and entity kinds: [Architecture](./ARCHITECTURE.md).

Base config: [shared/config/config.default.ts](../shared/config/config.default.ts). Entity hierarchy and roles: [shared/config/hierarchy-config.ts](../shared/config/hierarchy-config.ts). Both feed `appConfig`, the merged runtime config exposed by `shared`. Every app changes config, hierarchy and permissions, so write entity-agnostic code and never hardcode the default entity set or its roles. Mode overrides: [shared/README.md](../shared/README.md). Secrets: `.env`.

## Before you finish

**Always run `pnpm check` at the repo root after any code change, and only report the work done once it passes clean.** Also run `pnpm generate` if you touched DB schemas, and `pnpm --filter infra exec vitest run` if you touched `infra/`. If `pnpm check` fails, fix it or say so explicitly.

## Routing

- **Backend** (Hono + OpenAPI): a module's routes are `createXRoutes` in `<module>-routes.ts`, never `createRoute`; `XRouteProps` documents each prop. A route's `operationId` is its key: set it only when the SDK name differs. Handlers use `.openapi()` in `<module>-handlers.ts`.
- **Frontend** (TanStack Router, file-based): never edit the generated `routeTree.gen.ts`. Route files are thin shims (path, `staticData`, glue); components and `beforeLoad` logic live in modules (`route-logic.ts`, `route-components.tsx`, `search-params-schemas.ts`) via `getRouteApi`. Layouts: [frontend/README](../frontend/README.md#routes).

## Middleware & guards

The API is same-origin: it has no CORS middleware. Guards and their usual chains: [Permissions](./PERMISSIONS.md#guards).

- Type an operation on the narrowest context it needs: `DbContext`, `ActorContext` (no user row), `OrgContext`, `UserContext` (session fields only behind `userGuard`).
- Mount `actorGuard` only on routes whose operations take `ActorContext`: an API key or access token sets no `ctx.var.user`.
- `orgGuard` runs after `tenantGuard`, both after the guard that sets the actor. Wrap guards, limiters and caches in `xMiddleware`; a guard declares its `security` and the context it `provides` and `requires`.
- Product entity handlers use the tenant helpers in `backend/src/db/tenant-context.ts` (`tenantReadAs` on a route without `tenantGuard`); channel entity handlers use `ctx.var.db` ([Multi-tenancy](./MULTI_TENANCY.md)).
- Declare a secret column only in `backend/src/db/secret-columns.ts`: response schemas, log redaction and the CDC row image derive from it.

## Error handling

Throw `AppError` with an i18n `type` from `locales/en/error` (an app's own in `locales/en/appError`); Postgres errors are mapped to one automatically. The client's global handler (`frontend/src/query/on-error.ts`) toasts every `ApiError`. A mutation toasts its own error only when it sets `meta.suppressGlobalErrorToast`, as product entities do through `createResourceError`; any other local `onError` toast shows the failure twice.

## Auth and permissions

Sign-in and sessions: [Authentication](./AUTHENTICATION.md). Machine access: [Interoperability](./INTEROPERABILITY.md). Decisions: [Permissions](./PERMISSIONS.md). Database backstop: [Multi-tenancy](./MULTI_TENANCY.md).

- Every check takes an `Access` from `accessFrom(ctx)`; never assemble one by hand. The frontend `can` map shapes the interface only, the backend decides.
- Tokens are issued, redeemed and spent through `auth/tokens/`, the only importer of `tokens-db`.
- Name the proof: session, API key or access token. `credential` is the WebAuthn word (passkeys) and nothing else. Machine-access terms: API key, access scope, binding, OAuth client.

## State & API

- **Server state**: TanStack Query; options, keys and mutations live in the module's `query.ts` ([Client](./CLIENT.md)).
- **Client state**: Zustand stores as `*-store.ts` in their module, read through a selector (`useShallow` for four or more fields). React context only for compound UI or third-party providers, never for app or feature state.
- **Persistence**: entities live in the query cache, never mirrored into Zustand; UI preferences in Zustand `persist`; never call `localStorage` from hooks or components. A new per-user store uses `idbKvStorage('<base>')` with `skipHydration: true`, registers in `local-user-storage.ts` (app-owned: `extra-local-user-stores.ts`), and scopes tenant, organization or entity inside its state, never in the key ([per-user database](./CLIENT.md#the-per-user-database)).
- **SDK**: never edit the generated `sdk/gen/`. Run `pnpm sdk` after a backend route or schema change and import types from `sdk`; module-specific types go in the module's `types.ts`.
- **Membership**: the frontend uses `included.membership` only to seed `meKeys.memberships`; never flatten it onto entities or read it in UI, cache mutations or feature logic.
- **DB schemas**: Drizzle tables live in module `*-db.ts` files, registered in the pinned `channel-tables.ts` or `product-tables.ts`. Entity ids are UUID v7; nanoid only for short ids (tenant ids) or ids longer than a UUID.
- **Validation**: Zod schemas in `<module>-schema.ts`, shared ones in `backend/src/schemas/`. A request array takes `.max()` before any refinement; a request record is a `boundedRecord` or a `z.partialRecord` over an enum.
- **Types**: infer them from Zod. Avoid `as`; prefer `Object.assign`, `satisfies` or `as const`. **Never use `as unknown as`** without explicit permission: try `isNull()`, a generic type parameter or a dedicated type, and where nothing fits (a library type gap, a test mock) comment why.
- **Query modules**: keys, cache writes, optimistic placeholders, invalidation and slug resolution use the helpers in `frontend/src/query/basic/`, and mutation defaults register through `addMutationRegistrar` in a `query.ts` that the module's `<name>-module.ts` imports ([add-entity](./skills/add-entity/SKILL.md)). Read a queued mutation through the `mutation-variables.ts` shapes, never a cast, and register a version (`registerVariablesVersion`) when its shape changes ([Paused writes](./SYNC_ENGINE.md#paused-writes)).

## OpenAPI & mocks

- Register a named component (`.openapi('Name')`) only for a whole entity response or a crucial shared base type, in the module's `*-schema.ts` with a `description`, a `mockXResponse()` example and `x-tags` from `schemaTags(kind, module, owner)` (owner `'cella'` in the template, `'app'` in an app). Inline enums and request bodies, and share one schema when the shape is identical. A variant stays unnamed and overrides `description` and `example` when they no longer fit.
- A nullable named schema is `z.union([schema, z.null()])`, never `schema.nullable()`.
- Each entity has an insert mock for tests and seeds and a deterministic response mock for OpenAPI examples. A mock that generates a unique value takes its enforcer from `mockUniqueEnforcer()`.

## Sync engine

Model: [Sync engine](./SYNC_ENGINE.md).

- Mint a write's `stx` when the edit is made (`createStxForUpdate` and its siblings) and pass it in the mutation variables; a create handler finds a replay by its row ids (`checkIdempotency()`).
- A server-driven write (CDC fan-out, materialization, a scheduled job) or an update that changes no field stores its `stx` through `stripChangedFields`, else the CDC worker attributes the write to the wrong columns.
- A fact that is no product row reaches clients as a stream signal of ids, declared in `defineBackendModule` and `defineFrontendModule` (`signals`), sent after the commit with `sendSignal`, and versioned when a client that was away must still hear it ([Changes and signals](./SYNC_ENGINE.md#changes-and-signals)).
- Sync-derived per-user state extends only through sync events (`sync-events.ts`); never import module logic into the prioritizer.
- Columns derived from a collaborative description register in `query.ts` ([add-entity](./skills/add-entity/SKILL.md#6-optional-capabilities)), a description shown in place builds on `useInPlaceDescription`, and a backend write that dispatches no `<type>.updated` calls `recordYjsOutsideWrite` ([Yjs](../yjs/README.md#outside-writes)).
- A breaking wire-shape change ships as an append-only lens in `shared/src/schema-evolution/` (never edit a shipped one) and, until the first lens ships, bumps `appConfig.clientCacheVersion` ([Cache-bust](./SCHEMA_EVOLUTION.md#cache-bust-interim)). Every entity module routes bodies through its `evolutionContract`.

## Cross-product references

Relationships between products are data, never permission indirection: permissions and public read flow through the hierarchy's channel columns. Exactly two mechanisms exist ([Embeddings](./SYNC_ENGINE.md#embeddings)): a host id array declared in `appConfig.productEmbeddings`, whose config-driven machinery never needs engine code, and the mutation bus (`onMutation`/`dispatchMutation`) for lifecycle side effects an embedding cannot express. Derive usage counts on the client from synced host rows, and let a host write keep only ids of live rows in its organization (`filterExistingProductIds`). A child-side host FK (a nullable `<host>Id` column pointing at another product) is deprecated: sync views, CDC, propagation hints and counters do not see it ([conversion guide](https://github.com/cellajs/cella/blob/0.23.0/cella/migrations/20260730T1009-owned-host-embedding/README.md)).

## Coding patterns

- **Modules and placements**: a `frontend/src/modules/<name>/` folder registers itself in `<name>-module.ts` via `defineFrontendModule`. Content one page hosts from many modules is a tool placed into a slot, arranged by `appConfig.surfaces` and the channel's `toolsConfig`. `visibleTo` is a UI boundary only, never data authorization, and an entity link targets its layout route without a tab ([Modules and placements](../frontend/README.md#modules-and-placements)).
- **Entity id columns**: id-column names come only from the hierarchy (`EntityIdColumns<TS, V>`, `EntityIdColumnKey<T>`, `appConfig.entityIdColumnKeys[type]`); never hand-write `` `${type}Id` `` or hardcode a key like `'projectId'`. The organization is the fixed spine: write `'organization'` and `organizationId` directly, and declare it with `organization()` in the hierarchy builder.
- **Hierarchy methods**: row-location logic and entity-kind guards are bound methods of `EntityHierarchy`, never free functions, and an injectable hierarchy parameter is typed `EntityHierarchy` and defaults to the app singleton. A `vi.mock('shared')` factory that replaces `hierarchy` also overrides `isChannel` and `isProduct`.
- **Row stamps**: a table a user or a service writes spreads `auditColumns()`, a product table also `tombstoneColumns()`; writer columns reference `actors`, except on memberships, invitations and tokens. Every write moves `updatedAt`/`updatedBy` (a publish and a soft delete too), only through `updateStamps` or `deleteStamps`; a moment comes only from `getIsoDate()`, and a timestamp column is `isoTimestamp()`, never drizzle's `timestamp()`. A reversible state is a boolean or a status, never a client-sent timestamp; a one-way act is `<verb>At` plus `<verb>By`. On the wire a writer is an `ActorRef` (`withActorRefs`); a base schema carries no writers, a full one spreads `auditShape`.
- **Icons**: `lucide-react` with `*Icon` names, sized with `size-*` classes, never lucide's `size` prop. An icon prop is typed `IconComponent`; a custom SVG icon carries the `lucide` class.
- **Retention**: every period lives in `appConfig.retention`. A rule that only deletes aged rows is an entry of `sweepRules`; a pg-boss job does only what reaches outside the database. A table with stored files names its columns in `backend/src/db/storage-columns.ts` ([Data lifecycle](./ARCHITECTURE.md#data-lifecycle)).
- **Alignments**: every sync-breaking change ships a `cella/alignments/<id>/` folder in the same PR ([alignments](./alignments/README.md)).
- **Dependencies**: a library for encryption, signatures, an auth protocol or a parser at a security boundary stays even when own code would save packages; fix how it is called. Own code replaces a package only for plumbing a reviewer reads in one pass.
- **Reorder**: every reorderable list, table or board moves its items through `ReorderHandle` (in a table, `reorderColumn`), with no separate move buttons.
- **Accessibility**: `pnpm a11y` audits against WCAG 2.2 AA ([a11y](../a11y/README.md)); an agent's decision on a criterion stays provisional until a person confirms it.
- **Skills**: `cella/skills/` is the single home for agent skills, synced to apps: `add-entity`, `verify`, `two-tab-sync-test`, `cella-sync`, `align`, `a11y-review`, `consistency-sweep`, `screenshots`. `verify` owns stack setup and scratch Playwright scripts for the others. A change to a command, file or log line a skill names updates that skill in the same PR.

## Style & naming

- Biome formats and lints (`pnpm lint:fix`). Zod v4 only: `import { z } from 'zod'`, in the backend from `@hono/zod-openapi`. camelCase variables and functions (constants included), PascalCase components, kebab-case files, snake_case translation keys.
- **JSDoc**: a backend export gets a line, plus `@param`/`@returns`/`@throws` where name and type leave the contract open (a unit, an empty or null case, a refusal); a frontend export gets one line, or none when identifier and types carry the meaning. No file-level comments above imports. A comment over three prose lines documents a declaration or a local executable block, and a mechanism that spans files is documented on the declaration that enforces it.
- **Comment budget**: a member gets one line when name and type underdetermine the contract (default, constraint, unit or encoding, null or empty case, population source), always for `unknown`, `any` or a bare primitive, and none when a named type carries the meaning or the default shows in the same file. A local gets one line of rationale (two means rename or extract), JSX the constraint only, a repetitive block one comment above it; measurement and motivation go in the commit. The same comment text never appears in two files. Keep existing comment content unless cleanup is asked for; trimming to this budget is always in scope.
- **Never use em dashes (`—`, U+2014)** anywhere, code and config included: split the sentence, use a colon, or drop the clause. Comments never use contrast or history phrases (`instead`, `rather than`, `previously`, `used to`, `maybe`, `we should`).
- **Agent vocabulary**: name the concrete behavior. Replace `load-bearing` with the dependency or failure it abbreviates and `authoritative` with who decides; `seam`, `land`, `surface` as a verb, `wiring`, `scaffold`, `floor`, `decisive`, `genuinely`, `cleanly`, `honest take` and `silently` are review signals for an exact term (boundary, merge, report, registration, minimum). Exact domain terms (`canonical`, `idempotent`, `stale`) stay, and identifiers are never renamed for prose style.
- **Template and app**: `template` for Cella; `app`, `app-owned` or `app-specific` for a project built from it; `sync-breaking` for an upstream change that requires app work after a sync. In code, `cella` names the template only in contrast with the app, never the running system, and the product name is never an identifier, claim, header, DNS record or URL literal in `backend/src`, `shared/src` or `frontend/src`: derive it from `appConfig.slug` or `appConfig.name`.
- `materialize` names only the Yjs operation that turns collaborative state into durable entity data; elsewhere use `persist`, `provision`, `create` or `resolve`.
- **Prefer plain composable functions over configuration factories.** `createX(config)` returning behavior is justified only to bind long-lived shared state for many call sites, such as mutation options bound to a QueryClient.
- **Reserved domain vocabulary**, never reused: `sync` (the entity sync engine), `schema` and `lens` (schema evolution), `channel` (channel entities, never a transport), `own` and `owner` (the permission engine's creator relation), `tool`, `slot` and `consumer` (UI placements; write "MCP tool" in full), `leader tab` and `election` (cross-tab coordination of the one SSE connection). A `signal` is a stream frame that is no row change (a parameter named `signal` is an `AbortSignal`), a `notification` an inbox row and its push or email, a `notice` a `pg_notify` payload, a `log` the logger or the Yjs update log. One row edit is a `change` in the WAL and on the stream, an `activity` once recorded (a history, never a log), a `message` across a process or tab boundary (a `frame` on the app stream), and an `event` inside one process.
- **Module names** say the domain role, not the primitive underneath (`tab-coordinator`, not `leader-lease`); a split names its remainder deliberately, never payload plus generic verb.
- **Docs**: a `##` heading in `frontend/src/content/docs/**` or in a Markdown file those pages import (`repoDocRoutes` in `frontend/vite.config.ts`) is at most 25 rendered characters, `cella/CHANGELOG.md` exempt. A link label holds no inline code: `[define.ts](./define.ts)`.
- **READMEs**: a README explains concepts and behaviour: what the part is for, its terms, its lifecycle told once, the guarantees a reader can rely on, what a user sees when it fails and what a developer does to extend or operate it. Limits, timings, status and close codes, function names, lock modes and race explanations stay in a comment at their declaration: a sentence that has to change when a constant or a function is renamed is a comment. A change in behaviour edits the README sentence that states it and adds none for the mechanism. Each concept has one owner: AGENTS.md states a rule and links it, and no docs page links into AGENTS.md for a concept; a package README owns its tool and commands, a skill its judgment steps (`verify` owns stack setup), a code-folder README maps its files. Pages along one pipeline each state their half and hand off; a consequence chain is told once, and a trigger site or a table's Why cell links to it.
- **UI**: primitives are Base UI (`@base-ui/react`), **not** Radix, wrapped shadcn-style in `frontend/src/modules/ui/`. Text takes one of four color steps by role and opacity never dims it at rest; `border-input` edges what a person acts on, plain `border` what frames content. Full rules and shadcn porting: [UI styling](../frontend/README.md#ui-styling).
- Stories live in the module's `stories/` as `<component-filename>.stories.tsx`. `console.log` only for temporary debugging, `console.info` for logging, `console.debug` for development. Linkable actions are `<Link>` with `buttonVariants()`, and sheet content a URL can target also opens in a new tab. With the React compiler, `useMemo` and `useCallback` are rarely needed.
- Translations: all UI text through `t('c:key')`, never hardcoded; template components read only `common.json` keys, which apps override from `app.json` ([locales](../locales/README.md)).

## Testing

Verify every change (a run, a measurement or a hand check the PR description reports); committing a test is a separate decision. A committed test earns its place by one of four reasons: it proves an attack fails, reproduces a bug that shipped, pins a contract another module or an app depends on, or checks a table-driven rule too wide to eyeball. Never add a test that mirrors its implementation, and a perf, UI or refactor PR adds none by default. In review, missing coverage outside those reasons is not a finding; a mirror test is. How to judge a test, and the test modes: [Testing](./TESTING.md#goals).

## Deploy debugging

A deploy that never serves its new version almost always hit a boot-time crash, not the load balancer: read the boot accounts first ([Debug a failed deploy](./deployment/RUNBOOKS.md#debug-a-failed-deploy)).

## Commits & PRs

- Use `git` and `gh`. Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`.
- PRs: concise description, linked issues, passing checks, scoped changes.
- **PR size**: a PR that adds more lines than it removes ends its description with a `## Size` section: the table `pnpm cella stats --since origin/main --md` prints, then one line per kind that grew saying what those lines are for (for source, how much is comments; for tests, which of the four reasons in [Testing](#testing) each new test file serves). Lines without a reason are the first to cut.

## Commands

- `pnpm dev`: dev servers for every package; start PostgreSQL first with `pnpm docker`. A linked git worktree runs on ports of its own: never pass `--port` ([Dev ports](../shared/README.md#dev-ports)).
- `pnpm check`: `sdk`, typecheck, `lens:check` and `lint:fix` (style and doc checks included).
- `pnpm generate`: Drizzle migrations from schema changes. `pnpm sdk`: the OpenAPI spec and the SDK.
- `pnpm seed`: test data. `pnpm test`: the full suite with summary coverage.
- `pnpm infra`: the deployment CLI ([Infra CLI](../infra/README.md)). `pnpm bench`: load tests ([Load testing](../bench/README.md)).
- `pnpm cella`: template sync and more (`@cellajs/cli`). `pnpm story`: Storybook.
