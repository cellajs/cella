import type { ChannelEntityType, EntityActionType, EntityRole, EntityType } from '../../types';
import { recordFromKeys } from '../config-builder/utils';
import { getPolicyPermissions, getSubjectPolicies } from './access-policies';
import { allActionsDenied } from './action-helpers';
import { isRowCondition } from './row-conditions';
import type { AccessPolicies, ActionPermissionState } from './types';
import { resolveTopology } from './permission-manager/resolve-topology';
import type { PermissionTopology } from './permission-manager/topology';

/**
 * Per-action permission state for one entity type. Three-valued to carry row conditions to the UI:
 * `true` = allowed (`1`), `false` = denied (`0`), condition name (e.g. `'own'`) = allowed only on
 * matching rows, resolved per row on the frontend by `resolvePermission` / the condition's check-form.
 */
type ActionStates = Record<EntityActionType, ActionPermissionState>;

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
  policies: AccessPolicies,
  entityActions: readonly EntityActionType[],
): ActionStates {
  const subjectPolicies = getSubjectPolicies(entityType as ChannelEntityType, policies);
  const permissions = getPolicyPermissions(subjectPolicies, channelType, role);

  if (!permissions) return allActionsDenied;

  return recordFromKeys(entityActions, (action) => {
    const value = permissions[action];
    if (value === 1) return true;
    // Row-conditional grant → surface the condition name (e.g. 'own'); the name IS the cell
    // value. The frontend resolves it per row via resolvePermission.
    if (isRowCondition(value)) return value;
    return false;
  }) as ActionStates;
}

/**
 * Frontend `can` map for a channel entity and all its hierarchy descendants, derived from the
 * membership baked onto the channel entity. `'own'` grants are preserved (see {@link ActionStates}).
 * Returns `{}` when no membership is given.
 *
 * @example
 * ```ts
 * const can = computeCan('organization', membership, policies);
 * // can.organization.update → true
 * // can.attachment.update → 'own' (member can only update own attachments)
 * ```
 */
export const computeCan = (
  channelType: ChannelEntityType,
  membership: { channelType: ChannelEntityType; role: EntityRole } | undefined | null,
  policies: AccessPolicies,
  topology?: PermissionTopology,
): EntityCanMap => {
  if (!membership) return {};

  // Topology defaults to the app's real config; tests pass a synthetic one (wide-fixture.ts).
  const { hierarchy: h, entityActions } = resolveTopology(topology);
  const map: EntityCanMap = {};

  // Permissions for the channel entity itself
  map[channelType] = computeEntityPermissions(channelType, membership.channelType, membership.role, policies, entityActions);

  // Permissions for all descendant entity types (children + their children)
  for (const descendant of h.getOrderedDescendants(channelType) as EntityType[]) {
    map[descendant] = computeEntityPermissions(descendant, membership.channelType, membership.role, policies, entityActions);
  }

  return map;
};
