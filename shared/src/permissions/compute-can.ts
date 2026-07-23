import type { ChannelEntityType, EntityActionType, EntityRole, EntityType } from '../../types';
import { recordFromKeys } from '../config-builder/utils';
import { getPolicyPermissions, getEntityPolicies } from './policy-matrix';
import { allActionsDenied } from './action-helpers';
import { isRowCondition } from './row-conditions';
import type { PolicyMatrix, CanState } from './types';
import { type HierarchyOverrides, resolveHierarchy } from './engine/resolve-hierarchy';

/**
 * Per-action permission state for one entity type. Three-valued to carry row conditions to the UI:
 * `true` = allowed (`1`), `false` = denied (`0`), condition name (e.g. `'own'`) = allowed only on
 * matching rows, resolved per row on the frontend by `resolveCan` / the condition's check-form.
 */
type ActionStates = Record<EntityActionType, CanState>;

/** Entity-type-keyed permission map: channel entity + its descendant types */
export type EntityCanMap = Partial<Record<EntityType, ActionStates>>;

/**
 * Compute a single entity type's permission states from policies + membership.
 * Returns allActionsDenied when no policy is found.
 */
function computeEntityPermissions(
  entityType: ChannelEntityType | EntityType,
  channelType: ChannelEntityType,
  role: EntityRole,
  policies: PolicyMatrix,
  entityActions: readonly EntityActionType[],
): ActionStates {
  const entityPolicies = getEntityPolicies(entityType, policies);
  const permissions = getPolicyPermissions(entityPolicies, channelType, role);

  if (!permissions) return allActionsDenied;

  return recordFromKeys(entityActions, (action) => {
    const value = permissions[action];
    if (value === 1) return true;
    // Row-conditional grant → surface the condition name (e.g. 'own'); the name IS the cell
    // value. The frontend resolves it per row via resolveCan.
    if (isRowCondition(value)) return value;
    return false;
  }) as ActionStates;
}

/**
 * Builds the frontend permission map for a channel and its descendants from one membership.
 * Row conditions remain unresolved; missing membership returns an empty map.
 */
export const computeCan = (
  channelType: ChannelEntityType,
  membership: { channelType: ChannelEntityType; role: EntityRole } | undefined | null,
  policies: PolicyMatrix,
  overrides?: HierarchyOverrides,
): EntityCanMap => {
  if (!membership) return {};

  // Hierarchy defaults to the app's real config; tests pass a synthetic one (wide-fixture.ts).
  const { hierarchy: h, entityActions } = resolveHierarchy(overrides);
  const map: EntityCanMap = {};

  // Permissions for the channel entity itself
  map[channelType] = computeEntityPermissions(channelType, membership.channelType, membership.role, policies, entityActions);

  // Permissions for all descendant entity types (children + their children)
  for (const descendant of h.getOrderedDescendants(channelType) as EntityType[]) {
    map[descendant] = computeEntityPermissions(descendant, membership.channelType, membership.role, policies, entityActions);
  }

  return map;
};
