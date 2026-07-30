import type { ReactNode } from 'react';
import type { ChannelEntityType } from 'shared';
import { hierarchy } from 'shared';
import type { ContextRole, SlotToolsConfig } from 'shared/tools-config';
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
  label: string;
  /** Optional resource i18n key interpolated into the label. */
  resource?: string;
  /** Sort position within the slot (lower first; each slot documents its default). */
  order?: number;
  /** Grant name this placement needs to be shown; hidden unless the hosting consumer passes it. */
  requires?: string;
  /**
   * Context-role pairs (e.g. 'organization.admin', 'course.staff') that may see this placement;
   * hidden unless the consumer passes a matching held pair. A UI visibility condition only,
   * never data authorization. Omit for no identity condition.
   */
  visibleTo?: ContextRole[];
  /**
   * Locked placements cannot be hidden by channel-stored config (reorder still works); app
   * overrides in code may still hide them, since code layers are reviewed decisions.
   */
  locked?: boolean;
}

/** Slot on a channel entity's settings page: tools render as cards with an aside tab. */
export type ChannelSettingsSlot = `${ChannelEntityType}.settings`;

/** Slot on the current user's account settings page (the consumer passes no grants or pairs). */
export type AccountSettingsSlot = 'account.settings';

/** Every slot a frontend module can place tools into; the union grows as slot families ship. */
export type PlacementSlot = ChannelSettingsSlot | AccountSettingsSlot;

/**
 * Render context per settings-aside channel type. Apps augment this interface (via
 * `declare module '~/lib/placements'`) to type their channels' slots precisely; unlisted
 * channel types fall back to {@link EnrichedChannel}.
 */
export interface ChannelSettingsEntityByType {
  organization: EnrichedOrganization;
}

/**
 * Render context for a channel type's settings aside slot: always at least the enriched channel
 * base, intersected with the app-declared type from {@link ChannelSettingsEntityByType} so generic
 * channel components can read base fields while concrete slots stay precisely typed.
 */
export type ChannelSettingsEntity<C extends ChannelEntityType> = EnrichedChannel &
  (C extends keyof ChannelSettingsEntityByType ? ChannelSettingsEntityByType[C] : unknown);

/**
 * A tool placed on a channel entity's settings page. `render` returns the full card (use the
 * shared card components for the standard look) and must lazy-load heavy UI; the consumer wraps
 * it in the aside anchor and sorts everything on `order` (built-ins 10/20, danger zone 90,
 * module tools default 50).
 */
export type ChannelSettingsTool = {
  [C in ChannelEntityType]: PlacementDescriptor & {
    slot: `${C}.settings`;
    /** Renders the card for the hosting channel entity. */
    render: (entity: ChannelSettingsEntity<C>) => ReactNode;
  };
}[ChannelEntityType];

/** A tool placed on the current user's account settings page, sorted like {@link ChannelSettingsTool}. */
export interface AccountSettingsTool extends PlacementDescriptor {
  slot: AccountSettingsSlot;
  /** Renders the card for the signed-in user. */
  render: (user: MeUser) => ReactNode;
}

/** Union of tool shapes a frontend module can declare under `tools`. */
export type Tool = ChannelSettingsTool | AccountSettingsTool;

/** App adjustment to a declared placement or nav tab (see `~/placement-config`, a pinned file). */
export interface PlacementOverride {
  /** Drops the placement from its host (applies even to `locked` placements: this layer is code). */
  hidden?: boolean;
  /** Replaces the declared sort position. */
  order?: number;
  /** Replaces the declared grant requirement. */
  requires?: string;
  /** Replaces the declared context-role visibility condition. */
  visibleTo?: ContextRole[];
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

/** The settings-aside tool shape for one concrete channel type. */
export type ChannelSettingsToolFor<C extends ChannelEntityType> = PlacementDescriptor & {
  slot: `${C}.settings`;
  render: (entity: ChannelSettingsEntity<C>) => ReactNode;
};

/** Tools registered for a channel type's settings aside slot, sorted on `order` (default 50). */
export function getChannelSettingsTools<C extends ChannelEntityType>(channelType: C): ChannelSettingsToolFor<C>[] {
  const registered = bySlot.get(`${channelType}.settings`) ?? [];
  // Cast: registration erased the render context; the slot key guarantees this family's shape
  return registered as ChannelSettingsToolFor<C>[];
}

/** Tools registered for the account settings aside slot, sorted on `order` (default 50). */
export function getAccountSettingsTools(): AccountSettingsTool[] {
  const registered = bySlot.get('account.settings') ?? [];
  // Cast: registration erased the render context; the slot key guarantees this family's shape
  return registered as AccountSettingsTool[];
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
  const channelHidden = new Set(slotConfig?.hidden ?? []);

  const adjusted = items
    .filter((item) => !hostOverrides?.[item.id]?.hidden)
    .filter((item) => item.locked || !channelHidden.has(item.id))
    .map((item) => {
      const override = hostOverrides?.[item.id];
      if (!override) return item;
      return {
        ...item,
        ...(override.order !== undefined && { order: override.order }),
        ...(override.requires !== undefined && { requires: override.requires }),
        ...(override.visibleTo !== undefined && { visibleTo: override.visibleTo }),
      };
    })
    .filter((item) => !item.requires || grants.includes(item.requires))
    .filter((item) => !item.visibleTo || item.visibleTo.some((pair) => pairs.includes(pair)));

  return orderBySlotConfig(adjusted, slotConfig);
}
