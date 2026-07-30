import type { ReactNode } from 'react';
import type { ChannelEntityType } from 'shared';
import { onFrontendModuleRegister } from '~/lib/module';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { MeUser } from '~/modules/me/types';
import { placementOverrides } from '~/placement-config';

/**
 * Shared descriptor for placement-driven tabs and sections. Route tabs reuse it via
 * `staticData.navTab`; slot contributions extend it with a `slot` and a renderer.
 */
export interface PlacementTab {
  /** Stable id: anchors, tab ids, and React keys derive from it. */
  id: string;
  /** i18n key for the tab or section label. */
  label: string;
  /** Optional resource i18n key interpolated into the label. */
  resource?: string;
  /** Sort position within the slot (lower first; each slot documents its default). */
  order?: number;
  /** Grant name this placement needs to be shown; hidden unless the hosting page passes it. */
  requires?: string;
}

/** Slot on a channel entity's settings page: contributions render as cards with an aside tab. */
export type SettingsAsideSlot = `${ChannelEntityType}.settings.aside`;

/** Slot on the current user's account settings page (the page passes no grants). */
export type AccountSettingsAsideSlot = 'account.settings.aside';

/** Every slot a frontend module can contribute to; the union grows as new slot families ship. */
export type PlacementSlot = SettingsAsideSlot | AccountSettingsAsideSlot;

/**
 * A card contributed to a channel entity's settings page. The hosting page wraps `render` in a
 * titled card, adds an aside tab, and sorts built-ins and contributions together on `order`
 * (contribution default 50; the template's built-ins use 10/20, and 90 for the danger zone).
 */
export interface SettingsAsidePlacement extends PlacementTab {
  slot: SettingsAsideSlot;
  /** Renders the card body for the given enriched channel entity. Lazy-load heavy UI here. */
  render: (entity: EnrichedChannel) => ReactNode;
}

/**
 * A card contributed to the current user's account settings page, wrapped and sorted like
 * {@link SettingsAsidePlacement} (built-ins 10/20/30, danger zone 90, contribution default 50).
 */
export interface AccountSettingsAsidePlacement extends PlacementTab {
  slot: AccountSettingsAsideSlot;
  /** Renders the card body for the signed-in user. Lazy-load heavy UI here. */
  render: (user: MeUser) => ReactNode;
}

/** Union of contribution shapes a frontend module can declare under `placements`. */
export type PlacementContribution = SettingsAsidePlacement | AccountSettingsAsidePlacement;

/** App adjustment to a declared placement or nav tab (see `~/placement-config`, a pinned file). */
export interface PlacementOverride {
  /** Drops the placement from its host. */
  hidden?: boolean;
  /** Replaces the declared sort position. */
  order?: number;
  /** Replaces the declared grant requirement. */
  requires?: string;
}

/** Override map keyed by host (slot id for aside sections, parent route id for nav tabs), then placement id. */
export type PlacementOverrides = Partial<Record<string, Partial<Record<string, PlacementOverride>>>>;

const bySlot = new Map<PlacementSlot, PlacementContribution[]>();

onFrontendModuleRegister((module) => {
  for (const contribution of module.placements ?? []) {
    const list = bySlot.get(contribution.slot) ?? [];
    list.push(contribution);
    list.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    bySlot.set(contribution.slot, list);
  }
});

/** Contributions registered for a slot, sorted on `order` (default 50, lower first). */
export function getPlacements(slot: SettingsAsideSlot): SettingsAsidePlacement[];
export function getPlacements(slot: AccountSettingsAsideSlot): AccountSettingsAsidePlacement[];
export function getPlacements(slot: PlacementSlot): PlacementContribution[] {
  return bySlot.get(slot) ?? [];
}

/**
 * Resolves a host's final placement list: applies app overrides (hide, reorder, re-gate), drops
 * entries whose `requires` grant is absent, and sorts on `order` (stable, so ties keep the
 * declared order). Hosting pages and tab bars run their merged built-in + contribution lists
 * through this so overrides in `~/placement-config` work uniformly.
 */
export function resolvePlacementList<T extends PlacementTab & { order: number }>(
  host: string,
  items: T[],
  grants: readonly string[] = [],
  overrides: PlacementOverrides = placementOverrides,
): T[] {
  const hostOverrides = overrides[host];
  return items
    .filter((item) => !hostOverrides?.[item.id]?.hidden)
    .map((item) => {
      const override = hostOverrides?.[item.id];
      if (!override) return item;
      return {
        ...item,
        ...(override.order !== undefined && { order: override.order }),
        ...(override.requires !== undefined && { requires: override.requires }),
      };
    })
    .filter((item) => !item.requires || grants.includes(item.requires))
    .sort((a, b) => a.order - b.order);
}
