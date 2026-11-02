import { appConfig } from './config-builder/app-config.ts';
import type { MenuStructureItem } from './config-builder/types.ts';

const menuStructure: readonly MenuStructureItem[] = appConfig.menuStructure;
const unarchivableTypes = new Set(menuStructure.filter(({ archivable }) => archivable === false).map(({ entityType }) => entityType));

/** Whether a member can archive their membership of a channel type: yes, unless its menu section sets `archivable: false`. */
export const isChannelArchivable = (channelType: string) => !unarchivableTypes.has(channelType);
