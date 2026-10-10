# New entity

This document is the working recipe for adding an entity to the hierarchy, followed top to bottom.

### TL;DR

Declare the entity in configuration and add it to the listed registration points. Cella then wires
up the applicable database protections, live updates, generated API types, and offline storage.
There is no separate integration layer to write for each entity. Copy from `attachment` for content
or `organization` for a container throughout.

Pick the kind ([Architecture](./ARCHITECTURE.md#entity-hierarchy-model)): a **channel entity** (`organization`) or a **product entity** (`attachment`).

## Product entity

### Config

- [hierarchy-config.ts](../shared/config/hierarchy-config.ts): add `.product('<name>', { parent: '<channel>' })` after its parent. Optional: `relatedChannels` for non-ancestor refs.
- [config.default.ts](../shared/config/config.default.ts): nothing required. Opt-ins: `seenTrackedProductTypes` (unseen badges), `memberStatProductTypes` (the products counted per member in the members table; it ships as `['attachment']`, so an app with its own primary product names that one), `productEmbeddings` (embedded as an id-array in another entity, drives CDC ref-counting and cache patching), `defaultRestrictions.quotas`, `requestLimits`.
- [permissions-config.ts](../shared/config/permissions-config.ts): add `case '<name>'` with CRUD cells per role and channel (`1` allow, `0` deny, `'own'` creator-only) ([Permissions](./PERMISSIONS.md)).

### Backend

- `backend/src/modules/<name>/<name>-db.ts`: copy [attachment-db.ts](../backend/src/modules/attachment/attachment-db.ts): spread `productColumns('<name>')` and `channelRelationColumns('<name>')`. Keep the `(organizationId, seq)` index (test-enforced), `organizationForeignKey(table)`, and `tenantSelectPolicy` + `writeThroughPolicies`. Non-entity tables: [Optional capabilities](#optional-capabilities).
- [channel-tables.ts](../backend/src/db/channel-tables.ts) or [product-tables.ts](../backend/src/db/product-tables.ts): add a lazy getter. This feeds `entityTables` and with it RLS grants, the CDC publication, immutability triggers, and activity tracking. The CDC worker reads nothing until the publication matches its registry, so rerun the migrations (`pnpm --filter backend migrate`) before starting it.
- `<name>-schema.ts`: Zod schemas plus `evolutionContract.product('<name>', { createItem, updateOps, blockFields })`, copy [attachment-schema.ts](../backend/src/modules/attachment/attachment-schema.ts); `blockFields` names the block-document columns. CI `lens:check` fails without it ([Schema evolution](./SCHEMA_EVOLUTION.md)).
- Other files, copy the [attachment module](../backend/src/modules/attachment/): `<name>-routes.ts` (`createXRoutes` with `xGuard: [actorGuard, tenantGuard, orgGuard]`; a route that carries `xTool` needs a guard that takes an access token, so one behind `userGuard` is refused at load), `<name>-handlers.ts`, `<name>-queries.ts`, `operations/*.ts`, `<name>-mocks.ts`. Reads in `tenantRead()`, writes in `tenantContext()` ([tenant-context.ts](../backend/src/db/tenant-context.ts)). Permissions via `canCreateEntity` / `getValidProduct` / `resolveCollectionReadFilter`. An update reads its row with `getValidProduct(txCtx, id, '<name>', 'update', { forUpdate: true })` inside the write transaction, so its merge starts from a locked row. Creates run `checkIdempotency(ctx, <name>sTable, mutationId)` before inserting; creates and updates call `<name>Contract.assertBlockFields(input, organizationId)`.
- `<name>-module.ts`: declare the mount in `defineBackendModule`, e.g. `routes: [{ path: '/:tenantId/:organizationId/<name>s', app: handlers, phase: 'tenant' }]`. [routes.ts](../backend/src/routes.ts) mounts per phase. Import the module in the pinned [modules.ts](../backend/src/modules.ts).
- `operations/get-<name>s.ts`: copy [get-attachments.ts](../backend/src/modules/attachment/operations/get-attachments.ts) with `find<Name>sPaginated` from [attachment-queries.ts](../backend/src/modules/attachment/attachment-queries.ts). The operation builds the read scope and reads via `tenantReadIncludingDeleted` for a delta; the query takes `seqCursor` from the query schema, applies `seqCursorFilters`, orders `asc(seq)` then `asc(id)` and includes tombstones. `buildCollectionReadWhere(readFilter, <name>sTable, '<name>', actor)` compiles the read scope, and a `channelId` query param narrows the list with `buildSubtreeCoverWhere` on top of that scope: the rows homed at or below that channel.
- A product that lives in a channel places its rows with [product-placement.ts](../backend/src/permissions/product-placement.ts), as the attachment module does: spread `placementFieldsSchema('<name>')` into the create-item schema, check each item with `validatePlacement` so a refusal names its field, and stamp `(await resolvePlacement(ctx, '<name>', item)).columns` on the row before `canCreateEntity`. All three follow the hierarchy: the client sends the id of the one channel the row lives in and the chain above it is read off that channel. `resolvePlacement` also returns the home, for a rule of the product's own; a move resolves the new home the same way.

### Migrations

- `pnpm generate`, review the SQL in `backend/drizzle/`, then `pnpm --filter backend migrate`.
- Optional seed at `backend/scripts/seeds/NN-<name>.seed.ts`. Product inserts must set `stx: mockStx()`.

### Frontend

- `frontend/src/modules/<name>/query.ts`, copy [attachment/query.ts](../frontend/src/modules/attachment/query.ts): `createEntityKeys<Filters>('<name>')` and `registerEntityQueryKeys('<name>', keys, deltaFetch)` (missing registration throws on SSE dispatch). Lists filtered on a row column can add `registerEqualityFilterKeys('<name>', ['<column>'])`, so a new row refetches only the lists it can belong to. Query options (canonical, infinite, detail) and mutations via `createOptimisticEntity`. Add `addMutationRegistrar(...)` so paused offline mutations resume after reload. Build the stx when the edit is made and pass it in the mutation's variables, as the attachment mutations do: an update that pauses offline is then sent as a replay (`stx.replayed`), which the query client sets. A product with a collaborative description registers the columns derived from it with `registerYjsOwnedFields` and `registerDescriptionDerivation`, as the attachment does. Columns the server stamps when another column is written (a body's keywords, a flag's actor) go in `derivedKeys` of `mergeServerResponse`, so an update's success takes them from the response too.
- Add `types.ts`, `search-params-schemas.ts`, and the UI components. Then `pnpm check` regenerates SDK types, client functions, and Zod schemas.
- `<name>-module.ts`: declare the entity in `defineFrontendModule` as `product: { entityType: '<name>' }`, with `memberStatIcon` when `memberStatProductTypes` lists it and `hiddenMemberCount: true` to keep its members-table column collapsed. `frontend/src/modules.ts` glob-imports every module file before first render.
- [entity-sync-queries.ts](../frontend/src/entity-sync-queries.ts) (pinned): import the canonical options (the eager import triggers self-registration) and push them in `buildEntitySyncQueries` under the parent channel. Add a route file under `frontend/src/routes/`.

### Verify

- `pnpm check` and `pnpm test` pass ([Quickstart](./QUICKSTART.md), [Testing](./TESTING.md)).

## Channel entity swaps

Same flow, copying from `organization`:

- Hierarchy: `.channel('<name>', { parent, roles })`. Roles must exist in the role registry.
- Policies: elevation and self rows ([Permissions](./PERMISSIONS.md#the-policy-consulted)).
- Table: spread `channelColumns('<name>')` plus a `unique(tenantId, id)` compound (composite-FK target). No RLS policies, no `seq`/`stx`.
- Slug: a create takes the slug from the client and refuses a taken one with `checkSlugsAvailable`, as the organization does. Where the server chooses it, `generateUniqueSlugs(ctx, names, '<name>')` ([generate-unique-slugs.ts](../backend/src/modules/entities/operations/generate-unique-slugs.ts)) returns one free slug per name of the batch.
- Counts: a count of the app's own on a channel's `included.counts` (open tasks, milestones) is declared in `appChannelCountFields` in the pinned [app-schemas.ts](../backend/src/schemas/app-schemas.ts), which types it in the response schema and the SDK; the operation that reads the channel adds the value.
- Frontend: declare the entity in `<name>-module.tsx` as `channel: { entityType: '<name>', menuSection, listQuery }` (copy [organization-module.tsx](../frontend/src/modules/organization/organization-module.tsx); wrap the query factory in an arrow so the ESM binding is read at call time), add a `channelRouteConfig` entry in the pinned [routes-config.tsx](../frontend/src/routes-config.tsx), and add the entity to `menuStructure` in [config.default.ts](../shared/config/config.default.ts). To fix which tabs its page shows, in which order, list them under `surfaces['<name>.tabs']` there; the first id is the tab a link to the channel lands on. Skip `buildEntitySyncQueries`.

## Optional capabilities

- **Public read**: `publicRead()` in the policy case. A row's `publicAt` publishes it to anonymous actors on reads and SSE.
- **Drafts**: spread `...publishedColumn` ([published-column.ts](../backend/src/db/utils/published-column.ts)) into the table and re-run `pnpm generate`. Rows stay author-only and out of the CDC stream until `publishedAt` is set. Publishing is an update of its own route that sets `publishedAt` once: read the row with `getValidProduct(txCtx, id, '<name>', 'update', { forUpdate: true })`, which only the author passes for a draft, return an already published row as it is, store `<name>Contract.resolveServerUpdateOps(row, { publishedAt })` and dispatch `<name>.updated`. Replication emits the publish as an insert, so the sync engine, the counters and the mention notifications treat it as the row's creation.
- **View counts**: reuse [entities-queries.ts](../backend/src/modules/entities/entities-queries.ts): `findProductViewCount` for single reads, `productViewCountSelect()` + `productViewCountJoin(<table>.id)` for list joins, `productViewCountSchema` ([entities-schema.ts](../backend/src/modules/entities/entities-schema.ts)) for the response field. Never re-derive the `product_counters` query.
- **Partitioning and grants for non-entity tables**: register in [product-tables.ts](../backend/src/db/product-tables.ts): `appPartitionConfigs` for time-partitioned tables with retention (drives the partition migration, its `maintain_partitions()` procedure, the verify block, and the parity test), `appFullCrudTables` or `appReadOnlyTables` for tables outside RLS that need `runtime_role` grants.
- **Scheduled jobs and queues**: declare `jobs: [{ name, cron, run }]` (pg-boss cron on a singleton queue, UTC) and `queues: [{ name, handler, ... }]` in `defineBackendModule`; the jobs worker creates, schedules and works them ([Jobs worker](../jobs/README.md)). Never edit `main.api.ts`.
- **Per-channel tool arrangement**: `toolsConfig` already exists via `channelColumns()`. Expose it on the channel's response/update schemas (see `organization-schema.ts`) and merge it in the update query via [jsonb-merge.ts](../backend/src/db/utils/jsonb-merge.ts).
