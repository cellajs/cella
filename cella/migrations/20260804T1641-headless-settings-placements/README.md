# Headless settings placements: sections hook, descriptor bases, consumers as presentation

## What & why

Settings-slot resolution moves into `useChannelSettingsSections(entity)`
(`frontend/src/modules/entities/use-channel-settings-sections.ts`: grants from `can`, held
context-role pairs, app overrides, stored `toolsConfig`), ending raak#99-style copies of page
gating; `ChannelSettingsPage` and the new
`ChannelSettingsSheet` (`frontend/src/modules/entities/channel-settings-sheet.tsx`) are
presentation-only maps over it. `channelSettingsTools(...)` is removed;
`frontend/src/modules/entities/channel-settings-tools.tsx` exports spreadable `generalToolBase`
(`requires: 'update'`), `detailsToolBase`, `tabsToolBase`, `dangerToolBase(channelType, resource)`,
and `DeleteToolCard`; a module spreads a base plus `slot`, conditions, and a full-card `render`.
`ToolsArrangementCard` is deleted; `TabsArrangementCard`
(`frontend/src/modules/entities/tabs-arrangement-card.tsx`) writes `toolsConfig['<channelType>.tabs']`
via the channel update mutation, listing `getNavTabCandidates` (`~/modules/common/page/tab-nav`);
stored settings-section arrangement stays honored by `resolvePlacementList` but no UI writes it;
organization settings demos it (`tabsToolBase` + `OrganizationTabsCard`, `settings` navTab
`locked: true`). Tab visibility is presentation only, never authorization (enforce via permissions
or quota restrictions). `getTools` applies default order 50 (`getSlotDescriptors` stays raw, tab
default 0); `getChannelSettingsTools` and `ChannelSettingsToolFor` are removed. Backend
`mergeJsonbShallow(column, value)` (`backend/src/db/utils/jsonb-merge.ts`) replaces inlined
`column || value::jsonb`. Trims: `SlotToolsConfig.settings` removed (stored config is `order` +
`hidden`); `PlacementOverride` narrows to `hidden`/`order`; `heldContextRoles` loses its
entity-less overload (a `visibleTo` on a `system.tabs` tool hides it for everyone). Prefer
`requires` over `visibleTo` (grants inherit down the ancestor chain). Supersedes step 5 of
`20260730T0858-frontend-module-placements`: spread bases, not `channelSettingsTools(...)`.

## Blast radius

Sync-breaking for apps calling `channelSettingsTools` or `getChannelSettingsTools`, importing the
organization `settings-tools` forms by old names (`Organization*Form` -> `Organization*Card`), or
setting `requires`/`visibleTo` in `placement-config.ts` overrides (cella and raak ship empty maps).
Wire: the unused `settings` key leaves the `toolsConfig` slot schema (additive). No database
change, no `clientCacheVersion` bump. Apps that never registered settings tools are unaffected.

raak (raak#99): drop the app copy of `frontend/src/modules/entities/channel-settings-sheet.tsx`;
`project-module.tsx` / `workspace-module.tsx` spread bases instead of `channelSettingsTools({...})`
plus `.map`/`.flatMap` patches (workspace danger:
`{ ...dangerToolBase('workspace', 'c:workspace'), slot: 'workspace.settings', render: ... }`); drop
the `*ToolsCard` wrappers around `ToolsArrangementCard` (optionally `tabsToolBase` +
`TabsArrangementCard` with the channel page's `parentRouteId`, after marking settings tabs
`locked: true`); wrap `settings-tools.tsx` general forms in `ToolCard`;
`updateProject`/`updateWorkspace` use `mergeJsonbShallow`; URL-driven sheet handlers stay app-owned.

projectcampus (synced at 0.6.1): tab visibility moves to `toolsConfig['course.tabs']` (and
courseSection/project/organization) via `TabsArrangementCard`, replacing the course boolean columns
(`streamEnabled`, `projectsEnabled`, `sectionsEnabled`, `materialsEnabled`) and the hardcoded
`tabIds` filter in `course-page.tsx`; real restrictions go through permissions or quota
restrictions (a fully disabled feature is expressed twice); mark every settings navTab
`locked: true` before shipping the card.

## Run

No script, manual.

## Manual steps

1. Rewrite settings consumers that copied grants/pairs/`resolvePlacementList` logic as a map over
   `useChannelSettingsSections(entity)`; delete app-side sheet copies in favor of
   `~/modules/entities/channel-settings-sheet`.
2. In each channel module, replace `tools: channelSettingsTools({...})` with declarations spreading
   `generalToolBase` / `detailsToolBase` / `tabsToolBase` / `dangerToolBase(channelType, resource)`;
   move the `ToolCard` shells the factory added (general: `unsaved`, id `update-<channelType>`;
   details: id `update-<channelType>-details`; danger: `DeleteToolCard`) into the module's
   lazy-loaded settings-tools components.
3. Remove `.map((tool) => ({ ...tool, order: tool.order ?? 50 }))` around `getTools` results;
   replace `getChannelSettingsTools(channelType)` with `useChannelSettingsSections(entity)` (render)
   or `getSlotDescriptors(slot)` (descriptor-only).
4. Replace inlined jsonb merge fragments in channel update queries with `mergeJsonbShallow` from
   `#/db/utils/jsonb-merge`; drop writes to `SlotToolsConfig.settings` and any `requires`/`visibleTo`
   keys in `placement-config.ts` overrides.
5. Apps that relied on ungated general forms: `general: { requires: undefined }` is not supported;
   set `requires` to a grant every intended viewer holds, or declare a custom general tool without
   spreading the base.

## Verify

```sh
pnpm check
pnpm test
```
