# Headless settings placements: sections hook, descriptor bases, consumers as presentation

## What & why

Settings-slot resolution moved out of the consumers into one headless hook, and the render-wrapping
`channelSettingsTools` factory became plain descriptor data. The first app port of channel
settings (raak#99, project/workspace) showed both seams: a sheet-hosted app had to copy
`ChannelSettingsPage`'s gating internals to build its own consumer, and had to post-process the
factory's output (`.map`/`.flatMap` on tool ids) to re-gate the general form and swap the danger
tool. Concretely:

- `useChannelSettingsSections(entity)` (`frontend/src/modules/entities/use-channel-settings-sections.ts`)
  now owns all resolution: grants from the entity's `can`, held context-role pairs, app overrides,
  and stored `toolsConfig` arrangement. It returns a render-ready section list; every consumer —
  page, sheet, dialog, tab bar — is a presentation-only map over it. `ChannelSettingsPage` is
  rewritten on the hook and a `ChannelSettingsSheet` reference consumer ships alongside it
  (`frontend/src/modules/entities/channel-settings-sheet.tsx`).
- `channelSettingsTools(...)` is removed. `frontend/src/modules/entities/channel-settings-tools.tsx`
  instead exports spreadable descriptor bases — `generalToolBase`, `detailsToolBase`,
  `arrangementToolBase`, `dangerToolBase(channelType, resource)` — plus the now-exported
  `DeleteToolCard`. A module spreads a base, adds `slot`, app conditions, and a `render` returning
  the full card; deviating from the standard set means declaring a different tool, never patching
  factory output. `generalToolBase` carries `requires: 'update'` by default.
- `getTools` applies the section default order (50) itself; consumers drop their
  `order: tool.order ?? 50` maps. `getSlotDescriptors` stays raw, so tab consumers keep their own
  default (0). The `getChannelSettingsTools` getter and `ChannelSettingsToolFor` type are removed:
  the sections hook is the blessed settings reader, and descriptor-only consumers (the arrangement
  card) use `getSlotDescriptors`.
- Backend: `mergeJsonbShallow(column, value)` (`backend/src/db/utils/jsonb-merge.ts`) replaces the
  inlined `column || value::jsonb` fragments; adding `toolsConfig` (or any sparse jsonb config) to
  a channel's update query is one line.
- Surface trims: `SlotToolsConfig.settings` (per-tool payloads) is removed — it had no reader;
  stored config is exactly what the arrangement card writes (`order` + `hidden`).
  `PlacementOverride` narrows to `hidden`/`order` — overrides hide and reorder; changing who sees
  a tool means declaring the tool differently in its module. `heldContextRoles` loses its unused
  entity-less overload (note: a `visibleTo` on a `system.tabs` tool hides it for everyone, since
  that consumer passes no pairs). Prefer `requires` over `visibleTo`: capability grants inherit
  down the ancestor chain, so declare `visibleTo` only for role audiences.

This supersedes step 5 of `20260730T0858-frontend-module-placements` where it recommends
`channelSettingsTools(...)` for deep hierarchies: declare spread bases instead.

## Blast radius

Sync-breaking for apps that call `channelSettingsTools` or `getChannelSettingsTools` (both
removed), import the organization `settings-tools` form components by their old names
(`Organization*Form` → `Organization*Card`, now returning full cards), or set
`requires`/`visibleTo` keys in `placement-config.ts` overrides (cella and raak both ship empty
maps). Wire change: the unused optional `settings` key leaves the `toolsConfig` slot schema —
additive-compatible in both directions since nothing ever wrote it; no database change, no
`clientCacheVersion` bump. Apps that never registered settings tools are unaffected. The general
form gains a `requires: 'update'` gate upstream — actors without the update grant no longer see a
form they could not submit.

For raak specifically, this aligns raak#99 (settings port to placements):

- `frontend/src/modules/entities/channel-settings-sheet.tsx` — drop the app-side copy; the
  upstream file is the same consumer, rebuilt on the hook.
- `project-module.tsx` / `workspace-module.tsx` — replace the `channelSettingsTools({...})` calls
  and their `.map`/`.flatMap` patches with spread bases: the project general `requires: 'update'`
  patch is now the base default, and the workspace danger swap becomes one plain tool declaration
  (`{ ...dangerToolBase('workspace', 'c:workspace'), slot: 'workspace.settings', render: ... }`
  with its custom card, no filtered placeholder).
- Project/workspace `settings-tools.tsx` — wrap the general forms in their `ToolCard` shells
  (the factory no longer does it); custom cards are unchanged.
- The URL-driven sheet handlers stay app-owned; only their `ChannelSettingsSheet` import now
  resolves upstream.
- `updateProject`/`updateWorkspace` queries — replace the inlined `|| ... ::jsonb` merge with
  `mergeJsonbShallow`.

## Run

No script — manual.

## Manual steps

1. Rewrite any settings consumer that copied grants/pairs/`resolvePlacementList` logic as a map
   over `useChannelSettingsSections(entity)`; delete app-side copies of the sheet consumer in
   favor of `~/modules/entities/channel-settings-sheet`.
2. In each channel module, replace `tools: channelSettingsTools({...})` with explicit tool
   declarations spreading `generalToolBase` / `detailsToolBase` / `arrangementToolBase` /
   `dangerToolBase(channelType, resource)`; keep listing the arrangement card's `visibleTo`
   audiences on the spread. Move the `ToolCard` shells the factory added (general: `unsaved`,
   id `update-<channelType>`; details: id `update-<channelType>-details`; danger:
   `DeleteToolCard`) into the module's lazy-loaded settings-tools components.
3. Remove `.map((tool) => ({ ...tool, order: tool.order ?? 50 }))` around `getTools` results (the
   getter applies the default now), and replace `getChannelSettingsTools(channelType)` calls with
   `useChannelSettingsSections(entity)` for rendering or `getSlotDescriptors(slot)` for
   descriptor-only reads.
4. Replace inlined jsonb merge fragments in channel update queries with
   `mergeJsonbShallow` from `#/db/utils/jsonb-merge`. Drop any writes to the removed
   `SlotToolsConfig.settings` key (upstream never wrote it) and any `requires`/`visibleTo` keys in
   `placement-config.ts` overrides.
5. If an app relied on ungated general forms (members without the update grant seeing them),
   override per slot in `placement-config.ts` (`general: { requires: undefined }` is not
   supported — set `requires` to a grant every intended viewer holds, or declare a custom general
   tool without spreading the base).

## Verify

```sh
pnpm check
pnpm test
```
