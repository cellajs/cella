import { hierarchy as appHierarchy } from '../../../config/hierarchy-config.ts';
import type { ChannelEntityType } from '../../../types.ts';
import { appConfig } from '../../config-builder/app-config.ts';
import type { EntityHierarchy } from '../../config-builder/entity-hierarchy.ts';

/** Lets tests exercise the engine outside the app config. */
export interface HierarchyOverrides {
  hierarchy?: EntityHierarchy;
}

/** What the permission machinery reads, defaulting to the app singletons. */
export interface ResolvedHierarchy {
  hierarchy: EntityHierarchy;
  channelEntityTypes: readonly ChannelEntityType[];
  getRoles: (type: string) => readonly string[];
  /**
   * The channels whose memberships decide on an entity type, most specific first: a channel itself, then its
   * ancestors; a product only its ancestors. The first entry is the primary channel for membership capture.
   */
  orderedChannels: (entityType: string) => ChannelEntityType[];
}

/** Synthetic channel types come from their own hierarchy, and wrapped methods keep its binding. */
export const resolveHierarchy = (overrides?: HierarchyOverrides): ResolvedHierarchy => {
  const h: EntityHierarchy = overrides?.hierarchy ?? appHierarchy;
  return {
    hierarchy: h,
    channelEntityTypes: (overrides?.hierarchy ? h.channelTypes : appConfig.channelEntityTypes) as readonly ChannelEntityType[],
    getRoles: (type) => h.getRoles(type),
    orderedChannels: (entityType) => {
      const ancestors = h.getOrderedAncestors(entityType);
      // The injected hierarchy's channel type is `string`, so `isChannel` narrows to no type the engine knows.
      return (h.isChannel(entityType) ? [entityType, ...ancestors] : [...ancestors]) as ChannelEntityType[];
    },
  };
};
