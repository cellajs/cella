import { menuSections } from '../types.ts';

/** Whether a member can hide their membership of a channel type: yes, unless its menu section sets `hideable: false`. */
export const isChannelHideable = (channelType: string) =>
  !menuSections.some((section) => section.entityType === channelType && section.hideable === false);
