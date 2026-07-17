import type { EntityActionType } from '../../../types';

/** Structural subset of the app's `EntityHierarchy` the engine reads; the real `hierarchy` satisfies it. */
export interface TopologyHierarchy {
  readonly channelTypes: readonly string[];
  getOrderedAncestors(entityType: string): readonly string[];
  getOrderedDescendants(entityType: string): readonly string[];
  getRoles(channelType: string): readonly string[];
  isChannel(entityType: string): boolean;
  isProduct(entityType: string): boolean;
}

/** Optional hierarchy and action overrides let tests exercise the engine outside app config. */
export interface PermissionTopology {
  hierarchy: TopologyHierarchy;
  /** Defaults to `appConfig.entityActions` (the action set is hierarchy-independent). */
  entityActions?: readonly EntityActionType[];
}
