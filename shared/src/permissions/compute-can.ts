import type { ChannelEntityType, EntityActionType, EntityRole, EntityType } from '../../types.ts';
import { recordFromKeys } from '../config-builder/utils.ts';
import { allActionsDenied } from './action-helpers.ts';
import { type HierarchyOverrides, resolveHierarchy } from './engine/resolve-hierarchy.ts';
import { getEntityPolicies, getPolicyPermissions } from './policy-matrix.ts';
import { isRowCondition } from './row-conditions.ts';
import type { CanState, PolicyMatrix } from './types.ts';

/**
 * Three-valued so row conditions reach the UI: `true` allowed, `false` denied, condition name
 * (`'own'`) allowed only on matching rows, resolved per row by the frontend's `resolveCan`.
 */
type ActionStates = Record<EntityActionType, CanState>;

/** Keyed by the channel entity plus its descendant types. */
export type EntityCanMap = Partial<Record<EntityType, ActionStates>>;

/** Denies every action when no policy matches. */
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
    // The condition name is the cell value; the frontend resolves it per row via resolveCan.
    if (isRowCondition(value)) return value;
    return false;
  }) as ActionStates;
}

/**
 * The frontend permission map for a channel and its descendants, from one membership. Row
 * conditions stay unresolved; a missing membership yields an empty map.
 */
export const computeCan = (
  channelType: ChannelEntityType,
  membership: { channelType: ChannelEntityType; role: EntityRole } | undefined | null,
  policies: PolicyMatrix,
  overrides?: HierarchyOverrides,
): EntityCanMap => {
  if (!membership) return {};

  const { hierarchy: h, entityActions } = resolveHierarchy(overrides);
  const map: EntityCanMap = {};

  map[channelType] = computeEntityPermissions(
    channelType,
    membership.channelType,
    membership.role,
    policies,
    entityActions,
  );

  for (const descendant of h.getOrderedDescendants(channelType) as EntityType[]) {
    map[descendant] = computeEntityPermissions(
      descendant,
      membership.channelType,
      membership.role,
      policies,
      entityActions,
    );
  }

  return map;
};
