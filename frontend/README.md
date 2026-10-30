# frontend

React SPA on Vite: TanStack Router for routing, Zustand for state, TanStack Query for data fetching. Runs as part of `pnpm dev`. With `VITE_DEBUG_MODE=true` in `frontend/.env`, the Zustand stores show in the browser's Redux devtools.

## Source style

Declare named React components with functions. Wrappers use a named function expression:

```tsx
export function ProjectTile(props: ProjectTileProps) {
  return <article>{props.name}</article>;
}

export const MemoizedProjectTile = memo(function MemoizedProjectTile(props: ProjectTileProps) {
  return <article>{props.name}</article>;
});
```

Never annotate component declarations with `React.FC` or `FC`. Use `ComponentType<Props>` when a component is passed or stored as a value.

## Routes

Routes are files in `src/routes/`, and the router's Vite plugin generates `routeTree.gen.ts` from them. A route file only declares its path, `staticData` and glue; the page itself lives in a module. The layouts:

- `_public/`: pages anyone can open, with `_marketing/` and `_content/` (public content such as the docs) below it.
- `_app/`: pages behind sign-in.
- `_app/$tenantId.$organizationSlug/`: pages inside one organization.

A trailing underscore (`page_.$id.edit.tsx`) takes a route out of its parent's component nesting. Helpers shared by route files sit in `-route-utils.tsx`.

## Modules and placements

A feature folder in `src/modules/<name>/` registers itself in `<name>-module.ts` with `defineFrontendModule`; `src/modules.ts` imports every module file before the first render. A folder that only holds parts other modules import, such as `page/`, has no module file. The module that owns an entity also declares it as a `channel` or a `product`: its menu section, list query and members-table defaults.

**Tools and slots.** A page that shows content from many modules is a consumer, and each place on it that takes such content is a slot. A module adds a tool to a slot: an id, a label, an order and a `render` that returns the slot's full content, lazy-loading heavy UI. Every channel type has a `<type>.settings` and a `<type>.tabs` slot; `account.settings`, `account.preferences`, `home.sections`, `user.profile` and `system.tabs` exist once. An app types its channels' render context by augmenting `ChannelEntityByType`.

**Who sees a tool.** `requires` names a grant the consumer has to pass, and `visibleTo` lists context-role pairs such as `organization.admin`, matched over the entity and its ancestors. Both only hide UI: the backend decides what data a viewer gets.

**Arrangement.** The app's `appConfig.surfaces` comes first, one list of ids per slot: a listed slot shows exactly those tools in that order, an unlisted one every tool in its declared order. Then the channel row's `toolsConfig` applies the channel's own order and hidden ids. It is reconciled fail-closed: an unknown id drops, a new tool joins at its default order, and a `locked` tool cannot be hidden by a channel. The app refuses to start when `surfaces` lists an id no tool or tab has.

**Page tabs.** A layout route names its tabs slot in `staticData.tabsSlot`, and its bar merges child routes that declare `staticData.navTab` with that slot's tools, rendered through a one-line `$tool` route. An entity link targets the layout route without a tab: the layout redirects to the first visible tab, and so does a navigation to a hidden one.

**Adding content.** A settings tool is a card built from the tool bases in `modules/entities/channel-settings-tools.tsx` (the danger zone is `dangerToolBase` with `DeleteToolCard`), on a settings route that renders `<ChannelSettingsPage entity={...} />`. A tabs tool needs only its channel's `$tool` route. `ToolCard` and `TabsArrangementCard` are the card shells.

## UI styling

UI primitives are [Base UI](https://base-ui.com), not Radix, and `src/modules/ui/` wraps them as shadcn-style components. When porting a component from the shadcn registry, start from the base-vega style, the closest to this app's sizing. Its `data-horizontal:`/`data-vertical:` variants, `no-scrollbar` and `var(--radius-md)` work as they are. Drop the `cn-*` hook classes, whose CSS is not shipped, and `shadow-xs` on fields, controls and buttons: they rest flat, and a shadow marks real elevation. Check every state selector against the attributes Base UI emits.

**Text** takes one of four steps by role: `text-foreground` for content (titles, values, field labels), `text-foreground-soft` for running text, `text-muted-foreground` for support (descriptions, metadata) and `text-faint-foreground` for hints (placeholders, empty states, counts, separators). A label that heads content, such as a column, a list, a menu group or a key, takes `group-label`; a field label stays at the content step. Labels are sentence case, except a key name and an HTTP method chip. Opacity never dims text at rest: `pnpm style` fails on a text token with an opacity modifier and on a palette gray.

**Line length**: running text breaks at `max-w-measure`, so descriptions, help text and long values end on one edge. Dialogs, sheets and page containers size layouts and keep their own widths.

**Edges**: `border-input` on what a person acts on (a field, button, link tile or toggle), plain `border` on what frames or divides content (a card, popup, table or divider). Light mode draws both alike; dark mode lifts the controls. A checkbox or radio raises its edge under the pointer, or when the pointer is on its label, with `field-hover:border-input-hover`, since its label is part of what a click toggles; a choice card, being the label, takes `hover:`. A text field, select or field-shaped button keeps its resting edge under the pointer and answers focus with the ring. A field framed by its bar takes `edgeless`, never `border-transparent`. A button, toggle or link tile answers hover with a fill.

**Segmented control**: one choice among a few short options on one line takes [SegmentedControl](src/modules/ui/segmented-control.tsx), or `SegmentedNav` when the options are routes. A pill marks the selection, which cannot be cleared. Tabs are for content panels, and a radio group with visible dots is for a form choice that needs a description or more room.

**Chevrons** only open or close. In a row whose label is a link, the chevron is a button of its own at the row's end ([row-expand-toggle.tsx](src/modules/common/row-expand-toggle.tsx)): a click on it never navigates, it stays out of the Tab order, and ArrowRight and ArrowLeft on the focused link open and close the row. Pointing at the chevron keeps the row's hover fill and adds the chevron's own, so it reads as a separate action on the same row.

**Icons** come from `lucide-react` and are sized with `size-3` to `size-6` (12 to 24px); an unsized icon is 1rem. A global `svg.lucide` rule overrides the pixel attributes lucide's `size` prop writes, so that prop has no effect. `LucideProvider` in `main.tsx` sets the default stroke width from `appConfig.theme.strokeWidth`, and an icon may override it. Custom SVG icons in `src/modules/common/icons/` carry the `lucide` class to follow the same rules.
