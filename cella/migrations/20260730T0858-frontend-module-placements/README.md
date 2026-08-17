# Frontend module registry and UI placements

## What & why

Frontend modules now register through `defineFrontendModule` (`frontend/src/lib/module.ts`),
mirroring the backend's `defineBackendModule`. A composition root `frontend/src/modules.ts`
(imported by `main.tsx`) glob-imports every `frontend/src/modules/*/*-module.ts(x)`, so module
registration runs before first render with no import list to maintain.

The first capability is UI placements (`frontend/src/lib/placements.ts`), with settled
vocabulary: a **tool** is a component placed into a **slot**; the **consumer** is the page
hosting the slot. Modules declare tools under `tools`; consumers read them with `getTools(slot)`, typed by the `SlotContexts` slot map,
and resolve the final list with `resolvePlacementList`. The contracts:

- Slot families: `` `${channelType}.settings` `` and `account.settings`. A tool's
  `render` returns the full card and must lazy-load heavy UI (module files load eagerly). The
  per-channel-type render context comes from the `ChannelSettingsEntityByType` interface, widened
  by apps via `declare module '~/lib/placements'`.
- The template's built-in settings sections (organization general/details/danger zone, account
  general/sessions/authentication/danger zone) are themselves registered tools now; the
  organization and account settings pages are pure slot consumers.
- Gating: `requires` names a grant (capability condition); `visibleTo` lists context-role pairs
  (`'organization.admin'`, `'course.staff'`), matched against the actor's memberships over the
  hosting entity's ancestor chain (`heldContextRoles`). Pairs are validated against the
  hierarchy at registration. Both are UI visibility conditions only, never data authorization.
- Arrangement layers, applied in order: manifest defaults, app overrides in the pinned
  `frontend/src/placement-config.ts`, then the channel row's `toolsConfig` jsonb (new column on
  `organizations`): per-slot `order`/`hidden`/`settings`, edited by the new admin "Tools" card
  on the organization settings page, reconciled fail-closed (unknown tool ids drop, newly
  deployed tools append at their default order). `locked` tools ignore channel-stored hiding.
- Page tabs merge two sources in `resolveNavTabs`: child routes declaring `staticData.navTab`
  (typed `PlacementDescriptor`) and, when the layout route declares `staticData.tabsSlot`, that
  slot's registry `.tabs` tools rendered by one `$tool` host child route via `SlotTabHost`. So a
  module (or a future installed tool) contributes a tab with no new route file. Overrides and
  channel arrangement key by the slot id (unified with sections). The organization
  (`organization.tabs`) and the non-entity system panel (`system.tabs`) both ship a `$tool` host
  route; the default tab derives from the first visible tab (`defaultNavTabPath`).
- `nav-buttons.tsx` id special-cases moved into `navItems` (`iconSlot`/`badgeSlot` fields in the
  pinned `frontend/src/nav-config.tsx`).

## Blast radius

Sync-breaking for every app, with a database change: `organizations` gains a `tools_config`
jsonb column (not null, default `{}`), so apps run `pnpm generate` after sync (`backend/drizzle`
is app-owned). The organization response and update body gain an optional `toolsConfig` field:
additive, so no `clientCacheVersion` bump; cached rows without it render manifest defaults.
The former `organizationSettingsSections` pinned file and `OrganizationSettingsSection` type are
removed. Territory scanning of `defineFrontendModule`/`defineBackendModule` app modules needs
`@cellajs/cli` with the widened call matcher.

## Run

No script - manual.

## Manual steps

1. Convert every app-owned frontend `*-module.ts` (raak: label, marketing, project, task,
   workspace; projectcampus: its app modules) from `registerModule` (shared/module-registry) to
   `defineFrontendModule` from `~/lib/module`. Metadata shape is unchanged; rename the file to
   `*-module.tsx` when it declares tools with JSX. Backend module files keep
   `defineBackendModule`.
2. Move settings-section extensions into a module's `tools`. raak example, in
   `frontend/src/modules/label/label-module.tsx`:

   ```tsx
   defineFrontendModule({
     name: 'labels',
     // ...existing metadata...
     tools: [
       {
         slot: 'organization.settings',
         id: 'update-primary-labels',
         label: 'c:primary_labels',
         visibleTo: ['organization.admin'],
         render: (organization) => <PrimaryLabelsCard organization={organization} />,
       },
     ],
   });
   ```

   `render` returns the full card: wrap the existing form in the `ToolCard` shell
   (`~/modules/common/tool-card`) and lazy-load it with `lazyNamed`. The `organization`
   parameter is typed `EnrichedOrganization` via `ChannelSettingsEntityByType`.
3. Delete `frontend/src/modules/organization/organization-settings-sections.tsx` and its pinned
   entry in `cella.config.ts`; add `frontend/src/placement-config.ts` to `overrides.pinned`.
   Replace `OrganizationSettingsSection` imports with the `Tool` types from `~/lib/placements`.
4. Run `pnpm generate` so the app's drizzle folder picks up the `tools_config` column.
5. Deep hierarchies (projectcampus): each channel entity can host its own settings slot, and the
   generic pieces make one channel's slot cost its forms plus one call:
   - Augment the render-context map once, e.g. in an app-owned module:
     `declare module '~/lib/placements' { interface ChannelEntityByType { course: EnrichedCourse; courseSection: EnrichedCourseSection; project: EnrichedProject } }`
     (this one interface types both the channel's settings and tabs slots).
   - In the channel's module file, declare
     `tools: channelSettingsTools({ channelType: 'course', resource: 'c:course', toolsCardVisibleTo: ['course.staff', 'organization.admin'], renderGeneral, renderDetails?, renderTools, renderDeleteDialog })`
     (`~/modules/entities/channel-settings-tools`); wire `renderTools` to
     `ToolsArrangementCard` with the channel's update mutation (see
     `frontend/src/modules/organization/settings-tools.tsx` for the four thin wrappers).
   - The settings route component is one line: `<ChannelSettingsPage entity={course} />`
     (`~/modules/entities/channel-settings-page`).
   - To persist per-channel arrangement, thread `toolsConfig` through the channel's update
     schema and query like `setupConfig`. (SUPERSEDED in part by
     `20260817T1055-tools-config-channel-columns`: the jsonb column itself now comes from
     `channelColumns()` — do NOT hand-copy the column declaration anymore.)
   - `visibleTo` pairs may name any hierarchy role (`'course.staff'`, `'project.owner'`);
     elevation is explicit, so a tool org admins should see must list `'organization.admin'`.
     Repeated audiences belong in app-owned preset constants that manifests spread.
   - Standalone cards use the `ToolCard` shell (`~/modules/common/tool-card`) for the standard look.
6. In the pinned `frontend/src/nav-config.tsx`, copy the template's `iconSlot`/`badgeSlot`
   entries (account avatar, home loader, menu unseen badge) or those affordances disappear.
7. Apps that edited template files to customize the account settings page or system panel can
   move those edits to `account.settings` tools, new `routes/_app/system/*.tsx` tab
   routes, or `placementOverrides` entries, and drop the divergence.

## Verify

```sh
pnpm generate
pnpm sdk
pnpm check
pnpm test
```
