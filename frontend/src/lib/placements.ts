import type { ReactNode } from 'react';
import type { UserBase } from 'sdk';
import type { ChannelEntityType } from 'shared';
import { hierarchy } from 'shared';
import type { ContextRole, SlotToolsConfig } from 'shared/tools-config';
import type { TKey } from '~/lib/i18n-locales';
import { onFrontendModuleRegister } from '~/lib/module';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { MeUser } from '~/modules/me/types';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { placementOverrides } from '~/placement-config';

/** Shared descriptor for placement-driven tabs and tools. Route tabs reuse it via `staticData.navTab`. */
export interface PlacementDescriptor {
  /** Stable id: anchors, tab ids, stored config references, and React keys derive from it. */
  id: string;
  label: TKey;
  /** Optional resource i18n key interpolated into the label. */
  resource?: TKey;
  /** Single-sentence explanation of the placement's content, shown where placements are arranged. */
  description?: TKey;
  /** Sort position, lower first. Settings slots use 10/20 for built-ins, 90 for the danger zone, 50 by default. */
  order?: number;
  /** Grant name this placement needs to be shown; hidden unless the hosting consumer passes it. */
  requires?: string;
  /** Context-role pairs (e.g. 'course.staff') that may see this placement. A UI condition, never data authorization. */
  visibleTo?: ContextRole[];
  /** Channel-stored config cannot hide a locked placement (reorder still works); app overrides in code still can. */
  locked?: boolean;
}

/** Render context per channel type, augmented by apps via `declare module '~/lib/placements'`. */
export interface ChannelEntityByType {
  organization: EnrichedOrganization;
}

/** Render context for a channel type's slots: the enriched channel base intersected with its app-declared type. */
export type ChannelEntityContext<C extends ChannelEntityType> = EnrichedChannel &
  (C extends keyof ChannelEntityByType ? ChannelEntityByType[C] : unknown);

type ChannelSettingsSlotContexts = {
  [C in ChannelEntityType as `${C}.settings`]: ChannelEntityContext<C>;
};

type ChannelTabsSlotContexts = {
  [C in ChannelEntityType as `${C}.tabs`]: ChannelEntityContext<C>;
};

/** Render context of the profile page body: the viewed user, the organization route it opened from, and whether it is a sheet. */
export interface UserProfileContext {
  user: UserBase;
  organizationId?: string;
  isSheet: boolean;
}

/** Every slot id a tool can be placed into, mapped to the context its `render` receives. */
export interface SlotContexts extends ChannelSettingsSlotContexts, ChannelTabsSlotContexts {
  /** The current user's account settings page (the consumer passes no grants or pairs). */
  'account.settings': MeUser;
  /** The home page's stacked sections below the built-in content (no grants or pairs). */
  'home.sections': MeUser;
  /** A user's profile page body below the header, stacked (no grants or pairs); each tool owns its container. */
  'user.profile': UserProfileContext;
  /** The system admin panel's tab bar: a non-entity surface, so tools render with no context. */
  'system.tabs': undefined;
}

export type Slot = keyof SlotContexts & string;

/** A tool in one slot: `render` takes the slot context, returns its full content unit, and lazy-loads heavy UI. */
export type ToolFor<S extends Slot> = PlacementDescriptor & {
  slot: S;
  render: (context: SlotContexts[S]) => ReactNode;
};

export type Tool = { [S in Slot]: ToolFor<S> }[Slot];

/** App adjustment to a declared placement or nav tab (see `~/placement-config`), limited to hiding and reordering. */
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

/** Descriptors for a slot id known only at runtime; render context erased and `order` left raw. */
export function getSlotDescriptors(slot: string): (PlacementDescriptor & { slot: string })[] {
  return bySlot.get(slot) ?? [];
}

/** Stored ids first in stored order, unlisted placements appended by declared `order`, unmatched stored ids ignored. */
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

/** Hiding only: app override or channel-stored list (`locked` ignores the latter); no `requires`/`visibleTo` gating. */
export function isPlacementHidden(
  host: string,
  item: PlacementDescriptor,
  options: Pick<ResolvePlacementOptions, 'slotConfig' | 'overrides'> = {},
): boolean {
  const { slotConfig, overrides = placementOverrides } = options;
  if (overrides[host]?.[item.id]?.hidden) return true;
  return !item.locked && (slotConfig?.hidden ?? []).includes(item.id);
}

/** Applies app overrides, channel-stored hiding (`locked` immune), `requires`/`visibleTo`, then stored ordering. */
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
