# Seam consolidation: derived memberships, module routes, product tables, app schemas

## What & why

Five pinned files lose their pins; behavior and the wire contract are unchanged for a root-only
hierarchy.

- `memberships-db.ts` and `inactive-memberships-db.ts` are template-owned:
  `membershipChannelColumns()` and `membershipChannelIndexes()`
  (`backend/src/db/utils/channel-relation-columns.ts`) derive one nullable, cascade-deleting
  `<channel>Id` per non-root channel and one `<table>_<channel>_user_archived_idx` index each.
- `defineBackendModule` takes `routes: [{ path, app, phase? }]` (`phase`: `static` by default;
  `absolute` for apps mounted at `/` with `/:tenantId/...` routes; `tenant` for
  `/:tenantId/:organizationId/...`). `backend/src/routes.ts` is template-owned; the pinned
  `backend/src/modules.ts` import list registers modules.
- `tables.ts` is template-owned: `entityTables` derives from the pinned lazy-getter maps
  `channel-tables.ts` and the new `backend/src/db/product-tables.ts` (also home of
  `appPartitionConfigs`, `appFullCrudTables` and `appReadOnlyTables`). Keep the maps separate: one
  map importing both is a load-order cycle under drizzle-kit's per-file loading.
- Pinned `backend/src/schemas/app-schemas.ts` (`setupConfigSchema`, `appChannelCountFields`)
  replaces `modules/organization/setup-config-schema.ts` and `schemas/app-channel-counts.ts`;
  `organization-schema.ts` and `channel-included.ts` import from it.
- `user-profile-content.tsx` (unpinned) hosts a `user.profile` slot (render context: viewed user,
  opening organization id, `isSheet`); cella's organizations grid is the `organizations` tool.
- Template pinned list adds `backend/src/modules.ts` and `product-tables.ts`; drops
  `nav-config.tsx`, `onboarding-config.ts` (pin locally if customized) and
  `user-profile-content.tsx`.

## Blast radius

Sync-breaking: four files are deleted or superseded and the pinned list changes; syncing without
these steps leaves stale fork copies beside the template's. No `clientCacheVersion` bump, no wire
change. DB: sub-root channels get one index-only migration on `memberships`
(`(<channel>_id, user_id, archived)`; an existing index with the derived name, raak's
`memberships_project_user_archived_idx`, is kept); root-only apps: none.

## Run

No script: manual.

## Manual steps

1. `git mv backend/src/modules/organization/setup-config-schema.ts backend/src/schemas/app-schemas.ts`;
   append your `appChannelCountFields` from `backend/src/schemas/app-channel-counts.ts` (or the
   empty template one); delete `app-channel-counts.ts`; take upstream for `organization-schema.ts`
   and `schemas/channel-included.ts`.
2. Delete your `membershipChannelColumns` and per-channel membership indexes; take upstream for
   `memberships-db.ts` and `inactive-memberships-db.ts`; `pnpm generate` should add only indexes.
3. Per app module, add `routes` to `defineBackendModule` with the mounts your `routes.ts` had:
   static paths (`/public/tasks`, `/t`) need no phase; apps mounted at `/` (workspace, project,
   course, course section, item and material links) take `phase: 'absolute'`;
   `/:tenantId/:organizationId/...` mounts take `phase: 'tenant'`. Keep the app modules listed in
   `backend/src/modules.ts`; take upstream for `routes.ts`.
4. Create `backend/src/db/product-tables.ts` from the template with a `productTables` getter per
   app product (`task: () => tasksTable`, ...); move your `appPartitionConfigs`,
   `appFullCrudTables` and `appReadOnlyTables` entries into it; keep `channel-tables.ts`; take
   upstream for `tables.ts`.
5. If you rewrote `frontend/src/modules/user/user-profile-content.tsx`, move that UI into an
   app-owned module as a `user.profile` tool (`render: ({ user, isSheet }) => ...`), hide cella's
   grid with `'user.profile': { organizations: { hidden: true } }` in `placement-config.ts` when
   replacing it, then take upstream. Same for `home-page.tsx`: app home surfaces belong in
   `home.sections` tools.
6. In `cella/cella.config.ts` `pinned`: remove `backend/src/tables.ts`, `backend/src/routes.ts`,
   `backend/src/modules/memberships/memberships-db.ts`,
   `backend/src/modules/organization/setup-config-schema.ts` and
   `frontend/src/modules/user/user-profile-content.tsx`; add `backend/src/db/product-tables.ts`
   and `backend/src/schemas/app-schemas.ts`; drop `frontend/src/nav-config.tsx` and
   `frontend/src/modules/home/onboarding/onboarding-config.ts` unless you customized them.

## Verify

```sh
pnpm generate        # index-only migration on memberships, or nothing for a root-only app
pnpm check
pnpm test
pnpm cella analyze   # no diverged files among the above, no "pinned entry not found" for the removed pins
# route parity: sorted `method path` lists of baseApp.routes before and after must be identical
```
