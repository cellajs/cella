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
- [config.default.ts](../shared/config/config.default.ts): nothing required. Opt-ins: `seenTrackedProductTypes` (unseen badges), `productEmbeddings` (embedded as an id-array in another entity, drives CDC ref-counting and cache patching), `defaultRestrictions.quotas`, `requestLimits`.
- [permissions-config.ts](../shared/config/permissions-config.ts): add `case '<name>'` with CRUD cells per role and channel (`1` allow, `0` deny, `'own'` creator-only) ([Permissions](./PERMISSIONS.md)).

### Backend

- `backend/src/modules/<name>/<name>-db.ts`: copy [attachment-db.ts](../backend/src/modules/attachment/attachment-db.ts): spread `productColumns('<name>')` and `channelRelationColumns('<name>')`. Keep the `(organizationId, seq)` index (test-enforced), `organizationForeignKey(table)`, and `tenantSelectPolicy` + `writeThroughPolicies`. Non-entity tables: [Optional capabilities](#optional-capabilities).
- [channel-tables.ts](../backend/src/db/channel-tables.ts) or [product-tables.ts](../backend/src/db/product-tables.ts): add a lazy getter. This feeds `entityTables` and with it RLS grants, the CDC publication, immutability triggers, and activity tracking.
- `<name>-schema.ts`: Zod schemas plus `evolutionContract.product('<name>', { createItem, updateOps })`, copy [attachment-schema.ts](../backend/src/modules/attachment/attachment-schema.ts). CI `lens:check` fails without it ([Schema evolution](./SCHEMA_EVOLUTION.md)).
- Other files, copy the [attachment module](../backend/src/modules/attachment/): `<name>-routes.ts` (`createXRoute` with `xGuard: [authGuard, tenantGuard, orgGuard]`), `<name>-handlers.ts`, `<name>-queries.ts`, `operations/*.ts`, `<name>-mocks.ts`. Reads in `tenantRead()`, writes in `tenantContext()` ([tenant-context.ts](../backend/src/db/tenant-context.ts)). Permissions via `canCreateEntity` / `getValidProduct` / `resolveCollectionReadFilter`.
- `<name>-module.ts`: declare the mount in `defineBackendModule`, e.g. `routes: [{ path: '/:tenantId/:organizationId/<name>s', app: handlers, phase: 'tenant' }]`. [routes.ts](../backend/src/routes.ts) mounts per phase. Import the module in the pinned [modules.ts](../backend/src/modules.ts).
- `operations/get-<name>s.ts`: copy [get-attachments.ts](../backend/src/modules/attachment/operations/get-attachments.ts): `seqCursor` in the query schema, `seqCursorFilters`, order `asc(seq)` then `asc(id)`, include tombstones, read via `tenantReadIncludingDeleted`.

### Migrations

- `pnpm generate`, review the SQL in `backend/drizzle/`, then `pnpm --filter backend migrate`.
- Optional seed at `backend/scripts/seeds/NN-<name>.seed.ts`. Product inserts must set `stx: mockStx()`.

### Frontend

- `frontend/src/modules/<name>/query.ts`, copy [attachment/query.ts](../frontend/src/modules/attachment/query.ts): `createEntityKeys<Filters>('<name>')` and `registerEntityQueryKeys('<name>', keys, deltaFetch)` (missing registration throws on SSE dispatch). Query options (canonical, infinite, detail) and mutations via `createOptimisticEntity`. Add `addMutationRegistrar(...)` so paused offline mutations resume after reload.
- Add `types.ts`, `search-params-schemas.ts`, and the UI components. Then `pnpm check` regenerates SDK types, client functions, and Zod schemas.
- [list-queries-config.tsx](../frontend/src/list-queries-config.tsx): import the canonical options (the eager import triggers self-registration) and push them in `buildEntitySyncQueries` under the parent channel. Add a route file under `frontend/src/routes/`.

### Verify

- `pnpm check` and `pnpm test` pass ([Quickstart](./QUICKSTART.md), [Testing](./TESTING.md)).

## Channel entity swaps

Same flow, copying from `organization`:

- Hierarchy: `.channel('<name>', { parent, roles })`. Roles must exist in the role registry.
- Policies: elevation and self rows ([Permissions](./PERMISSIONS.md#the-policy-consulted)).
- Table: spread `channelColumns('<name>')` plus a `unique(tenantId, id)` compound (composite-FK target). No RLS policies, no `seq`/`stx`.
- Frontend: register in `channelListQueriesByType` in [list-queries-config.tsx](../frontend/src/list-queries-config.tsx) and add the entity to `menuStructure` in [config.default.ts](../shared/config/config.default.ts). Skip `buildEntitySyncQueries`.

## Optional capabilities

- **Public read**: `publicRead()` in the policy case. A row's `publicAt` publishes it to anonymous actors on reads and SSE.
- **Drafts**: spread `...publishedColumn` ([published-column.ts](../backend/src/db/utils/published-column.ts)) into the table and re-run `pnpm generate`. Rows stay author-only and out of the CDC stream until `publishedAt` is set.
- **View counts**: reuse [entities-queries.ts](../backend/src/modules/entities/entities-queries.ts): `findProductViewCount` for single reads, `productViewCountSelect()` + `productViewCountJoin(<table>.id)` for list joins, `productViewCountSchema` ([entities-schema.ts](../backend/src/modules/entities/entities-schema.ts)) for the response field. Never re-derive the `product_counters` query.
- **Partitioning and grants for non-entity tables**: register in [product-tables.ts](../backend/src/db/product-tables.ts): `appPartitionConfigs` for time-partitioned tables with retention (drives the partman migration, verify block, and parity test), `appFullCrudTables` or `appReadOnlyTables` for tables outside RLS that need `runtime_role` grants.
- **Scheduled jobs**: declare `jobs: [{ name, start }]` in `defineBackendModule` (`start` returns a stop handle). The API entrypoint runs them on the migration-owning instance only. Never edit `main.api.ts`.
- **Per-channel tool arrangement**: `toolsConfig` already exists via `channelColumns()`. Expose it on the channel's response/update schemas (see `organization-schema.ts`) and merge it in the update query via [jsonb-merge.ts](../backend/src/db/utils/jsonb-merge.ts).
