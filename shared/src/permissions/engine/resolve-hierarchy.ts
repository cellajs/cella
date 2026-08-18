import { hierarchy as appHierarchy } from '../../../config/hierarchy-config.ts';
import type { ChannelEntityType, EntityActionType } from '../../../types.ts';
import { appConfig } from '../../config-builder/app-config.ts';
import type { EntityHierarchy } from '../../config-builder/entity-hierarchy.ts';

/** Lets tests exercise the engine outside the app config. */
export interface HierarchyOverrides {
  hierarchy?: EntityHierarchy;
  /** Defaults to `appConfig.entityActions` (the action set is hierarchy-independent). */
  entityActions?: readonly EntityActionType[];
}

/** What the permission machinery reads, defaulting to the app singletons. */
export interface ResolvedHierarchy {
  hierarchy: EntityHierarchy;
  entityActions: readonly EntityActionType[];
  channelEntityTypes: readonly ChannelEntityType[];
  getRoles: (type: string) => readonly string[];
}

/** Synthetic channel types come from their own hierarchy, and wrapped methods keep its binding. */
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
