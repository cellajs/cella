# Frontend module registry and UI placements

## What & why

Frontend modules now register through `defineFrontendModule` (`frontend/src/lib/module.ts`),
mirroring the backend's `defineBackendModule`: shared metadata flows to `shared/module-registry`,
and frontend capabilities flow to subsystem projections. The first capability is `placements`
(`frontend/src/lib/placements.ts`): named UI slots that hosting pages read with
`getPlacements(slot)`. A composition root `frontend/src/modules.ts` (imported by `main.tsx`)
glob-imports every `frontend/src/modules/*/*-module.ts`, so module registration runs before first
render with no import list to maintain.

Five contracts changed with it:

- `frontend/src/modules/organization/organization-settings-sections.tsx` (pinned extension file)
  is removed, along with the `OrganizationSettingsSection` type. Settings cards are now
  `placements` entries with `slot: 'organization.settings.aside'` (type `SettingsAsidePlacement`),
  sorted with the built-ins on `order` (built-ins 10/20, danger zone 90, contribution default 50)
  and gated per entry with `requires` ('update' or 'delete' grant names).
- The user account settings page (`account-page.tsx`) is the second aside host: contributions use
  `slot: 'account.settings.aside'` (type `AccountSettingsAsidePlacement`, `render` receives
  `MeUser`; built-ins 10/20/30, danger zone 90). The page passes no grants, so entries declaring
  `requires` stay hidden there.
- App overrides live in the new pinned file `frontend/src/placement-config.ts`
  (`placementOverrides`): keyed by host (slot id, or parent route id for nav tabs), then placement
  id, with `{ hidden, order, requires }`. Hosts resolve their merged built-in + contribution lists
  through `resolvePlacementList`, so template defaults (org/account sections, system tabs) can be
  hidden, reordered, or re-gated without editing template files.
- `staticData.navTab` is now typed `PlacementTab` (`~/lib/placements`); `requires` widened from
  the literal `'update'` to any grant name, and `resource` is supported. The system panel's
  default tab derives from the first visible tab (`defaultNavTabPath('/_app/system')`) instead of
  a hardcoded `/system/users` redirect; channel entities keep `channelRouteConfig` as their
  canonical landing surface.
- `nav-buttons.tsx` no longer special-cases nav item ids ('account' avatar, 'home' loader, 'menu'
  unseen badge). That behavior moved into `navItems` (`frontend/src/nav-config.tsx`, pinned) via
  two new optional `NavItem` fields: `iconSlot` and `badgeSlot`.

## Blast radius

Sync-breaking for every app: all 17 template `*-module.ts` files changed their registration call,
and app-owned module files must follow (the shared `registerModule` still exists, so old files
compile, but they never reach the frontend registry and their placements cannot register). Apps
that filled `organizationSettingsSections` (raak: primary-labels card) must move those entries to
a module's `placements`. Apps with a pinned `nav-config.tsx` keep compiling but lose the account
avatar, home loader, and unseen badge until they adopt `iconSlot`/`badgeSlot`. No wire-shape,
client-cache, or database change. Territory scanning of `defineFrontendModule` /
`defineBackendModule` app modules needs `@cellajs/cli` with the widened call matcher; sync the
CLI before relying on `owner: 'app'` auto-territory.

## Run

No script - manual.

## Manual steps

1. In every app-owned frontend `*-module.ts` (raak: label, marketing, project, task, workspace),
   replace `import { registerModule } from 'shared/module-registry'` with
   `import { defineFrontendModule } from '~/lib/module'` and rename the call. The object shape is
   unchanged. Backend `*-module.ts` files keep `defineBackendModule`.
2. Move each `organizationSettingsSections` entry into an app-owned module's `placements`. raak
   example, in `frontend/src/modules/label/label-module.ts`:

   ```tsx
   defineFrontendModule({
     name: 'labels',
     // ...existing metadata...
     placements: [
       {
         slot: 'organization.settings.aside',
         id: 'update-primary-labels',
         label: 'c:primary_labels',
         render: (entity) => <UpdatePrimaryLabelsForm organization={entity} />,
       },
     ],
   });
   ```

   `render` receives `EnrichedChannel`; a form typed to `EnrichedOrganization` should widen its
   prop or narrow the entity. Module files load before first render, so lazy-load heavy form UI
   (see `lazyNamed`) instead of importing it eagerly. When `placements` contain JSX, rename the
   file to `*-module.tsx`; the composition root glob matches both extensions.
3. Delete `frontend/src/modules/organization/organization-settings-sections.tsx` and drop its
   entry from `overrides.pinned` in `cella.config.ts`; add `frontend/src/placement-config.ts` to
   `overrides.pinned` instead. Replace any `OrganizationSettingsSection` type imports with
   `SettingsAsidePlacement` from `~/lib/placements`. Apps that customized the account settings
   page or the system panel by editing template files can move those edits to
   `'account.settings.aside'` placements, new `routes/_app/system/*.tsx` tab routes, or
   `placementOverrides` entries, and drop the divergence.
4. In the pinned `frontend/src/nav-config.tsx`, copy the template's new entries: `badgeSlot:
   UnseenNavBadge` on 'menu', `iconSlot: AppNavLoader` on 'home', `iconSlot: AccountNavIcon` on
   'account' (components from `~/modules/seen/unseen-nav-badge` and
   `~/modules/navigation/account-nav-icon`).
5. Custom `staticData.navTab` declarations keep working; `requires` may now name any grant the
   hosting page passes.

## Verify

```sh
pnpm check
pnpm test
```
