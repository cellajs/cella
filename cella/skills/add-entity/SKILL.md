---
name: add-entity
description: Add a product or channel entity to an app built from cella. Settles kind, name, parent and roles with the user, declares the entity in the hierarchy, copies the reference module, fills every registration point (the typecheck, lens:check and the config-driven tests name most of them), keeps each edit where a template sync leaves it alone, and proves the result in the running app.
---

# Adding an entity

Use when an app needs a new kind of data: a **channel** (a place people join, with members and
roles) or a **product** (content inside a channel). The hierarchy entry does most of the work: from
it the template derives the id columns, RLS, the CDC publication, permission checks, counters, live
updates and the offline queue. What you write is the module and a few registrations. Copy the
reference module, keep its order of checks, and leave out what the new entity does not need.

## 1. Settle the design

Ask the user what the request leaves open. These are costly to change once rows exist.

| | Product | Channel |
| --- | --- | --- |
| Is | Content in a channel: syncs live, works offline, inherits access from its channel | A place with members and roles: plain CRUD, no offline queue |
| Name | Singular camelCase (`task`, `courseSection`): becomes the `<name>Id` column, the `<name>s` table and path, the locale keys | Same |
| Parent | Its home channel. `nullableAncestors` lets a row live higher up the chain, `relatedChannels` links a channel outside it | The organization or a channel below it |
| Roles | None of its own: the policy matrix grants per channel role | `roles` from the registry, most privileged first, plus `organizationRoles`; optional `elevated` and `drafts` |
| Reference | `attachment` | `organization` (step 5 lists what a channel below it adds) |

Then ask which opt-ins it needs (step 6): a collaborative description, drafts, public read,
notifications, unseen badges, member stats, view counts, embedding in another product.

## 2. Keep it upgrade-safe

The app pulls template updates with `pnpm cella upgrade` (the `cella-upgrade` skill). Where an edit lives
decides whether an upgrade touches it; the app's `cella/cella.config.ts` lists `ignored` and `pinned`.

- **The new module folders** (`backend/src/modules/<name>/`, `frontend/src/modules/<name>/`): both
  module files declare `owner: 'app'`, and the CLI never merges an app module. Where attachment
  writes `'cella'` in a route tag or a schema's `x-tags`, write `'app'`.
- **App-owned, never merged**: `shared/config/` (hierarchy, config, permissions), `locales/*/app.json`,
  `backend/drizzle/`.
- **Pinned registries**, where the app's copy always wins: `backend/src/db/channel-tables.ts`,
  `backend/src/db/product-tables.ts`, `backend/src/modules.ts`, `backend/src/mocks/app-product-mocks.ts`,
  `backend/src/schemas/app-schemas.ts`, `frontend/src/entity-sync-queries.ts`, `frontend/src/routes-config.tsx`.
- **Any other template file**: every change carries a `// fork: <why>` marker, or the next upgrade can
  merge it away. Look for a registration point first, and tell the user about each such edit.

## 3. Declare it

1. `shared/config/hierarchy-config.ts`: `.product('<name>', { parent: '<channel>' })` or
   `.channel('<name>', { parent, roles, organizationRoles })`, after its parent. Roles come from the
   `roles` registry at the top of the file, listed most privileged first: that order decides who may grant
   what, since nobody hands out a role above their own, directly or through `organizationRoles` and `carryRole`.
2. `shared/config/permissions-config.ts`: a `case '<name>'` with one line per channel and role (`1`
   allow, `0` deny, `'own'` creator only). A type without a case is denied to every role, and nothing
   reports it. The model: [Permissions](../../PERMISSIONS.md).
3. `shared/config/config.default.ts`: the opt-ins of step 6; a channel also goes in `menuStructure`.
4. `pnpm --filter backend ts`. The registries typed `satisfies Record<…EntityType, …>` fail on the
   new type: `channel-tables.ts` or `product-tables.ts`, and the product mock registry (filled in
   `app-product-mocks.ts`). The other backend errors follow from those and close with them. The
   frontend typecheck means something only after `pnpm sdk` has run on the new routes; it then asks
   for `routes-config.tsx` and `menuStructure` (a channel) and the `<name>` and `<name>_other` locale
   keys, which are typed.

## 4. Product entity

Copy from `attachment`, file by file. Its file handling is attachment's own and stays out unless
the product stores files: storage keys, presigned URLs, uploads, the offline blob store, the viewer
and the renderers.

### Backend: `backend/src/modules/<name>/`

- `<name>-db.ts` from `attachment-db.ts`: `...productColumns('<name>')`, the product's own columns,
  `...channelRelationColumns('<name>')`. Its index list starts with `...productIndexes('<name>s', table)`
  and `...channelRelationIndexes('<name>s', table, '<name>')`, adds an index for the list's default
  order, and ends with `organizationForeignKey(table)`, `tenantSelectPolicy('<name>s', table)` and
  `...writeThroughPolicies('<name>s')`. A secret column (a hash, a token) goes in
  `backend/src/db/secret-columns.ts`, a column naming a stored file in `backend/src/db/storage-columns.ts`.
- A lazy getter in `backend/src/db/product-tables.ts`, which feeds `entityTables`: RLS grants, the
  CDC publication, triggers and activity tracking follow from it.
- `<name>-schema.ts` from `attachment-schema.ts`: the response schema (the select schema with
  `auditShape`, `tombstoneShape` and `stx`, named with `.openapi('<Name>', …)`), then
  `<name>Contract = evolutionContract.product('<name>', { createItem, updateOps, blockFields })`.
  `blockFields` names the BlockNote columns, empty when there are none. A request array takes a
  `.max()`. `lens:check` fails a product without its contract ([Schema evolution](../../SCHEMA_EVOLUTION.md)).
- `operations/`, one file per operation:
  - **Create** (`create-attachments.ts`): normalize each item with `<name>Contract.normalizeCreateItem`.
    `checkIdempotency(ctx, <name>sTable, ids)` runs first, and only the items it did not return go on:
    per item `assertBlockFields`, `resolvePlacement` (its `columns` on the row, `public` copied from
    the home channel) and `canCreateEntity(ctx, buildSubjectFromEntity('<name>', row))`. The insert runs
    through `insertWithinTenantQuota(txCtx, '<name>', insert)`, which checks the tenant quota under a
    lock, and shares one `tenantContext` with `dispatchMutation(txCtx, '<name>.created', { after })`.
    The answer holds the rows and `rejectedIds`, and is 201 only when this request inserted a row.
  - **Update**: `getValidProduct(txCtx, id, '<name>', 'update', { forUpdate: true })` inside the write
    transaction, so the merge starts from a locked row; `assertBlockFields` on the ops.
  - **List** (`get-attachments.ts`): the query schema is `productListQuerySchema({ …own params })`.
    `seqRangeOf(input)` tells a range read, which reads through `tenantReadIncludingDeleted`, AND-s
    the `where` of `seqRangeRead(<name>sTable, range)` and orders by its `orderBy`; a normal read
    uses `tenantRead` and hides deleted rows. `resolveCollectionReadFilter` and
    `buildCollectionReadWhere(readFilter, <name>sTable, '<name>', actor)` give the read scope, and a
    `channelId` param narrows it with `buildSubtreeCoverWhere`. The product's own filters stay out of
    a range read: a row that leaves the filter would never reach the caches. The rows go out through
    `projectTombstones('<name>', …)` after `withActorRefs`, so a deleted row carries no content, and
    the route declares the page with `productListResponseSchema('<name>', <name>Schema)`.
  - **Delete** (`delete-attachments.ts`): the soft delete stores the body's `stx` ids, or a
    `createServerStx()` without one, through `stripChangedFields(<name>sTable.stx, stx)`.
  - **Single read** (`get-attachment.ts`).
- `<name>-queries.ts`, `<name>-handlers.ts`, and `<name>-mocks.ts`: an insert mock, a response mock
  under `withFakerSeed`, and the request-body mocks the route examples use.
- `<name>-routes.ts`: `createXRoutes(['<name>s', 'app', 'product'], { … })`, every route with
  `xGuard: [actorGuard, tenantGuard, orgGuard]` and attachment's limiters, the detail read with
  `xCache: [productCache('<name>')]`, and `...errors(…)` in `responses` for the statuses its
  handler throws beyond its guards and limiters, as attachment's routes list them. A route agents
  may call takes `xTool`, which implies its scope; any other route takes `xScope: '<name>:read'`
  or `'<name>:write'`.
- `<name>-module.ts`: `defineBackendModule({ name: '<name>s', owner: 'app', scope: ['frontend', 'backend'],
  description, productEntity: '<name>', routes: [{ path: '/:tenantId/:organizationId/<name>s', app, phase: 'tenant' }] })`,
  imported in `backend/src/modules.ts`.
- The insert mock in `backend/src/mocks/app-product-mocks.ts`: the RLS, CDC and sequence suites seed
  every product through it.

### Migrations and seed

- `pnpm generate`, read what it wrote under `backend/drizzle/` (the schema diff, then the folder with
  grants, triggers and the publication), then `pnpm --filter backend migrate`. The CDC worker reads
  nothing until the publication matches its registry, so migrate before starting it.
- A type change of an array column with a default (`text[]` to `uuid[]`) needs a `DROP DEFAULT`
  before drizzle's `SET DATA TYPE … USING` and a `SET DEFAULT` after: Postgres does not cast the default.
- A seed, if the user wants rows to look at: `backend/scripts/seeds/NN-<name>.seed.ts` from
  `20-attachment.seed.ts`. Product inserts set `stx: mockStx()`.

### Frontend: `frontend/src/modules/<name>/`

Run `pnpm sdk` first: the module imports its types, client functions and Zod schemas from `sdk`.

- `query.ts` from attachment's:
  - `createEntityKeys<Filters>('<name>')` and `registerEntityQueryKeys('<name>', keys, rangeFetch)`,
    where `rangeFetch` spreads the `query` it receives (range and chunk limit) into the list request.
    Without the registration the first stream event for the type throws.
  - The canonical options (one list per parent channel, which sync keeps fresh), the list options
    and the detail options. The list fetches end in `.then(liveItems)`, which types their rows.
  - Create, update and delete mutations: placeholders from `createOptimisticEntity`, variables typed
    `CreateVariables`, `UpdateVariables` and `DeleteVariables` (`~/query/offline/mutation-variables`),
    the stx built when the edit is made (`createStxForCreate`, `createStxForUpdate`,
    `createStxForDelete`) and passed in the variables. `squashIntoPendingCreate` gets the keys of
    the create item schema.
  - `addMutationRegistrar(…)` with the defaults of all three ([Paused writes](../../SYNC_ENGINE.md#paused-writes)).
  - Lists filtered on a row column: `registerEqualityFilterKeys('<name>', ['<column>'])`, so a new
    row refetches only the lists it can belong to. A column the server stamps when another one is
    written goes in `derivedKeys` of `mergeServerResponse`.
- `<name>-module.ts`: `defineFrontendModule({ name: '<name>s', owner: 'app', scope: ['frontend', 'backend'],
  description, product: { entityType: '<name>' } })`, with `import '~/modules/<name>/query'` at the top,
  so the mutation defaults exist before the cache restore.
- `types.ts`, `search-params-schemas.ts` and the UI. A reorderable list moves its rows through
  `ReorderHandle`.
- `frontend/src/entity-sync-queries.ts`: import the canonical options and push them in the parent
  channel's `case`.
- A route that shows it, usually a tab of the parent channel's page: a thin file in that channel's
  route folder, like `frontend/src/routes/_app/$tenantId.$organizationSlug/organization/attachments.tsx`,
  with its `staticData.navTab`. A product shown inside another page (a panel, a sheet) needs no
  route: its `deepLinkParam` (step 6) opens it.
- Locale keys in `locales/en/app.json` and each other language the app ships: `<name>`,
  `<name>_other` and the texts its UI shows.

## 5. Channel entity

Copy from `organization`. The organization is the spine: it has no parent, one per tenant, and its
create is gated by the tenant alone. A channel below it differs where this section says. A channel
table stays outside RLS: its handlers use `ctx.var.db`, and no `seq`, `stx` or offline queue applies.

### Backend

- `<name>-db.ts`: `...channelColumns('<name>')`, then `organizationId: uuid().notNull()` and a
  non-null id column for each channel between it and the organization, the parent's with
  `.references(() => <parent>sTable.id, { onDelete: 'cascade' })`. The generated `path` column reads
  these. Indexes on name, `createdAt`, `createdBy` and `updatedBy` as `organization-db.ts` has them,
  plus `tenantId` and each ancestor column; `unique('<name>s_tenant_id_unique').on(table.tenantId, table.id)`
  (the composite FK target of memberships and products) and `organizationForeignKey(table)`.
- A lazy getter in `backend/src/db/channel-tables.ts`.
- `<name>-schema.ts`: `evolutionContract.channel('<name>', { createItem, updateBody })`. App counts
  on its `included.counts` go in `appChannelCountFields` in `backend/src/schemas/app-schemas.ts`; the
  operation that reads the channel fills them.
- Routes (`organization-routes.ts`): create at `/{tenantId}/{organizationId}/<name>s` with
  `[userGuard, tenantGuard, orgGuard]` and `insertEntityLock` before the limiter; read and update at
  `/{tenantId}/{organizationId}/<name>s/{id}` with `[actorGuard, tenantGuard, orgGuard]` and
  `xScope: '<name>:read'` or `'<name>:write'`; the user's list across organizations at `/<name>s`
  with `[userGuard, relatableGuard]`. The module mounts its handlers at `/` with `phase: 'absolute'`.
- **Create** (`create-organizations.ts`): normalize with `<name>Contract.normalizeBody`; check the
  slugs with `checkSlugsAvailable` and reject a taken one as `slug_exists` (where the server picks the
  slug, `generateUniqueSlugs(ctx, names, '<name>')`); apply the quota; for a parent below the
  organization, read it and refuse one from another organization;
  `canCreateEntity(ctx, buildSubject('<name>', { organizationId, <parent>Id }))` (the organization
  skips it). One transaction inserts the rows, dispatches `<name>.created` and inserts the creator's
  membership with `insertMemberships` (role `hierarchy.getMostPrivilegedRole('<name>')`). Run it in
  `tenantContext` when a `<name>.created` handler writes product rows, whose fail-closed select policy
  hides every row outside a tenant transaction. Then `invalidateCache.user(user.id)`. A channel that
  declares `drafts` accepts `draft` and creates with `publishedAt: null`, as the organization does
  ([Drafts](../../PERMISSIONS.md#drafts)).
- The policy case needs elevation and self lines ([Permissions](../../PERMISSIONS.md#the-policy-consulted)).

### Frontend

- `<name>-module.tsx` from `organization-module.tsx`: `channel: { entityType: '<name>', menuSection,
  listQuery: (params) => <name>sListQueryOptions(params) }`. The arrow reads the binding at call time.
  A channel shown under another one in the menu (`menuStructure` `subentityType`) declares no
  `menuSection`. Augment the slot context with
  `declare module '~/lib/placements' { interface ChannelEntityByType { <name>: Enriched<Name> } }`.
- `frontend/src/routes-config.tsx`: `<name>: { path: '/$tenantId/$organizationSlug/<name>/$slug',
  paramName: 'slug' }`, with `subitemOf: { entityType, searchParam }` for a menu subentity.
- `shared/config/config.default.ts`: an entry in `menuStructure`, and `surfaces['<name>.tabs']` to fix
  which tabs its page shows and in which order.
- Routes under `frontend/src/routes/_app/$tenantId.$organizationSlug/<name>.$slug/`, built like the
  `organization/` folder: `route.tsx` with `tabsSlot: '<name>.tabs'` and `guardNavTabs` in its
  `beforeLoad`, which also resolves the channel from the slug (`resolveChannelBySlug`) into the route
  context; `members.tsx`, `settings.tsx` (`<ChannelSettingsPage entity={…} />`, with a
  `settings-tools.tsx` built from the `*ToolBase` helpers) and `$tool.tsx` for slot tabs. Logic and
  components go in the module's `route-logic.ts` and `route-components.tsx`.
- `frontend/src/entity-sync-queries.ts`: a `case '<name>'` that calls `addMembersQuery('<name>')`
  and pushes the canonical options of the products below it.
- Locale keys in `locales/en/app.json`: `<name>`, `<name>_other`, `tab_<name>s.text` when it is a
  tab of its parent, and the texts of its pages.

### Moving a product under it

Products often move into the new channel (`attachment` from `organization` to `project`). Change the
product's `parent` in the hierarchy, then the pinned seed homes (`attachment-placement.ts`,
`bench/src/seeds/attachment-home.ts`) and `attachmentUploadTargets` in the config. Rows that already
exist need a data migration that gives them the new id column.

## 6. Optional capabilities

- **Collaborative description**: a `description` in `blockFields`, `yjsMaterializer: update<Name>Op`
  in the backend module, and in `query.ts` `registerYjsOwnedFields` plus
  `registerDescriptionDerivation` for the columns derived from it, as attachment does. Model:
  [Sync engine](../../SYNC_ENGINE.md#yjs).
- **Drafts** ([Sync engine](../../SYNC_ENGINE.md#drafts)): spread `...publishedColumn`
  (`backend/src/db/utils/published-column.ts`) into the table and generate again. Publishing is a
  route of its own: read the row with `getValidProduct(txCtx, id, '<name>', 'update', { forUpdate: true })`,
  return a published row as it is, store `<name>Contract.resolveServerUpdateOps(row, { publishedAt })`
  and dispatch `<name>.updated`.
- **Public read**: `publicRead()` in the policy case. A row whose `public` flag is set then reads for
  anonymous actors too, on reads and on the stream.
- **Notifications**: `notifications: true` in the backend module (or the readers of
  `ModuleNotifications` in `backend/src/lib/module.ts`), and `deepLinkParam` in the frontend
  `product` declaration: the search param that opens one row on the page that lists it.
- **Unseen badges, member stats**: list the type in `seenTrackedProductTypes`, or in
  `memberStatProductTypes` with a `memberStatIcon` on the frontend `product`.
- **View counts**: `findProductViewCount` for one row, `productViewCountSelect()` with
  `productViewCountJoin(<table>.id)` for a list, `productViewCountSchema` for the response field
  (`backend/src/modules/entities/`). Never query `product_counters` yourself.
- **Embedding in another product**: an id array on the host, declared in `appConfig.productEmbeddings`
  ([Embeddings](../../SYNC_ENGINE.md#embeddings)). A host write keeps only the ids `filterExistingProductIds` returns.
- **Limits**: `defaultRestrictions.quotas` for a per-tenant cap, `requestLimits` for batch sizes.
- **Tables that are no entity**: register them in `backend/src/db/product-tables.ts`:
  `appPartitionConfigs` for a time-partitioned table with retention (its period from
  `appConfig.retention`), `appFullCrudTables` or `appReadOnlyTables` for a table outside RLS that
  the runtime role needs.
- **Rows that come with another entity** (default labels in each new project): `onMutation:
  { '<type>.created': handler }` in the module that owns the rows; the handler runs inside the
  create's transaction.
- **Scheduled jobs and queues**: `jobs` and `queues` in `defineBackendModule`; the jobs worker
  creates and runs them ([Jobs worker](../../../jobs/README.md)).
- **A per-user client store** (recent picks): `idbKvStorage('<base>')` with `skipHydration: true`,
  registered in `frontend/src/query/extra-local-user-stores.ts` (pinned).
- **Error types of its own**: `<type>` and `<type>.text` in `locales/en/appError.json`, thrown as
  `new AppError(status, '<type>', severity)`.
- **Accessibility audit and load tests**: the new pages and their states in `a11y/scope-config.ts`
  (pinned), with a placeholder for the slug; bench rows through `registerBenchSeed` in
  `bench/src/seeds/` with an `order` after the rows they reference.

## 7. Verify

1. `pnpm check` passes.
2. `pnpm test`. The suites that loop over every configured type (RLS isolation, schema verification,
   the product mock registry, request bodies, secret columns) now cover the entity. A failure there
   is a registration this skill names, never a test to adjust. Add a test only for a rule of the
   entity's own, such as a policy with a row condition ([Testing](../../TESTING.md)).
3. In the running app (`pnpm seed`, then the `verify` skill): open the page, create, rename and
   delete a row, and reload. For a product, the `two-tab-sync-test` skill: a create in one tab shows
   in the other, and a create made offline replays when the tab is back online.

## Report

Tell the user the kind, parent, roles and policy lines chosen, the opt-ins added and left out, each
template file edited with its `// fork:` marker, the outcome of each verify step, and what remains (UI,
other languages).
