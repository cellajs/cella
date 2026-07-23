import type { EntityActionType } from '../../../types';
import type { EntityHierarchy } from '../../config-builder/entity-hierarchy';

/** Optional hierarchy and action overrides let tests exercise the engine outside app config. */
export interface PermissionTopology {
  hierarchy: EntityHierarchy;
  /** Defaults to `appConfig.entityActions` (the action set is hierarchy-independent). */
  entityActions?: readonly EntityActionType[];
}
