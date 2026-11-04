import { menuSections } from '../types.ts';

/** Whether a member can archive their membership of a channel type: yes, unless its menu section sets `archivable: false`. */
export const isChannelArchivable = (channelType: string) =>
  !menuSections.some((section) => section.entityType === channelType && section.archivable === false);
