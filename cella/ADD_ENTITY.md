# New entity

This document is the working recipe for adding an entity to the hierarchy, followed top to bottom.

### TL;DR

Declare the entity in configuration and add it to the listed registration points. Cella then wires
up the applicable database protections, live updates, generated API types, and offline storage.
There is no separate integration layer to write for each entity. Copy from `attachment` for content
or `organization` for a container throughout.

First decide which kind you are adding
(see [Architecture](./ARCHITECTURE.md#entity-hierarchy-model)):

- **Channel entity** (like `organization`): a container that owns memberships and roles. The
  application checks access, and changes refresh through normal API queries.
- **Product entity** (like `attachment`): user-generated content without its own memberships. It
  gets tenant-protected reads plus full offline and live-update support.

## Product entity

### Config

- [hierarchy-config.ts](../shared/config/hierarchy-config.ts): add `.product('<name>', { parent: '<channel>' })` to the chain. Parents must be declared earlier in the chain; optional `relatedChannels` for non-ancestor refs.
- [config.default.ts](../shared/config/config.default.ts): taxonomy arrays and id columns derive from the hierarchy, so nothing is required. Add opt-ins only if relevant: `seenTrackedProductTypes` (unseen badges), `productEmbeddings` (entity is embedded as an id-array in another entity), `defaultRestrictions.quotas`, `requestLimits`.
- [permissions-config.ts](../shared/config/permissions-config.ts): add a `case '<name>'` with CRUD cells per role and channel. Cells: `1` allow, `0` deny, `'own'` creator-only; optionally `publicRead()`. See [Permissions](./PERMISSIONS.md).
  - `publicRead` never cascades from a parent; if you need that, propagate `publicAt` down as data.

### Backend

- `backend/src/modules/<name>/<name>-db.ts`: Drizzle table, copy [attachment-db.ts](../backend/src/modules/attachment/attachment-db.ts). Spread `productColumns('<name>')` and `channelRelationColumns('<name>')`; never hand-write those columns. Keep the `(organizationId, seq)` index (delta sync, test-enforced), the tenant composite FK, and `tenantSelectPolicy` + `writeThroughPolicies`. See [Multi-tenancy](./MULTI_TENANCY.md#adding-tables) before adding any non-entity table.
- [tables.ts](../backend/src/tables.ts): add the table to `entityTables`. This one registration drives RLS grants, the CDC publication, immutability triggers and activity tracking.
- `<name>-schema.ts`: Zod schemas plus `evolutionContract.product('<name>', { createItem, updateOps })`, copy [attachment-schema.ts](../backend/src/modules/attachment/attachment-schema.ts). CI `lens:check` fails without the contract. See [Schema evolution](./SCHEMA_EVOLUTION.md).
- Remaining module files, copy the [attachment module](../backend/src/modules/attachment/): `<name>-routes.ts` (`createXRoute` with `xGuard: [authGuard, tenantGuard, orgGuard]`), `<name>-handlers.ts`, `<name>-module.ts` (`registerModule`), `<name>-queries.ts`, `operations/*.ts`, `<name>-mocks.ts`.
  - Wrap reads in `tenantRead()` and writes in `tenantContext()` from [tenant-context.ts](../backend/src/db/tenant-context.ts); permission checks via `canCreateEntity` / `getValidProduct` / `resolveCollectionReadFilter`.
- [routes.ts](../backend/src/routes.ts): mount `baseApp.route('/:tenantId/:organizationId/<name>s', handlers)`. Param-segment mounts go after static mounts.
- `operations/get-<name>s.ts`: support `seqCursor` catch-up, copy [get-attachments.ts](../backend/src/modules/attachment/operations/get-attachments.ts): accept `seqCursor` in the query schema, filter via `seqCursorFilters`, order by `asc(seq)` with `asc(id)` tiebreak, include tombstones, and read via `tenantReadIncludingDeleted`.

### Migrations

- `pnpm generate`, review the SQL in `backend/drizzle/`, then `pnpm --filter backend migrate`. The RLS/CDC/immutability SQL regenerates from `entityTables`; nothing to hand-write.
  - Optional seed at `backend/scripts/seeds/NN-<name>.seed.ts`; product inserts must set `stx: mockStx()`.

### Frontend

- `frontend/src/modules/<name>/query.ts`, copy [attachment/query.ts](../frontend/src/modules/attachment/query.ts):
  - `createEntityKeys<Filters>('<name>')` and `registerEntityQueryKeys('<name>', keys, deltaFetch)`; a missing registration throws at runtime when the SSE stream dispatches.
  - Query options (canonical, infinite, detail) and mutations using `createOptimisticEntity`.
  - `addMutationRegistrar(...)` so paused offline mutations resume after reload.
- Add `types.ts`, `search-params-schemas.ts` and the UI components. SDK types, client functions and Zod schemas are generated from the backend OpenAPI; run `pnpm check` to regenerate.
- [list-queries-config.tsx](../frontend/src/list-queries-config.tsx): import the module's canonical options (this is the eager import that triggers self-registration) and push them in `buildEntitySyncQueries` under the parent channel. Add a route file under `frontend/src/routes/`.

### Verify

- `pnpm check` and `pnpm test` pass. Dev loop: [Quickstart](./QUICKSTART.md); test modes: [Testing](./TESTING.md).

## Channel entity swaps

Same flow with these swaps, copying from `organization`:

- Hierarchy: `.channel('<name>', { parent, roles })`; roles must exist in the role registry.
- Policies: distinguish elevation rows (declared on an ancestor channel, carrying `create`) from self rows (on the channel itself, omitting `create`). See the header comment in [permissions-config.ts](../shared/config/permissions-config.ts).
- Table: spread `channelColumns('<name>')`; add a `unique(tenantId, id)` compound so the table can be a composite-FK target. No RLS policies, no `seq`/`stx`.
- Frontend: register in `channelListQueriesByType` in [list-queries-config.tsx](../frontend/src/list-queries-config.tsx) and add the entity to `menuStructure` in [config.default.ts](../shared/config/config.default.ts); skip `buildEntitySyncQueries`.

## Optional capabilities

- **Public read**: `publicRead()` in the policy case; setting a row's `publicAt` publishes it to anonymous actors on reads and SSE alike.
- **Drafts**: spread `...publishedColumn` ([published-column.ts](../backend/src/db/utils/published-column.ts)) into the table and re-run `pnpm generate`; rows stay author-only and out of the CDC stream until `publishedAt` is set.
- **Unseen badges**: add the type to `seenTrackedProductTypes` in [config.default.ts](../shared/config/config.default.ts).
- **Embedded id-arrays**: add a `productEmbeddings` entry so CDC ref-counting and cache patching cover the embedding.
