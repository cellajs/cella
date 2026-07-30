import type { ReactNode } from 'react';
import type { ChannelEntityType } from 'shared';
import { onFrontendModuleRegister } from '~/lib/module';
import type { EnrichedChannel } from '~/modules/entities/types';

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

/** Every slot a frontend module can contribute to; the union grows as new slot families ship. */
export type PlacementSlot = SettingsAsideSlot;

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

/** Union of contribution shapes a frontend module can declare under `placements`. */
export type PlacementContribution = SettingsAsidePlacement;

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
export function getPlacements(slot: PlacementSlot): PlacementContribution[] {
  return bySlot.get(slot) ?? [];
}
