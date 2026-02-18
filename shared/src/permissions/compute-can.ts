import { appConfig } from '../../app-config';
import { hierarchy } from '../../hierarchy-config';
import type { ContextEntityType, EntityActionType, EntityRole, EntityType } from '../../types';
import { recordFromKeys } from '../builder/utils';
import { getPolicyPermissions, getSubjectPolicies } from './access-policies';
import { allActionsDenied } from './action-helpers';
import type { AccessPolicies } from './types';

/** Boolean permission record for a single entity type */
type ActionBooleans = Record<EntityActionType, boolean>;

/** Entity-type-keyed permission map: context entity + its descendant types */
export type EntityCanMap = Partial<Record<EntityType, ActionBooleans>>;

/**
 * Compute a single entity type's boolean permission record from policies + membership.
 * Returns allActionsDenied when no policy is found.
 */
function computeEntityPermissions(
  entityType: ContextEntityType | EntityType,
  contextType: ContextEntityType,
  role: EntityRole,
  policies: AccessPolicies,
): ActionBooleans {
  const subjectPolicies = getSubjectPolicies(entityType as ContextEntityType, policies);
  const permissions = getPolicyPermissions(subjectPolicies, contextType, role);

  if (!permissions) return allActionsDenied;

  return recordFromKeys(appConfig.entityActions, (action) => permissions[action] === 1) as ActionBooleans;
}

/**
 * Computes a permission map keyed by entity type for a context entity and its descendants.
 * Used on the frontend to derive `can` from the membership baked onto a context entity.
 *
 * The map includes permissions for:
 * - The context entity itself (e.g., `organization`)
 * - All descendant entity types per the hierarchy (e.g., `attachment`)
 *
 * Returns empty map if no membership is provided.
 *
 * @example
 * ```ts
 * const can = computeCan('organization', membership, policies);
 * // can.organization.update → true
 * // can.attachment.create → true
 * ```
 */
export const computeCan = (
  contextType: ContextEntityType,
  membership: { contextType: ContextEntityType; role: EntityRole } | undefined | null,
  policies: AccessPolicies,
): EntityCanMap => {
  if (!membership) return {};

  const map: EntityCanMap = {};

  // Permissions for the context entity itself
  map[contextType] = computeEntityPermissions(contextType, membership.contextType, membership.role, policies);

  // Permissions for all descendant entity types (children + their children)
  for (const descendant of hierarchy.getOrderedDescendants(contextType)) {
    map[descendant] = computeEntityPermissions(descendant, membership.contextType, membership.role, policies);
  }

  return map;
};
