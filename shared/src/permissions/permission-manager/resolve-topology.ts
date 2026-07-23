import { appConfig } from '../../config-builder/app-config';
import { hierarchy } from '../../../config/hierarchy-config';
import type { ChannelEntityType, EntityActionType } from '../../../types';
import type { EntityHierarchy } from '../../config-builder/entity-hierarchy';
import type { PermissionTopology } from './topology';

/** The topology surface the permission machinery reads, with the app singletons as defaults. */
export interface ResolvedTopology {
  hierarchy: EntityHierarchy;
  entityActions: readonly EntityActionType[];
  channelEntityTypes: readonly ChannelEntityType[];
  getRoles: (type: string) => readonly string[];
}

/**
 * Resolves a synthetic or configured topology for permission operations.
 * Synthetic channel types come from their own hierarchy, and wrapped methods retain hierarchy
 * binding.
 */
export const resolveTopology = (topology?: PermissionTopology): ResolvedTopology => {
  const h: EntityHierarchy = topology?.hierarchy ?? hierarchy;
  return {
    hierarchy: h,
    entityActions: (topology?.entityActions ?? appConfig.entityActions) as readonly EntityActionType[],
    channelEntityTypes: (topology ? h.channelTypes : appConfig.channelEntityTypes) as readonly ChannelEntityType[],
    getRoles: (type) => h.getRoles(type),
  };
};
