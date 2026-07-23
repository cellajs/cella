import { appConfig } from '../../config-builder/app-config';
import { hierarchy as appHierarchy } from '../../../config/hierarchy-config';
import type { ChannelEntityType, EntityActionType } from '../../../types';
import type { EntityHierarchy } from '../../config-builder/entity-hierarchy';

/** Optional hierarchy and action overrides let tests exercise the engine outside app config. */
export interface HierarchyOverrides {
  hierarchy?: EntityHierarchy;
  /** Defaults to `appConfig.entityActions` (the action set is hierarchy-independent). */
  entityActions?: readonly EntityActionType[];
}

/** The hierarchy surface the permission machinery reads, with the app singletons as defaults. */
export interface ResolvedHierarchy {
  hierarchy: EntityHierarchy;
  entityActions: readonly EntityActionType[];
  channelEntityTypes: readonly ChannelEntityType[];
  getRoles: (type: string) => readonly string[];
}

/**
 * Resolves the hierarchy and action set for permission operations. Synthetic channel types come
 * from their own hierarchy, and wrapped methods retain hierarchy binding.
 */
export const resolveHierarchy = (overrides?: HierarchyOverrides): ResolvedHierarchy => {
  const h: EntityHierarchy = overrides?.hierarchy ?? appHierarchy;
  return {
    hierarchy: h,
    entityActions: (overrides?.entityActions ?? appConfig.entityActions) as readonly EntityActionType[],
    channelEntityTypes: (overrides?.hierarchy
      ? h.channelTypes
      : appConfig.channelEntityTypes) as readonly ChannelEntityType[],
    getRoles: (type) => h.getRoles(type),
  };
};
