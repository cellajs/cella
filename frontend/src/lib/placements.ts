import type { ReactNode } from 'react';
import type { ChannelEntityType } from 'shared';
import { hierarchy } from 'shared';
import type { ContextRole, SlotToolsConfig } from 'shared/tools-config';
import type { TKey } from '~/lib/i18n-locales';
import { onFrontendModuleRegister } from '~/lib/module';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { MeUser } from '~/modules/me/types';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { placementOverrides } from '~/placement-config';

/**
 * Shared descriptor for placement-driven tabs and tools. Route tabs reuse it via
 * `staticData.navTab`; tools extend it with a `slot` and a renderer.
 */
export interface PlacementDescriptor {
  /** Stable id: anchors, tab ids, stored config references, and React keys derive from it. */
  id: string;
  /** i18n key for the tab or card label. */
  label: TKey;
  /** Optional resource i18n key interpolated into the label. */
  resource?: TKey;
  /** Sort position within the slot (lower first; each slot documents its default). */
  order?: number;
  /** Grant name this placement needs to be shown; hidden unless the hosting consumer passes it. */
  requires?: string;
  /**
   * Context-role pairs (e.g. 'organization.admin', 'course.staff') that may see this placement;
   * hidden unless the consumer passes a matching held pair. A UI visibility condition only,
   * never data authorization. Prefer `requires`: capability grants already inherit down the
   * ancestor chain, so declare `visibleTo` only when the audience is a role, not a capability.
   */
  visibleTo?: ContextRole[];
  /**
   * Locked placements cannot be hidden by channel-stored config (reorder still works); app
   * overrides in code may still hide them, since code layers are reviewed decisions.
   */
  locked?: boolean;
}

/**
 * Render context per channel type, shared by that channel's `settings` and `tabs` slots. Apps
 * augment this interface (via `declare module '~/lib/placements'`) to type their channels' slots
 * precisely; unlisted channel types fall back to {@link EnrichedChannel}.
 */
export interface ChannelEntityByType {
  organization: EnrichedOrganization;
}

/**
 * Render context for a channel type's slots: always at least the enriched channel base,
 * intersected with the app-declared type from {@link ChannelEntityByType} so generic channel
 * components can read base fields while concrete slots stay precisely typed.
 */
export type ChannelEntityContext<C extends ChannelEntityType> = EnrichedChannel &
  (C extends keyof ChannelEntityByType ? ChannelEntityByType[C] : unknown);

/** The channel settings slot family: one entry per channel type, context is its enriched entity. */
type ChannelSettingsSlotContexts = {
  [C in ChannelEntityType as `${C}.settings`]: ChannelEntityContext<C>;
};

/** The channel tabs slot family: one entry per channel type, context is its enriched entity. */
type ChannelTabsSlotContexts = {
  [C in ChannelEntityType as `${C}.tabs`]: ChannelEntityContext<C>;
};

/**
 * The slot map: every slot id a tool can be placed into, mapped to the context its `render`
 * receives. The slot id names the surface; this map is the single place binding surface to
 * context. New slot families add entries here (and apps could augment via module declaration).
 * A slot's presentation (stacked sections vs a tab bar) is the consumer's choice, not the tool's:
 * one tool shape feeds settings sections, channel tabs, and the non-entity system tab bar alike.
 */
export interface SlotContexts extends ChannelSettingsSlotContexts, ChannelTabsSlotContexts {
  /** The current user's account settings page (the consumer passes no grants or pairs). */
  'account.settings': MeUser;
  /** The system admin panel's tab bar: a non-entity surface, so tools render with no context. */
  'system.tabs': undefined;
}

/** Every slot id a frontend module can place tools into. */
export type Slot = keyof SlotContexts & string;

/**
 * A tool placed into one slot: descriptor plus a renderer receiving that slot's context.
 * `render` returns the slot's full content unit (a card for settings slots; use `ToolCard` for
 * the standard look) and must lazy-load heavy UI. Settings slots sort built-ins 10/20, danger
 * zone 90, module tools default 50.
 */
export type ToolFor<S extends Slot> = PlacementDescriptor & {
  slot: S;
  /** Renders the tool for the slot's context. */
  render: (context: SlotContexts[S]) => ReactNode;
};

/** Union of tool shapes a frontend module can declare under `tools`, discriminated by `slot`. */
export type Tool = { [S in Slot]: ToolFor<S> }[Slot];

/**
 * App adjustment to a declared placement or nav tab (see `~/placement-config`, a pinned file).
 * Overrides only hide and reorder; changing who sees a tool means declaring the tool differently
 * in its module.
 */
export interface PlacementOverride {
  /** Drops the placement from its host (applies even to `locked` placements: this layer is code). */
  hidden?: boolean;
  /** Replaces the declared sort position. */
  order?: number;
}

/** Host-keyed override map: slot id for tools, parent route id for nav tabs. */
export type PlacementOverrides = Partial<Record<string, Partial<Record<string, PlacementOverride>>>>;

/** Internal registry entry: render context erased so all slot families share one index. */
type RegisteredTool = PlacementDescriptor & { slot: string; render: (context: never) => ReactNode };

const bySlot = new Map<string, RegisteredTool[]>();

/** Startup contract check: every visibleTo pair must name a real role of a real channel type. */
function assertContextRoles(tool: Tool): void {
  for (const pair of tool.visibleTo ?? []) {
    const dot = pair.indexOf('.');
    const channelType = pair.slice(0, dot);
    const role = pair.slice(dot + 1);
    const roles = hierarchy.getRoles(channelType) as readonly string[];
    if (!roles.includes(role)) {
      throw new Error(`Tool '${tool.id}' declares invalid context-role pair '${pair}' (slot '${tool.slot}')`);
    }
  }
}

onFrontendModuleRegister((module) => {
  for (const tool of module.tools ?? []) {
    assertContextRoles(tool);
    const list = bySlot.get(tool.slot) ?? [];
    list.push(tool);
    list.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    bySlot.set(tool.slot, list);
  }
});

/** Tools registered for a slot, sorted on `order`, with the section default (50) applied. */
export function getTools<S extends Slot>(slot: S): (ToolFor<S> & { order: number })[] {
  const registered = bySlot.get(slot) ?? [];
  // Cast: registration erased the render context; the slot key guarantees the family's shape
  return registered.map((tool) => ({ ...tool, order: tool.order ?? 50 })) as (ToolFor<S> & { order: number })[];
}

/**
 * Registered tool descriptors for a slot given at runtime (render context erased, `order` left
 * raw so each surface applies its own default). Navigation and arrangement consumers use this
 * when the slot id is dynamic (e.g. a tab bar resolving a surface's `tabsSlot`); rendering still
 * goes through {@link getTools} with the statically known slot.
 */
export function getSlotDescriptors(slot: string): (PlacementDescriptor & { slot: string })[] {
  return bySlot.get(slot) ?? [];
}

/**
 * Orders a slot's placements against channel-stored arrangement: stored ids come first in their
 * stored sequence, unlisted placements append by their declared `order`, and stored ids with no
 * matching placement are ignored (fail-closed reconciliation of code registry vs stored config).
 */
export function orderBySlotConfig<T extends PlacementDescriptor & { order: number }>(
  items: T[],
  slotConfig?: SlotToolsConfig,
): T[] {
  const stored = slotConfig?.order;
  if (!stored?.length) return [...items].sort((a, b) => a.order - b.order);
  const rank = new Map(stored.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const rankA = rank.get(a.id);
    const rankB = rank.get(b.id);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    return a.order - b.order;
  });
}

/** Resolution inputs a consumer passes for its host (all optional; absent means unconditioned). */
export interface ResolvePlacementOptions {
  /** Grants the actor holds; placements declaring `requires` hide without a match. */
  grants?: readonly string[];
  /** Context-role pairs the actor holds; placements declaring `visibleTo` hide without a match. */
  pairs?: readonly ContextRole[];
  /** Channel-stored arrangement for this slot (order + hidden), reconciled fail-closed. */
  slotConfig?: SlotToolsConfig;
  /** App override map (defaults to `~/placement-config`). */
  overrides?: PlacementOverrides;
}

/**
 * Whether the arrangement layers alone drop a placement from its host: an app override or the
 * channel-stored hidden list (`locked` placements ignore the latter). Grant (`requires`) and
 * context-role (`visibleTo`) gating are viewer conditions, not arrangement, and are deliberately
 * excluded. This answers "is this placement disabled on the surface", e.g. to forward away from
 * a hidden tab a viewer navigated to directly.
 */
export function isPlacementHidden(
  host: string,
  item: PlacementDescriptor,
  options: Pick<ResolvePlacementOptions, 'slotConfig' | 'overrides'> = {},
): boolean {
  const { slotConfig, overrides = placementOverrides } = options;
  if (overrides[host]?.[item.id]?.hidden) return true;
  return !item.locked && (slotConfig?.hidden ?? []).includes(item.id);
}

/**
 * Resolves a host's final placement list: applies app overrides, channel-stored hiding, grant
 * (`requires`) and context-role (`visibleTo`) gating, then channel-stored ordering with the
 * stable `order` sort as fallback. `locked` placements ignore channel-stored hiding only.
 */
export function resolvePlacementList<T extends PlacementDescriptor & { order: number }>(
  host: string,
  items: T[],
  options: ResolvePlacementOptions = {},
): T[] {
  const { grants = [], pairs = [], slotConfig, overrides = placementOverrides } = options;
  const hostOverrides = overrides[host];

  const adjusted = items
    .filter((item) => !isPlacementHidden(host, item, { slotConfig, overrides }))
    .map((item) => {
      const order = hostOverrides?.[item.id]?.order;
      return order === undefined ? item : { ...item, order };
    })
    .filter((item) => !item.requires || grants.includes(item.requires))
    .filter((item) => !item.visibleTo || item.visibleTo.some((pair) => pairs.includes(pair)));

  return orderBySlotConfig(adjusted, slotConfig);
}
