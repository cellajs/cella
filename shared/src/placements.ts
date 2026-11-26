import { hierarchy } from '../config/config.default.ts';
import type { ChannelEntityType } from '../types.ts';
import { appConfig } from './config-builder/app-config.ts';
import type { EntityHierarchy } from './config-builder/entity-hierarchy.ts';
import type { ChannelSlotOf, SlotOf, SurfaceArrangement } from './config-builder/types.ts';
import { resolveHierarchy } from './permissions/engine/resolve-hierarchy.ts';

/**
 * A channel's own placement surfaces: its settings page and its tab bar. A channel row stores an arrangement only for
 * these slots, of its own type and of the types below it: the other surfaces have no row to hang one on.
 */
export type ChannelSlot = ChannelSlotOf<ChannelEntityType>;

/**
 * Every placement surface. The frontend maps each to the render context its placements receive;
 * this union is the key space of `appConfig.surfaces` and of placement resolution.
 */
export type Slot = SlotOf<ChannelEntityType>;

/**
 * The slots a row of `entityType` may store an arrangement for, validated at the wire: its own, then those of every
 * channel type below it, which the rows inside it stack under their own. Empty for a type that is no channel.
 */
export const storableSlots = (entityType: string, entityHierarchy: EntityHierarchy = hierarchy): ChannelSlot[] => {
  const { hierarchy: resolved } = resolveHierarchy({ hierarchy: entityHierarchy });
  if (!resolved.isChannel(entityType)) return [];
  const channelTypes = [entityType, ...resolved.getOrderedDescendants(entityType).filter(resolved.isChannel)];
  return channelTypes.flatMap((type) => [`${type}.settings` as const, `${type}.tabs` as const]);
};

/** The app's arrangement of a surface, or undefined when it arranges none. */
export const surfaceArrangement = (slot: Slot): SurfaceArrangement | undefined => appConfig.surfaces[slot];
