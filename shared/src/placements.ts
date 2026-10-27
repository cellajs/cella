import type { ChannelEntityType } from '../types.ts';
import { appConfig } from './config-builder/app-config.ts';
import { type ChannelSlotOf, type SlotOf, singletonSlots } from './config-builder/types.ts';

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

/** Every slot id this app has, for startup checks over the app's `surfaces` config. */
export const allSlots = (): Slot[] => [...channelSlots(), ...singletonSlots];

/**
 * The placement ids an app declares for a surface, in display order, or undefined when it declares
 * none. A surface the app lists is total: an id it leaves out has no placement on that surface, and
 * a `locked` placement is no exception, because this layer is the app's own code. A surface the app
 * does not list renders every registered placement in its declared order.
 */
export const surfaceOrder = (slot: Slot): readonly string[] | undefined => appConfig.surfaces[slot];
