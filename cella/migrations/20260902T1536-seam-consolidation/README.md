# Seam consolidation: derived memberships, module routes, product tables, app schemas

## What & why

Five pinned template files carried app fills that the template can now derive or host elsewhere,
so their pins came off. Every change keeps runtime behavior and the wire contract identical for a
root-only hierarchy; apps with sub-root channels get one index-only migration.

- **`memberships-db.ts` and `inactive-memberships-db.ts` are template-owned.**
  `membershipChannelColumns()` and `membershipChannelIndexes()` live next to
  `channelRelationColumns` in `backend/src/db/utils/channel-relation-columns.ts` and derive from the
  hierarchy: one nullable, cascade-deleting `<channel>Id` per non-root channel, and one
  `<table>_<channel>_user_archived_idx` index each, the same rule every fork wrote by hand.
- **Route mounts are module declarations.** `defineBackendModule` takes
  `routes: [{ path, app, phase? }]` (`phase` is `static` by default, else `absolute` for apps
  mounted at `/` with `/:tenantId/...` routes, or `tenant` for `/:tenantId/:organizationId/...`).
  `backend/src/routes.ts` mounts every module's routes per phase and is template-owned; the pinned
  `backend/src/modules.ts` import list is the one place an app registers its modules.
- **`tables.ts` is template-owned.** `entityTables` derives from the pinned lazy-getter maps:
  `channel-tables.ts` (unchanged) and the new `backend/src/db/product-tables.ts`, which also holds
  `appPartitionConfigs`, `appFullCrudTables` and `appReadOnlyTables`. The two maps stay separate on
  purpose: product tables read `channel-tables.ts` while loading, so a single map importing both is
  a load-order cycle under drizzle-kit's per-file loading (verified, it fails).
- **`backend/src/schemas/app-schemas.ts`** replaces `modules/organization/setup-config-schema.ts`
  and `schemas/app-channel-counts.ts`: `setupConfigSchema` and `appChannelCountFields` in one pinned
  file. `organization-schema.ts` and `channel-included.ts` import from it.
- **`user-profile-content.tsx` hosts a `user.profile` slot** (render context: the viewed user, the
  organization id it opened from, `isSheet`), like `home-page.tsx` hosts `home.sections`. Cella's
  organization module contributes the organizations grid as the `organizations` tool; apps add their
  own profile surfaces as tools and hide cella's via `placement-config.ts`. The file is no longer pinned.
- **Template pinned list** adds `backend/src/modules.ts` and `product-tables.ts`, and drops
  `nav-config.tsx`, `onboarding-config.ts` (never customized by a fork; pin locally if you do) and
  `user-profile-content.tsx`.

## Blast radius

Sync-breaking: four files are deleted or superseded and the pinned list changes, so a sync without
these steps leaves stale fork copies next to the template's. No `clientCacheVersion` bump, no wire
change. Database: apps with sub-root channels get a migration that adds the derived
`(<channel>_id, user_id, archived)` indexes on `memberships`; column names, foreign keys and cascade
rules are unchanged, and an index that already used the derived name (raak's
`memberships_project_user_archived_idx`) is kept as is. A root-only app sees no schema change.

## Run

No script — manual.

## Manual steps

1. **App schemas.** `git mv backend/src/modules/organization/setup-config-schema.ts backend/src/schemas/app-schemas.ts`,
   append your `appChannelCountFields` from `backend/src/schemas/app-channel-counts.ts` (or the
   empty template one), delete `app-channel-counts.ts`, then take upstream for
   `organization-schema.ts` and `schemas/channel-included.ts`.
2. **Memberships.** Delete your `membershipChannelColumns` and any per-channel membership index,
   then take upstream for `memberships-db.ts` and `inactive-memberships-db.ts`. Run `pnpm generate`
   and expect only index additions.
3. **Routes.** For each app module, add `routes` to its `defineBackendModule` call with the mounts
   your `routes.ts` had: static paths (e.g. `/public/tasks`, `/t`) need no phase, apps mounted at
   `/` (workspace, project, course, course section, item and material links) take
   `phase: 'absolute'`, and `/:tenantId/:organizationId/...` mounts take `phase: 'tenant'`. Keep
   the app modules listed in `backend/src/modules.ts`, then take upstream for `routes.ts`.
4. **Tables.** Create `backend/src/db/product-tables.ts` from the template with a `productTables`
   getter per app product (`task: () => tasksTable`, ...) and move your `appPartitionConfigs`,
   `appFullCrudTables` and `appReadOnlyTables` entries into it. Keep `channel-tables.ts`, then take
   upstream for `tables.ts`.
5. **Profile page.** If you rewrote `frontend/src/modules/user/user-profile-content.tsx`, move that
   UI into an app-owned module as a `user.profile` tool (`render: ({ user, isSheet }) => ...`), hide
   cella's grid with `'user.profile': { organizations: { hidden: true } }` in `placement-config.ts`
   when you replace it, then take upstream for the file. The same applies to `home-page.tsx`: app
   home surfaces belong in `home.sections` tools, not in a pinned copy of the page.
6. **Pinned list** in `cella/cella.config.ts`: remove `backend/src/tables.ts`, `backend/src/routes.ts`,
   `backend/src/modules/memberships/memberships-db.ts`,
   `backend/src/modules/organization/setup-config-schema.ts` and
   `frontend/src/modules/user/user-profile-content.tsx`; add `backend/src/db/product-tables.ts`
   and `backend/src/schemas/app-schemas.ts`; drop `frontend/src/nav-config.tsx` and
   `frontend/src/modules/home/onboarding/onboarding-config.ts` unless you customized them.

## Verify

```sh
pnpm generate     # index-only migration on memberships, or nothing for a root-only app
pnpm check
pnpm test
pnpm cella analyze
```

`cella analyze` should list no diverged files among the ones above and no "pinned entry not found"
warnings for the removed pins. A quick route parity check: dump `baseApp.routes` before and after
and compare the sorted `method path` lists; they must be identical.
