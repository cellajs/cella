import type { ReactNode } from 'react';
import type { UserBase } from 'sdk';
import { type ChannelEntityType, type EntityActionType, hierarchy } from 'shared';
import { type Slot, surfaceArrangement } from 'shared/placements';
import type { ContextRole, SlotToolsConfig } from 'shared/tools-config';
import type { TKey } from '~/lib/i18n-locales';
import { onFrontendModuleRegister } from '~/lib/module';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { MeUser } from '~/modules/me/types';
import type { EnrichedOrganization } from '~/modules/organization/types';

/** A grant a consumer passes: an entity action, or `archive`, the update grant on a channel whatever its archived state. */
export type PlacementGrant = EntityActionType | 'archive';

/** Shared descriptor for placement-driven tabs and tools. Route tabs reuse it via `staticData.navTab`. */
export interface PlacementDescriptor {
  /** Stable id: anchors, tab ids, stored config references, and React keys derive from it. */
  id: string;
  label: TKey;
  /** Optional resource i18n key interpolated into the label. */
  resource?: TKey;
  /** Single-sentence explanation of the placement's content, shown where placements are arranged. */
  description?: TKey;
  /** Sort position, lower first. Settings slots use 10/20 for built-ins, 85 for archive, 90 for the danger zone, 50 by default. */
  order?: number;
  /** Grant name this placement needs to be shown; hidden unless the hosting consumer passes it. */
  requires?: PlacementGrant;
  /** Context-role pairs (e.g. 'course.staff') that may see this placement. A UI condition, never data authorization. */
  visibleTo?: ContextRole[];
  /** Channel-stored config cannot hide a locked placement (reorder still works); the app's `surfaces` entry still can. */
  locked?: boolean;
}

/** Render context per channel type, augmented by apps via `declare module '~/lib/placements'`. */
export interface ChannelEntityByType {
  organization: EnrichedOrganization;
}

/** Render context for a channel type's slots: the enriched channel base intersected with its app-declared type. */
export type ChannelEntityContext<C extends ChannelEntityType> = EnrichedChannel &
  (C extends keyof ChannelEntityByType ? ChannelEntityByType[C] : unknown);

type ChannelSettingsSlotContexts = { [C in ChannelEntityType as `${C}.settings`]: ChannelEntityContext<C> };

type ChannelTabsSlotContexts = { [C in ChannelEntityType as `${C}.tabs`]: ChannelEntityContext<C> };

/** Render context of the profile page body: the viewed user, the organization route it opened from, and whether it is a sheet. */
interface UserProfileContext {
  user: UserBase;
  organizationId?: string;
  isSheet: boolean;
}

/** Every slot id a tool can be placed into, mapped to the context its `render` receives. */
export interface SlotContexts extends ChannelSettingsSlotContexts, ChannelTabsSlotContexts {
  /** The current user's account settings page (the consumer passes no grants or pairs). */
  'account.settings': MeUser;
  /** The account sheet's preferences panel, a group per tool below the appearance group: settings of this device, so no context. */
  'account.preferences': undefined;
  /** The home page's stacked sections below the built-in content (no grants or pairs). */
  'home.sections': MeUser;
  /** A user's profile page body below the header, stacked (no grants or pairs); each tool owns its container. */
  'user.profile': UserProfileContext;
  /** The system admin panel's tab bar: a non-entity surface, so tools render with no context. */
  'system.tabs': undefined;
}

/** Compile-time check that `SlotContexts` covers exactly the app's slots, no more and no fewer. */
type _SlotsCovered = [keyof SlotContexts] extends [Slot] ? ([Slot] extends [keyof SlotContexts] ? true : never) : never;
const _slotsCovered: _SlotsCovered = true;
void _slotsCovered;

/** Fields a slot's tools add to the descriptor, for a consumer that reads more than `render`. */
interface SlotToolFields {
  'account.preferences': {
    /** Rendered after the panel toggle's label while the panel is closed, such as a dot when something needs attention. */
    indicator?: () => ReactNode;
  };
  'home.sections': {
    /** Loads the section's code and data ahead, in the home route's loader: the page then renders whole, and nothing moves as a late section lands. */
    preload?: () => Promise<unknown>;
  };
}

/** A tool in one slot: `render` takes the slot context, returns its full content unit, and lazy-loads heavy UI. */
type ToolFor<S extends Slot> = PlacementDescriptor & {
  slot: S;
  render: (context: SlotContexts[S]) => ReactNode;
} & (S extends keyof SlotToolFields ? SlotToolFields[S] : unknown);

export type Tool = { [S in Slot]: ToolFor<S> }[Slot];

export type { Slot };

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
    if (!roles.includes(role)) throw new Error(`Tool '${tool.id}' declares invalid context-role pair '${pair}' (slot '${tool.slot}')`);
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

/** Ids in `order` first, in that sequence, and the rest after them in declared `order`. */
function orderByIds<T extends PlacementDescriptor & { order: number }>(items: T[], order: readonly string[]): T[] {
  const rank = new Map<string, number>();
  for (const id of order) if (!rank.has(id)) rank.set(id, rank.size);
  const rankOf = (item: T) => rank.get(item.id) ?? rank.size;
  return [...items].sort((a, b) => rankOf(a) - rankOf(b) || a.order - b.order);
}

/** Resolution inputs a consumer passes for a slot (all optional; absent means unconditioned). */
export interface ResolvePlacementOptions {
  /** Grants the actor holds; placements declaring `requires` hide without a match. */
  grants?: readonly PlacementGrant[];
  /** Context-role pairs the actor holds; placements declaring `visibleTo` hide without a match. */
  pairs?: readonly ContextRole[];
  /** Channel-stored arrangement for this slot (order + hidden), reconciled fail-closed. */
  slotConfig?: SlotToolsConfig;
}

/** Hiding only, no `requires`/`visibleTo` gating: the app's `surfaces` entry hides the id, or the channel's stored config hides an unlocked one. */
export function isPlacementHidden(slot: Slot, item: PlacementDescriptor, options: Pick<ResolvePlacementOptions, 'slotConfig'> = {}): boolean {
  if (surfaceArrangement(slot)?.hidden?.includes(item.id)) return true;
  return !item.locked && (options.slotConfig?.hidden ?? []).includes(item.id);
}

/**
 * The placements of a slot in the order it shows them, channel-hidden ones included: what a channel arranges. The app's
 * `surfaces` entry leaves out the ones it hides and orders the rest, and the channel's stored order applies on top.
 */
export function arrangePlacements<T extends PlacementDescriptor & { order: number }>(slot: Slot, items: T[], slotConfig?: SlotToolsConfig): T[] {
  const { order = [], hidden = [] } = surfaceArrangement(slot) ?? {};
  const shown = items.filter((item) => !hidden.includes(item.id));
  return orderByIds(shown, [...(slotConfig?.order ?? []), ...order]);
}

/** {@link arrangePlacements} for what a viewer sees: channel-stored hiding (`locked` immune), then `requires`/`visibleTo` leave a placement out. */
export function resolvePlacementList<T extends PlacementDescriptor & { order: number }>(
  slot: Slot,
  items: T[],
  options: ResolvePlacementOptions = {},
): T[] {
  const { grants = [], pairs = [], slotConfig } = options;

  const visible = items
    .filter((item) => !isPlacementHidden(slot, item, { slotConfig }))
    .filter((item) => !item.requires || grants.includes(item.requires))
    .filter((item) => !item.visibleTo || item.visibleTo.some((pair) => pairs.includes(pair)));

  return arrangePlacements(slot, visible, slotConfig);
}
