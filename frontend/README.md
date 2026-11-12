# frontend

React SPA on Vite: TanStack Router for routing, Zustand for state, TanStack Query for data fetching. Runs as part of `pnpm dev`. With `VITE_DEBUG=true` in `frontend/.env`, the Zustand stores show in the browser's Redux devtools.

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

Routes are files in `src/routes/`, and the router's Vite plugin generates `routeTree.gen.ts` from them. A route file declares its path, `staticData` and glue, and imports its page: the plugin splits every `component` into a chunk of its own. The page, its `beforeLoad` and `loader` logic and its search schema live in the module that owns the page (`route-components.tsx`, `route-logic.ts`, `search-params-schemas.ts`). The layouts:

- `_public/`: pages anyone can open, with `_marketing/`, `auth/` and `docs/` below it.
- `_app/`: pages behind sign-in. Its `beforeLoad` is the gate: a signed-out visit goes to sign in and comes back. A page under `_public` that needs an account calls `requireSession` in its own `beforeLoad`.
- `_app/$tenantId.$organizationSlug/`: pages inside one organization.

A layout names itself in `staticData.boundary`. The router's default error and not-found components read from it which layouts still stand around a failed route, and from `staticData.errorHome` where their home button leads. A route whose loader or page throws `notFound()` declares `notFoundComponent` itself. A load that outlasts a second shows the default pending spinner where the page will be.

Route options read in one order: `staticData`, `params`, `validateSearch`, `search`, `beforeLoad`, `loaderDeps`, `loader`, `head`, then the components, `component` last. A trailing underscore (`page_..edit.tsx`) takes a route out of its parent's component nesting. A `-` prefix keeps a helper file out of the route tree; those shared by route files sit in `-route-utils.tsx`.

## Modules and placements

A feature folder in `src/modules/<name>/` registers itself in `<name>-module.ts` with `defineFrontendModule`; `src/modules.ts` imports every module file before the first render. A folder that only holds parts other modules import, such as `page/`, has no module file. The module that owns an entity also declares it as a `channel` or a `product`: its menu section, list query and members-table defaults.

**Tools and slots.** A page that shows content from many modules is a consumer, and each place on it that takes such content is a slot. A module adds a tool to a slot: an id, a label, an order and a `render` that returns the slot's full content, lazy-loading heavy UI. Every channel type has a `<type>.settings` and a `<type>.tabs` slot; `account.settings`, `account.preferences`, `home.sections`, `user.profile` and `system.tabs` exist once. An app types its channels' render context by augmenting `ChannelEntityByType`.

**Who sees a tool.** `requires` names a grant the consumer has to pass, and `visibleTo` lists context-role pairs such as `organization.admin`, matched over the entity and its ancestors. Both only hide UI: the backend decides what data a viewer gets. An archived channel grants no `update`: its settings hide the tools that need it and keep those that need `delete` or `archive`, the grant to update it whatever its archived state.

**Arrangement.** The app's `appConfig.surfaces` comes first: per slot, `order` puts the ids it names first and `hidden` takes tools off, `locked` ones included. The other tools follow in their declared order. An id that names no tool or tab is skipped: a misspelled or renamed one shows on the page as a tab out of place or one left visible.

Then the channel row's `toolsConfig` applies the channel's own order and hidden ids. It is reconciled fail-closed: an unknown id drops, a new tool joins at its default order, and a `locked` tool cannot be hidden by a channel.

**Page tabs.** A layout route names its tabs slot in `staticData.tabsSlot`, and its bar merges child routes that declare `staticData.navTab` with that slot's tools, rendered through a one-line `$tool` route. An entity link targets the layout route without a tab: the layout redirects to the first visible tab, and so does a navigation to a hidden one.

**Adding content.** A settings tool is a card built from the tool bases in `modules/entities/channel-settings-tools.tsx` (the danger zone is `dangerToolBase` with `DeleteToolCard`, and a channel below the organization archives through `archiveToolBase` with `ArchiveToolCard`), on a settings route that renders `<ChannelSettingsPage entity={...} />`. Such a channel's page shows `ArchivedBanner` under its header while it is archived. A tabs tool needs only its channel's `$tool` route. `ToolCard` and `TabsArrangementCard` are the card shells.

## UI styling

UI primitives are [Base UI](https://base-ui.com), not Radix, and `src/modules/ui/` wraps them as shadcn-style components. When porting a component from the shadcn registry, start from the base-vega style, the closest to this app's sizing. Its `data-horizontal:`/`data-vertical:` variants, `no-scrollbar` and `var(--radius-md)` work as they are. Drop the `cn-*` hook classes, whose CSS is not shipped, and `shadow-xs` on fields, controls and buttons: they rest flat, and a shadow marks real elevation. Check every state selector against the attributes Base UI emits.

**Text** takes one of four steps by role: `text-foreground` for content (titles, values, field labels), `text-foreground-soft` for running text, `text-muted-foreground` for support (descriptions, metadata) and `text-faint-foreground` for hints (placeholders, empty states, counts, separators). Opacity never dims text at rest: `pnpm cella style` fails on a text token with an opacity modifier and on a palette gray.

**Labels** are sentence case, except a key name and an HTTP method chip. A label that heads content, such as a column, a list, a menu group or a key, takes `group-label`; a field label stays at the content step.

**Line length**: running text breaks at `max-w-measure`, so descriptions, help text and long values end on one edge. Dialogs, sheets and page containers size layouts and keep their own widths.

**Edges**: `border-input` on what a person acts on (a field, button, link tile or toggle), plain `border` on what frames or divides content (a card, popup, table or divider). Light mode draws both alike; dark mode lifts the controls. A field framed by its bar takes `edgeless`, never `border-transparent`.

A text field, select or field-shaped button keeps its resting edge under the pointer and answers focus with the ring. A checkbox or radio raises its edge under the pointer, or when the pointer is on its label, with `field-hover:border-input-hover`, since its label is part of what a click toggles; a choice card, being the label, takes `hover:`.

**Hover** on a button, toggle, row or link tile is a fill: `bg-hover`, one tint of the foreground that is the same step on every surface and in both modes. An opaque fill takes its own mix of that tint, `bg-background-hover` for an outline button and `bg-muted-hover` for a secondary, accent or muted fill, since a tint would replace the fill. A menu or select option is highlighted with `bg-accent`, and a sidebar item with `bg-sidebar-accent`.

**Code** takes the same colors wherever it shows, as a docs block, an editor block or a JSON viewer, so a schema reads alike in every view. A key, a type, a number and a boolean have a token of their own (`--code-key`, `--code-type`, `--code-number`, `--code-boolean`), which an app can override, and the rest takes the text steps: a string the content step, plain code the support step, comments and punctuation the hint step.

**Segmented control**: one choice among a few short options on one line takes [SegmentedControl](src/modules/ui/segmented-control.tsx), or `SegmentedNav` when the options are routes. A pill marks the selection, which cannot be cleared. Tabs are for content panels, and a radio group with visible dots is for a form choice that needs a description or more room.

**Chevrons** only open or close. In a row whose label is a link, the chevron is a button of its own at the row's end ([row-expand-toggle.tsx](src/modules/common/row-expand-toggle.tsx)): a click on it never navigates, it stays out of the Tab order, and ArrowRight and ArrowLeft on the focused link open and close the row. Pointing at the chevron keeps the row's hover fill and adds the chevron's own, so it reads as a separate action on the same row.

**On a phone** a dialog opens as a drawer from the bottom or fills the screen, never as a card over the page. A list's main action, such as create or invite, floats at the bottom right across from the menu button and shows its word at the top of the page; in a sheet it stays in the bar as an icon. Table header rows scroll away with the list; from `sm` up they pin under the page's bars.

**Icons** come from `lucide-react` and are sized with `size-3` to `size-6` (12 to 24px); an unsized icon is 1rem. A global `svg.lucide` rule overrides the pixel attributes lucide's `size` prop writes, so that prop has no effect. `LucideProvider` in `main.tsx` sets the default stroke width from `appConfig.theme.strokeWidth`, and an icon may override it. Custom SVG icons in `src/modules/common/icons/` carry the `lucide` class to follow the same rules.

**Motion** has one home per kind of change, and timing comes from [motion-presets.ts](src/modules/common/motion-presets.ts), the motion utilities in [tailwind.css](src/styling/tailwind.css) or a named constant at the top of the file, never a number in JSX:

- A state change is a Tailwind transition keyed on the attribute that changes (`data-open`, `aria-expanded`, `hidden`). A Base UI popup enters and exits through `data-starting-style` and `data-ending-style`: a close during the enter reverses from where it is. The popup primitives share the `popup-motion` utility.
- Content that mounts in place of nothing takes `mount-fade`. A reveal of fixed width or height folds `grid-cols-[0fr]` to `1fr`, `inert` while folded. A part that fades out before it goes stays mounted with `hidden` and `transition-discrete`.
- motion/react does what CSS cannot: the exit of an element React unmounts (`AnimatePresence`), `layout` and `layoutId`, height or width `auto`, a scripted sequence. The root `MotionConfig` alone reads the reduced-motion setting.
- The Web Animations API moves what has to be measured first, as the tab indicator does.
- Durations: 150 for a popup or a fade, 200 for a toggle or a collapse, 300 for a sheet or drawer travelling, 500 for a page or section entrance; longer is an attention loop with a stop. Enters take `ease-out`, exits `ease-in` or less time, a travel `ease-drawer`, a landing `ease-overshoot`. A timer that waits for a transition derives from its duration constant.
- Under reduced motion movement and size stop while fades and color stay: `motion-safe:` on a start or end transform, `motion-reduce:transition-none` only on a size transition, and a scroll the app starts reads `scrollBehavior()`.
