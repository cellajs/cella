import { hierarchy as appHierarchy } from '../../../config/hierarchy-config.ts';
import type { ChannelEntityType, EntityRole } from '../../../types.ts';
import { appConfig } from '../../config-builder/app-config.ts';
import type { EntityHierarchy } from '../../config-builder/entity-hierarchy.ts';

/** Lets tests exercise the engine outside the app config. */
export interface HierarchyOverrides {
  hierarchy?: EntityHierarchy;
}

/** What the permission machinery reads, defaulting to the app singletons. */
export interface ResolvedHierarchy {
  /** Typed as the app's, so its outputs carry the app's channel types and roles. */
  hierarchy: typeof appHierarchy;
  channelEntityTypes: readonly ChannelEntityType[];
  /** Empty for a type that is no channel. */
  getRoles: (type: string) => readonly EntityRole[];
  /**
   * The channels whose memberships decide on an entity type, most specific first: a channel itself, then its
   * ancestors; a product only its ancestors. The first entry is the primary channel for membership capture.
   */
  orderedChannels: (entityType: string) => ChannelEntityType[];
}

/**
 * The injected hierarchy, or the app's: the one place an injected hierarchy is narrowed. A synthetic hierarchy brings
 * its own channel types and roles, which pass under the app's unions.
 */
export const resolveHierarchy = (overrides?: HierarchyOverrides): ResolvedHierarchy => {
  // Cast: an injected hierarchy is typed `EntityHierarchy`, whose channel types and roles are `string`.
  const h = (overrides?.hierarchy ?? appHierarchy) as typeof appHierarchy;
  return {
    hierarchy: h,
    channelEntityTypes: overrides?.hierarchy ? h.channelTypes : appConfig.channelEntityTypes,
    getRoles: h.getRoles,
    orderedChannels: (entityType) => {
      const ancestors = h.getOrderedAncestors(entityType);
      return h.isChannel(entityType) ? [entityType, ...ancestors] : [...ancestors];
    },
  };
};
