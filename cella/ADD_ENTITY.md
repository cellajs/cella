# Adding an entity

This document explains how to add a new **entity type** to the app. It is the companion to the three fork-configuration files you will touch most:

- [`shared/config/hierarchy-config.ts`](../shared/config/hierarchy-config.ts) — the entity taxonomy (source of truth)
- [`shared/config/config.default.ts`](../shared/config/config.default.ts) — the derived entity metadata arrays
- [`shared/config/permissions-config.ts`](../shared/config/permissions-config.ts) — access policies per entity

Read [ARCHITECTURE.md](./ARCHITECTURE.md) first for the big picture. This guide is worked around the **`task`** entity — the most complete product entity in the codebase — and uses a hypothetical new product entity, **`note`** (parented to `project`), as the running example.

## The core idea: config-driven, not switch-driven

There is almost no `switch (entityType)` in the engine. The entity taxonomy is declared **once** in the `hierarchy` builder, mirrored into a few `appConfig` arrays, and everything else is either **derived** from that declaration or **looked up at runtime from a registry**. The RLS layer, CDC publication, sync-engine dispatch, query keys, offline cache, and permission fan-out all read the hierarchy/config rather than hardcoding entity names.

So adding an entity is mostly: **declare it in config, write its table + module, register it in two or three registries, and run migrations.** A large amount of behavior then comes for free. Each step below is tagged:

- 🟢 **Automatic** — derived from config/hierarchy or resolved from a registry. You add nothing; it "just works" once the entity is declared.
- 🔴 **Manual** — you write or edit this.

Two entity kinds exist (see [ARCHITECTURE.md](./ARCHITECTURE.md) § Data modeling):

- **Context entity** (`organization`, `workspace`, `project`) — has memberships and roles; access via app-layer guards; **no RLS, no `seq`/`stx`**.
- **Product entity** (`task`, `label`, `attachment`) — user-generated content, no memberships; **RLS-protected**, participates in the sync engine (`seq`/`stx`).

The bulk of this guide covers **product entities**. Context-entity differences are in [§ Context entities](#context-entities).

---

## Guardrail: the compiler keeps config in sync

Before diving in, know your safety net. The three "declare it" edits (hierarchy, `config.default.ts` arrays, `entityIdColumnKeys`) are cross-checked **at compile time** by [`shared/src/config-builder/config-validation.ts`](../shared/src/config-builder/config-validation.ts). It bidirectionally asserts that `entityTypes ≡ hierarchy.allTypes`, `contextEntityTypes ≡ hierarchy.contextTypes`, `productEntityTypes ≡ hierarchy.productTypes`, and that `entityIdColumnKeys` has a `` `${K}Id` `` entry for every type. If you add to the hierarchy but forget an array (or vice versa), **the build fails** — you cannot get these out of step silently. Separately, the CI job `lens:check` fails if a product/context entity does not register its wire schema (Step 6).

---

## Product entity — step by step

We add a `note` product entity living inside a `project`.

### Step 1 — 🔴 Declare it in the hierarchy

[`shared/config/hierarchy-config.ts`](../shared/config/hierarchy-config.ts) is the single source of truth. Add one `.product(...)` call to the chain:

```ts
export const hierarchy = createEntityHierarchy(roles)
  .user()
  .context('organization', { parent: null, roles: ['admin', 'member'] })
  .context('workspace', { parent: 'organization', roles: roles.all })
  .context('project', { parent: 'organization', roles: roles.all })
  .product('task', { parent: 'project' })
  .product('label', { parent: 'project' })
  .product('note', { parent: 'project' })            // ← new
  .product('attachment', { parent: 'project', host: 'task' })
  .build();
```

`.product(name, options)` options:

- **`parent`** (required) — the entity's **home context**. Becomes the non-null `<context>Id` column and the most-specific link in its ancestor chain. Products *must* have a home; the builder throws otherwise.
- **`host`** (optional) — product-to-product ownership (e.g. `attachment` hosted by `task`). Generates a nullable `<host>Id` column; host deletes cascade to hosted rows; CDC maintains per-host `e:<hostedType>` counts. The host must be a previously-declared product sharing the **same home context**. See [§ Optional capabilities](#optional-capabilities).
- **`relatedContexts`** (optional) — non-ancestor context references (nullable id columns).

The builder ([`entity-hierarchy.ts`](../shared/src/config-builder/entity-hierarchy.ts)) validates at construction: parents/hosts must be declared **before** children, parents must be contexts, hosts must be products sharing the home context, roles must exist, `organization` + `user()` are mandatory. **Order matters** — declare parents and hosts earlier in the chain.

> **Public readability is not declared here.** It is a permission concern — see Step 3.

### Step 2 — 🔴 Register entity metadata in `appConfig`

Add the type to the string-literal arrays in [`shared/config/config.default.ts`](../shared/config/config.default.ts) (all `as const` — literal types are load-bearing for Drizzle strict enums):

```ts
entityTypes:        ['user', 'organization', 'workspace', 'project', 'task', 'label', 'note', 'attachment'] as const,
productEntityTypes: ['task', 'label', 'note', 'attachment'] as const,   // (contextEntityTypes if a context)
entityIdColumnKeys: {
  // ...existing...
  note: 'noteId',        // must be exactly `${type}Id`
} as const,
```

Optional arrays, add only if relevant:

- `seenTrackedEntityTypes` — opt in to unseen-count badges (grouped by parent context).
- `entityEmbeddings` — only if the entity is embedded as an id-array inside another entity (like `label` inside `task.labels`).
- `menuStructure` — for context entities that appear in the user menu.
- `defaultRestrictions.quotas` — per-tenant quota.
- `requestLimits` — default list page size.

You do **not** edit [`app-config.ts`](../shared/src/config-builder/app-config.ts) (it only merges env modes) or [`shared/types.ts`](../shared/types.ts) 🟢 — the `EntityType` / `ProductEntityType` unions are `typeof appConfig.*` and update automatically.

### Step 3 — 🔴 Declare access policies

Add a `case` to the `switch` in [`shared/config/permissions-config.ts`](../shared/config/permissions-config.ts). The callback gives you `contexts` (CRUD cells per role×context), `publicRead`, `delegateToHost`, and `restrict`. Model it on `task`:

```ts
case 'note':
  // Public read: readable by anyone when the parent project's publicAt is set (optional)
  publicRead('publicParent');
  contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
  contexts.organization.member({ create: 0, read: 0, update: 0, delete: 0 });
  contexts.project.admin({ create: 1, read: 1, update: 1, delete: 1 });
  contexts.project.member({ create: 1, read: 1, update: 1, delete: 1 });
  contexts.project.guest({ create: 0, read: 1, update: 0, delete: 0 });
  break;
```

Cell values: `1` allowed, `0`/omitted denied, `'own'` = built-in "actor is creator" row condition, or a `RowCondition` object.

- **Product entities have no "self" rows** — their context rows are *home* rows where `create` is meaningful. (Context entities distinguish *elevation* rows on an ancestor, which carry `create`, from *self* rows on the same context, which omit it. See the header comment in `permissions-config.ts`.)
- **`publicRead(mode)`** — `'publicSelf'` (row's own `publicAt`), `'publicParent'` (parent's `publicAt`), or `'publicParentOrSelf'`. A `publicParent` grant requires the parent to declare a self-publication grant, or configuration throws.
- **`delegateToHost(actions)`** — hosted row inherits the action if its host row allows it; requires `host:` in the hierarchy (Step 1).
- **`restrict(restriction)`** — subject-level row restriction.

### Step 4 — 🔴 Create the database table

Colocated with the module: `backend/src/modules/note/note-db.ts`. (Tables are discovered by glob — `./src/modules/**/*-db.ts` in [`drizzle.config.ts`](../backend/drizzle.config.ts) — no barrel import.) Model on [`task-db.ts`](../backend/src/modules/task/task-db.ts):

```ts
export const notesTable = snakeCase.table(
  'notes',
  {
    ...productEntityColumns('note'),   // id, entityType, tenantId, name, stx, description,
                                       // keywords, createdBy/updatedBy, deletedAt/By, seq, ...
    organizationId: uuid().notNull(),
    projectId: uuid().notNull().references(() => projectsTable.id, { onDelete: 'cascade' }),
    // ...entity-specific columns
  },
  (table) => [
    index('notes_project_seq_index').on(table.projectId, table.seq),   // required for delta sync
    index('notes_tenant_id_index').on(table.tenantId),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizationsTable.tenantId, organizationsTable.id],
    }).onDelete('cascade'),
    tenantSelectPolicy('notes', table),   // RLS SELECT (fail-closed on app.tenant_id)
    ...writeThroughPolicies('notes'),     // RLS INSERT/UPDATE/DELETE (required under FORCE RLS)
  ],
);

export type NoteModel = typeof notesTable.$inferSelect;
export type InsertNoteModel = typeof notesTable.$inferInsert;
```

Mandatory columns come from the spread helpers — **do not hand-write them**:

| Provided by | Columns |
|---|---|
| `productEntityColumns('<type>')` | `stx` (jsonb, sync metadata), `seq` (bigint, CDC delta cursor), `description`, `keywords`, `createdBy/updatedBy`, `deletedAt/deletedBy` (soft delete) |
| ↳ `tenantEntityColumns` (nested) | `id` (uuid v7 PK via `generateId`), `entityType` (enum locked to the type), `tenantId` (FK → tenants), `name`, `createdAt`, `updatedAt` |

Conventions: `snakeCase.table(...)` maps camelCase fields → snake_case columns automatically; table name is the pluralized type (`note` → `notes`); ids are plain **UUID v7** (time-ordered, no prefixes). You may replace the explicit `organizationId`/`projectId` columns with `...contextRelationColumns('note')` (emits NOT-NULL ancestor id columns from the hierarchy) and, for hosted entities, `...hostRelationColumns('note')` — see [`attachment-db.ts`](../backend/src/modules/attachment/attachment-db.ts).

Which tables get RLS, immutability triggers, the CDC publication, and `REPLICA IDENTITY FULL` is derived from the registry in the next step — 🟢 no per-table wiring for any of those.

### Step 5 — 🔴 Register the table

Add the table to the `entityTables` map in [`backend/src/tables.ts`](../backend/src/tables.ts):

```ts
import { notesTable } from '#/modules/note/note-db';
// ...
export const entityTables = {
  // ...
  note: notesTable,
} as const satisfies Record<string, ResolvableTable>;
```

This is **the single most load-bearing manual edit**. The RLS migration, CDC publication migration, immutability triggers, activity tracking, and `getEntityTable()` all iterate this map — registering here is what makes those 🟢 automatic.

### Step 6 — 🔴 Register the wire schema (mandatory)

In `backend/src/modules/note/note-schema.ts`, register version-tolerant wire schemas via `createProductEntityWire` (from [`entity-wire.ts`](../backend/src/core/entity-wire.ts)). Model on [`task-schema.ts`](../backend/src/modules/task/task-schema.ts):

```ts
export const noteWire = createProductEntityWire('note', {
  createItem: noteCreateSchema,
  updatable: { name: /* ... */, /* ...updatable fields... */ },
});
export const noteUpdateStxBodySchema = noteWire.updateBodySchema;
export const noteCreateManyStxBodySchema = noteWire.createItemSchema.array().min(1).max(50);
```

This is the single registration point for the schema-evolution lens seams (`normalizeCreateItem`, `resolveUpdateOps` — HLC/AWSet merge). **It is enforced by CI** (`lens:check`, "entity-wire completeness"): every configured product/context entity must call its wire factory, or the build fails. See [SCHEMA_EVOLUTION.md](./SCHEMA_EVOLUTION.md) and the lens-seam note in [AGENTS.md](./AGENTS.md).

### Step 7 — 🔴 Write the module (routes, handlers, operations)

The canonical file set for a product entity module (`backend/src/modules/note/`), following `task`:

| File | Role |
|---|---|
| `note-db.ts` | Drizzle table (Step 4). |
| `note-schema.ts` | Zod schemas + `createProductEntityWire` (Step 6). |
| `note-routes.ts` | OpenAPI route defs via `createXRoute(...)`, each carrying the guard chain. |
| `note-handlers.ts` | `new OpenAPIHono<Env>()` app; binds routes to operations; **exports the mountable app**. |
| `note-module.ts` | `registerModule({ name, owner, scope, description })` (OpenAPI tag + metadata). Side-effect imported by handlers. |
| `note-queries.ts` | Raw Drizzle queries (RLS-scoped by `organizationId`). |
| `operations/*.ts` | Business logic: `create-notes.ts`, `update-note.ts`, `get-notes.ts`, `get-note.ts`, `delete-notes.ts`. |
| `note-mocks.ts`, `note-properties.ts` | OpenAPI examples, enums/constants. |

Two disciplines are non-negotiable:

**Guards.** Every tenant-scoped route declares the chain (in `note-routes.ts`):

```ts
xGuard: [authGuard, tenantGuard, orgGuard],
```

`authGuard` (session) → `tenantGuard` (resolves `:tenantId`) → `orgGuard` (resolves `:organizationId`, loads memberships).

**RLS-scoped DB access.** Handlers never hit the DB directly — they wrap queries in the tenant-context helpers from [`tenant-context.ts`](../backend/src/db/tenant-context.ts), which set the Postgres session vars the RLS policies enforce:

- `tenantRead(ctx, fn)` — read-only (hides tombstones).
- `tenantReadIncludingDeleted(ctx, fn)` — read-only, includes soft-deleted (for `seqCursor` delta sync).
- `tenantContext(ctx, fn)` — read-write, for mutations.

Write permission checks use `canCreateEntity` / `getValidProductEntity`; read scoping uses `resolveCollectionReadFilter` (from [`backend/src/permissions/`](../backend/src/permissions/)).

OpenAPI is 🟢 mostly automatic: routes are OpenAPI-native, mounting the handlers app registers the paths, and `registerModule` bridges to the tag registry. You only add `.openapi('Note', {...})` schema names and `tags`.

### Step 8 — 🔴 Mount the module

Two edits in [`backend/src/routes.ts`](../backend/src/routes.ts) — import and mount under the tenant-scoped prefix:

```ts
import { noteHandlers } from '#/modules/note/note-handlers';
// ...
baseApp.route('/:tenantId/:organizationId/notes', noteHandlers);
```

Order matters: param-segment mounts (`/:tenantId/...`) must come after static mounts so they cannot shadow static paths (see the comment in the file).

### Step 9 — 🔴 Support `seqCursor` delta sync in the list operation

For the entity to participate in catch-up sync, its list operation (`operations/get-notes.ts`) must, when `seqCursor` is present:

1. Extend `paginationQuerySchema` so `seqCursor` is accepted (in `note-schema.ts`).
2. Order by `asc(<table>.seq)` with an `asc(id)` tiebreak.
3. **Include tombstones** (skip the `isNull(deletedAt)` filter) so clients can drop deleted rows.
4. Use `tenantReadIncludingDeleted` instead of `tenantRead`.

Reuse the shared `seqCursorFilters` helper ([`seq-cursor.ts`](../backend/src/utils/seq-cursor.ts)). See [`get-tasks.ts`](../backend/src/modules/task/helpers/get-tasks.ts) for the pattern. The generic client catch-up endpoint (`POST /entities/app/stream`) needs no changes.

### What the sync engine gives you for free 🟢

Once the table is in `entityTables` (Step 5) and the type is in `productEntityTypes` (Step 2), the entire **Postgres WAL → CDC → SSE → client** pipeline covers the new entity with **no per-entity code**:

- **CDC publication + `REPLICA IDENTITY FULL`** — derived from `entityTables` by the CDC setup migration.
- **`seq` stamping** — the CDC worker stamps a hierarchy-scoped `seq` on every row generically (parent context resolved via `hierarchy.getParent`).
- **SSE dispatch** — [`entities-listeners.ts`](../backend/src/modules/entities/entities-listeners.ts) loops `appConfig.productEntityTypes` to register `activityBus` listeners; there is one generic `/entities/app/stream`, no per-entity endpoint.
- **Permission-filtered fan-out** — the dispatcher derives ancestor context ids from the hierarchy and runs `checkPermission('read', ...)` per subscriber.

See [SYNC_ENGINE.md](./SYNC_ENGINE.md) for the full pipeline.

### Step 10 — 🔴 Generate & apply migrations

```bash
pnpm generate                      # drizzle-kit diffs *-db.ts → backend/drizzle/, then regenerates
                                   # CDC/RLS/immutability/publication SQL from entityTables + appConfig
# review the generated SQL in backend/drizzle/
pnpm --filter backend migrate      # apply
```

`pnpm generate` runs an ordered set of migration scripts (`backend/scripts/migrations/*.migration.ts`): `00-drizzle` (table diff) plus `10-cdc`, `10-rls`, `10-immutability`, etc. — the latter regenerate their SQL from `entityTables`/`appConfig`, which is why Steps 4–5 are all it takes to get RLS, CDC, and immutability. Optionally add a seed at `backend/scripts/seeds/NN-note.seed.ts` (a product insert must set `stx: createServerStx()` — `stx` is `NOT NULL`).

### Step 11 — 🔴 Frontend module & self-registration

The frontend has no per-entity `switch` either — each entity's module **self-registers** into runtime registries via an import side-effect. Create `frontend/src/modules/note/query.ts`, modeled on [`task/query.ts`](../frontend/src/modules/task/query.ts) / [`attachment/query.ts`](../frontend/src/modules/attachment/query.ts). It must:

1. Build query keys — `createEntityKeys<Filters>('note')` (scope keys are 🟢 derived from the hierarchy's ancestors).
2. **Register keys + delta-fetch** — `registerEntityQueryKeys('note', keys, deltaFetch)`. This is what lets the generic SSE stream handler find the entity. **Missing this throws at runtime.**
3. Define query options (canonical list, infinite list, detail) + a `createCacheFinder<Note>('note')`.
4. Define mutations (`useNoteCreate/Update/DeleteMutation`) using the shared `cacheCreate/Update/Remove` + `createOptimisticEntity(zNote, ...)` helpers.
5. **Register offline mutation defaults** — `addMutationRegistrar((qc) => qc.setMutationDefaults(keys.create, { mutationFn }))` so paused/offline mutations resume after reload.

The SDK types, client functions, and Zod schemas (`import { type Note, getNotes } from 'sdk'`, `import { zNote } from 'sdk/zod.gen'`) are 🟢 generated from the backend OpenAPI — you do not hand-write an API client. Regenerate with `pnpm check` (or the SDK generate script).

Also add the entity's `types.ts`, `search-params-schemas.ts`, and its table/UI components.

### Step 12 — 🔴 Trigger eager registration & add the route

Self-registration only runs if `query.ts` is **imported eagerly** before the SSE stream connects. The eager entry point is [`frontend/src/list-queries-config.tsx`](../frontend/src/list-queries-config.tsx):

- Add the module's canonical query import there, and add the entity to `buildEntitySyncQueries` (the map that pushes a product's canonical query to sync when its parent context loads — e.g. `notesCanonicalOptions` under `project`).

Then add the file-based route under `frontend/src/routes/_app/.../` (e.g. a `notes.tsx` tab). `routeTree.gen.ts` regenerates automatically.

### What the frontend gives you for free 🟢

Once `registerEntityQueryKeys` + `addMutationRegistrar` run (via the eager import), these are automatic — all driven by the registries + `appConfig.productEntityTypes`:

- **SSE dispatch** ([`app-stream-handler.ts`](../frontend/src/query/realtime/app-stream-handler.ts)) — generic create/update/delete handling by registry lookup.
- **Offline persistence** ([`persister.ts`](../frontend/src/query/persister.ts)) — product queries routed to per-query IndexedDB persistence.
- **Cache-migration eligibility, failed-sync quarantine, sync priority, reconnection catch-up** — all entity-agnostic.

---

## Context entities

A context entity (has memberships + roles) differs from the product recipe:

- **Step 1**: use `.context('name', { parent, roles, relatedContexts? })`. `roles` must be non-empty and from the role registry.
- **Step 2**: register under `contextEntityTypes` (not `productEntityTypes`).
- **Step 3**: policies distinguish **elevation** rows (on an ancestor context — carry `create`) from **self** rows (on the same context — omit `create`). See the `project`/`workspace` cases and the header comment in [`permissions-config.ts`](../shared/config/permissions-config.ts).
- **Step 4**: use `...contextEntityColumns('name')` (adds `slug`, thumbnails, etc.). Add a `unique(tenantId, id)` compound constraint so the table can be a composite-FK target. **No `tenantSelectPolicy`/`writeThroughPolicies`, no `seq`/`stx`** — context entities have no RLS and no sync layer (offline read only; access is guard-enforced).
- **Frontend**: register in `contextEntityListQueriesByType` and add a `menu-config.tsx` section (+ `menuStructure` in `config.default.ts`) rather than `buildEntitySyncQueries`.

Context entities do **not** go through the CDC/SSE product pipeline or the wire-schema factory in the same way — see [ARCHITECTURE.md](./ARCHITECTURE.md) for how context entities sync.

---

## Optional capabilities

- **Host (product-to-product ownership)** — declare `host: 'task'` in Step 1; the hosted table gets a nullable `<host>Id` column (`...hostRelationColumns`), host deletes cascade (API + CDC), CDC maintains per-host `e:<hostedType>` counts, and you can `delegateToHost([...])` in Step 3. Host and hosted must share the same home context. Reference: `attachment` hosted by `task`.
- **Public read** — `publicRead(mode)` in Step 3 (see modes above). Product entities typically use `'publicParent'`; the parent must itself declare a self-publication grant.
- **Unseen-count badges** — add the type to `seenTrackedEntityTypes` (Step 2); tracking in [`app-stream-handler.ts`](../frontend/src/query/realtime/app-stream-handler.ts) and the `seen` module then covers it automatically, grouping badges by the parent context.
- **Embedded id-arrays** — if the entity is referenced as an id array on another entity (like `label` in `task.labels`), add an `entityEmbeddings` entry (Step 2) so CDC ref-counting, cache patching, and cascade suppression handle it.

---

## Checklist

**🔴 Manual — you edit these:**

1. [`shared/config/hierarchy-config.ts`](../shared/config/hierarchy-config.ts) — `.product(...)` / `.context(...)`
2. [`shared/config/config.default.ts`](../shared/config/config.default.ts) — `entityTypes`, `productEntityTypes`/`contextEntityTypes`, `entityIdColumnKeys` (+ optional arrays)
3. [`shared/config/permissions-config.ts`](../shared/config/permissions-config.ts) — a `case` in the policy switch
4. `backend/src/modules/<name>/<name>-db.ts` — the Drizzle table
5. [`backend/src/tables.ts`](../backend/src/tables.ts) — add to `entityTables`
6. `backend/src/modules/<name>/<name>-schema.ts` — `createProductEntityWire(...)` (CI-enforced)
7. `backend/src/modules/<name>/` — routes, handlers, module, queries, operations (with guards + RLS helpers)
8. [`backend/src/routes.ts`](../backend/src/routes.ts) — import + `baseApp.route(...)`
9. `operations/get-<name>s.ts` — `seqCursor` delta handling
10. `pnpm generate` → review → `pnpm --filter backend migrate` (+ optional seed)
11. `frontend/src/modules/<name>/query.ts` — `createEntityKeys` + `registerEntityQueryKeys` + `addMutationRegistrar` + options + mutations (+ `types.ts`, UI)
12. [`frontend/src/list-queries-config.tsx`](../frontend/src/list-queries-config.tsx) — eager import + sync map; and a route file

**🟢 Automatic — derived from config/registries, no code:**

- Derived TS unions (`shared/types.ts`) & config-consistency checks (`config-validation.ts`)
- RLS grants, CDC publication + `REPLICA IDENTITY FULL`, immutability triggers, `seq` stamping (all iterate `entityTables`/`appConfig`)
- Backend SSE listener registration + permission-filtered fan-out
- SDK types/client/Zod (regenerated from OpenAPI)
- Frontend query-key scopes, SSE dispatch, offline persistence, cache migration, sync priority, catch-up, unseen counts (once opted in)

**Verify** with `pnpm check` (types + OpenAPI/SDK regen + lint) and `pnpm test`. See [QUICKSTART.md](./QUICKSTART.md) for the dev loop and [TESTING.md](./TESTING.md) for tests.

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — entity kinds, hierarchy builder, guard chain, data modeling
- [SYNC_ENGINE.md](./SYNC_ENGINE.md) — the CDC → SSE pipeline product entities plug into
- [SCHEMA_EVOLUTION.md](./SCHEMA_EVOLUTION.md) — the wire/lens system (Step 6) and evolving an entity's shape later
- [AGENTS.md](./AGENTS.md) — routing, guards, permissions, and coding conventions
