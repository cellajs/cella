import type { ChannelEntityType } from '../types.ts';
import { appConfig } from './config-builder/app-config.ts';
import type { ChannelSlotOf, SlotOf, SurfaceArrangement } from './config-builder/types.ts';

/**
 * A channel's own placement surfaces: its settings page and its tab bar. The only slots a channel
 * row stores an arrangement for, since the surfaces below have no row to hang one on.
 */
export type ChannelSlot = ChannelSlotOf<ChannelEntityType>;

/**
 * Every placement surface. The frontend maps each to the render context its placements receive;
 * this union is the key space of `appConfig.surfaces` and of placement resolution.
 */
export type Slot = SlotOf<ChannelEntityType>;

/** Every channel slot this app has: the keys a stored `toolsConfig` may carry, validated at the wire. */
export const channelSlots = (): ChannelSlot[] =>
  appConfig.channelEntityTypes.flatMap((type) => [`${type}.settings` as const, `${type}.tabs` as const]);

/** The app's arrangement of a surface, or undefined when it arranges none. */
export const surfaceArrangement = (slot: Slot): SurfaceArrangement | undefined => appConfig.surfaces[slot];
