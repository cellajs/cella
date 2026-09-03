# Frontend module registry and UI placements

## What & why

Frontend modules register through `defineFrontendModule` (`frontend/src/lib/module.ts`), mirroring
`defineBackendModule`; `frontend/src/modules.ts` (imported by `main.tsx`) glob-imports every
`frontend/src/modules/*/*-module.ts(x)` before first render. UI placements
(`frontend/src/lib/placements.ts`): a tool is a component placed into a slot; the consumer is the
hosting page. Modules declare `tools`; consumers read `getTools(slot)` (typed by `SlotContexts`)
and `resolvePlacementList`. Slots `` `${channelType}.settings` `` and `account.settings`; `render`
returns the full card and lazy-loads heavy UI; render context `ChannelSettingsEntityByType`,
widened via `declare module '~/lib/placements'`. Built-in settings sections (organization
general/details/danger zone; account general/sessions/authentication/danger zone) are tools; the
pages are pure consumers. Gating: `requires` (a grant) and `visibleTo` (context-role pairs such as
`'organization.admin'`, `'course.staff'`, matched over the ancestor chain by `heldContextRoles`,
hierarchy-validated); UI visibility only, never authorization. Arrangement layers: manifest
defaults, pinned `frontend/src/placement-config.ts` overrides, then the row's `toolsConfig` jsonb
(new `organizations` column; per-slot `order`/`hidden`/`settings`; admin "Tools" card; fail-closed
reconciliation; `locked` tools ignore hiding). Tabs: `resolveNavTabs` merges `staticData.navTab`
child routes (typed `PlacementDescriptor`) with the `staticData.tabsSlot` slot's `.tabs` tools via
a `$tool` host route (`SlotTabHost`); `organization.tabs` and `system.tabs` ship one; default tab
is the first visible (`defaultNavTabPath`). `nav-buttons.tsx` special-cases moved to `navItems`
`iconSlot`/`badgeSlot` in the pinned `frontend/src/nav-config.tsx`.

## Blast radius

Sync-breaking for every app, with a database change: `organizations.tools_config` jsonb (not null,
default `{}`); run `pnpm generate` after sync (`backend/drizzle` is app-owned). Organization
response and update body gain optional `toolsConfig` (additive, no `clientCacheVersion` bump). The
pinned `organizationSettingsSections` file and `OrganizationSettingsSection` type are removed.
Territory scanning of `defineFrontendModule`/`defineBackendModule` needs `@cellajs/cli` with the
widened call matcher.

## Run

No script, manual.

## Manual steps

1. Convert every app-owned frontend `*-module.ts` (raak: label, marketing, project, task, workspace;
   projectcampus: its app modules) from `registerModule` (shared/module-registry) to
   `defineFrontendModule` (`~/lib/module`); `*-module.tsx` when it declares JSX tools. Backend
   modules keep `defineBackendModule`.
2. Move settings-section extensions into a module's `tools`; raak example,
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

   Wrap the form in `ToolCard` (`~/modules/common/tool-card`), lazy-loaded via `lazyNamed`;
   `organization` is `EnrichedOrganization` via `ChannelSettingsEntityByType`.
3. Delete `frontend/src/modules/organization/organization-settings-sections.tsx` and its pinned
   entry in `cella.config.ts`; add `frontend/src/placement-config.ts` to `overrides.pinned`; replace
   `OrganizationSettingsSection` imports with the `Tool` types from `~/lib/placements`.
4. Run `pnpm generate` to pick up the `tools_config` column.
5. Deep hierarchies (projectcampus), one settings slot per channel entity:
   - Augment the render-context map once in an app-owned module:
     `declare module '~/lib/placements' { interface ChannelEntityByType { course: EnrichedCourse; courseSection: EnrichedCourseSection; project: EnrichedProject } }`
     (types both the settings and tabs slots).
   - In the channel's module file:
     `tools: channelSettingsTools({ channelType: 'course', resource: 'c:course', toolsCardVisibleTo: ['course.staff', 'organization.admin'], renderGeneral, renderDetails?, renderTools, renderDeleteDialog })`
     (`~/modules/entities/channel-settings-tools`); `renderTools` wires `ToolsArrangementCard` to
     the channel's update mutation (four thin wrappers in
     `frontend/src/modules/organization/settings-tools.tsx`).
   - Settings route: `<ChannelSettingsPage entity={course} />` (`~/modules/entities/channel-settings-page`).
   - Persist per-channel arrangement by threading `toolsConfig` through the channel's update schema
     and query like `setupConfig`. (SUPERSEDED in part by `20260817T1055-tools-config-channel-columns`:
     the jsonb column now comes from `channelColumns()`; do NOT hand-copy it.)
   - `visibleTo` pairs may name any hierarchy role (`'course.staff'`, `'project.owner'`); elevation
     is explicit, so a tool org admins should see must list `'organization.admin'`; repeated
     audiences go in app-owned preset constants.
   - Standalone cards use `ToolCard` (`~/modules/common/tool-card`).
6. In the pinned `frontend/src/nav-config.tsx`, copy the template's `iconSlot`/`badgeSlot` entries
   (account avatar, home loader, menu unseen badge) or they disappear.
7. Account settings page or system panel customizations made in template files move to
   `account.settings` tools, `routes/_app/system/*.tsx` tab routes, or `placementOverrides` entries.

## Verify

```sh
pnpm generate
pnpm sdk
pnpm check
pnpm test
```
