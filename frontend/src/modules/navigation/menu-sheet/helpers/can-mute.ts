import { hierarchy } from 'shared';
import type { UserMenuItem } from '~/modules/me/types';

const productHomeChannelTypes = new Set(hierarchy.productTypes.flatMap((type) => hierarchy.possibleHomeChannels(type)));

/** Mute is read on a row's home channel only and reaches no channel below, so a channel that homes no product has nothing to mute. */
export const canMute = (item: UserMenuItem) => productHomeChannelTypes.has(item.entityType);
