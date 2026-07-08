import { appConfig } from '../../config-builder/app-config';
import { hierarchy } from '../../../config/hierarchy-config';
import type { ContextEntityType, EntityActionType } from '../../../types';
import type { PermissionTopology, TopologyHierarchy } from './topology';

/** The topology surface the permission machinery reads, with the app singletons as defaults. */
export interface ResolvedTopology {
  hierarchy: TopologyHierarchy;
  entityActions: readonly EntityActionType[];
  contextEntityTypes: readonly ContextEntityType[];
  getRoles: (type: string) => readonly string[];
  getHostType: (type: string) => string | null | undefined;
  getParent: (type: string) => string | null;
}

/**
 * Resolve the topology override (tests) or the app singletons into the surface the permission
 * machinery reads. Centralizes the `topology ?? app-config` fallback — and the accompanying
 * widening casts — that were otherwise duplicated across `configurePermissions`,
 * `getAllDecisions` and `computeCan`.
 *
 * The context set derives from the (possibly synthetic) hierarchy's own `contextTypes`, not
 * appConfig's, so a fork whose real config is narrower than a test fixture still builds every
 * context. Method refs are wrapped in arrows so `this` stays bound to the hierarchy object.
 */
export const resolveTopology = (topology?: PermissionTopology): ResolvedTopology => {
  const h: TopologyHierarchy = topology?.hierarchy ?? hierarchy;
  return {
    hierarchy: h,
    entityActions: (topology?.entityActions ?? appConfig.entityActions) as readonly EntityActionType[],
    contextEntityTypes: (topology ? h.contextTypes : appConfig.contextEntityTypes) as readonly ContextEntityType[],
    getRoles: (type) => h.getRoles(type),
    getHostType: (type) => h.getHostType(type),
    getParent: (type) => h.getParent(type),
  };
};
