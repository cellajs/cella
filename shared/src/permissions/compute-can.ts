import { appConfig } from '../../app-config';
import { hierarchy } from '../../hierarchy-config';
import type { ContextEntityType, EntityActionType, EntityRole, EntityType } from '../../types';
import { recordFromKeys } from '../builder/utils';
import { getPolicyPermissions, getSubjectPolicies } from './access-policies';
import { allActionsDenied } from './action-helpers';
import type { AccessPolicies } from './types';

/**
 * Per-action permission state for a single entity type.
 *
 * - `true` = unconditionally allowed (policy value `1`)
 * - `false` = denied (policy value `0`)
 * - `'own'` = allowed only when the actor owns the entity (policy value `'own'`).
 *   This is an implicit "owner" relation — the frontend must compare `entity.createdBy`
 *   against the current user ID to resolve to a final boolean.
 *
 * This three-state model preserves the Zanzibar-style relation semantics at the UI layer,
 * making it straightforward to later introduce explicit relation tuples.
 */
export type ActionPermissionState = boolean | 'own';
type ActionStates = Record<EntityActionType, ActionPermissionState>;

/** Entity-type-keyed permission map: context entity + its descendant types */
export type EntityCanMap = Partial<Record<EntityType, ActionStates>>;

/**
 * Compute a single entity type's permission states from policies + membership.
 * Returns allActionsDenied when no policy is found.
 */
function computeEntityPermissions(
  entityType: ContextEntityType | EntityType,
  contextType: ContextEntityType,
  role: EntityRole,
  policies: AccessPolicies,
): ActionStates {
  const subjectPolicies = getSubjectPolicies(entityType as ContextEntityType, policies);
  const permissions = getPolicyPermissions(subjectPolicies, contextType, role);

  if (!permissions) return allActionsDenied;

  return recordFromKeys(appConfig.entityActions, (action) => {
    const value = permissions[action];
    if (value === 1) return true;
    if (value === 'own') return 'own';
    return false;
  }) as ActionStates;
}

/**
 * Computes a permission map keyed by entity type for a context entity and its descendants.
 * Used on the frontend to derive `can` from the membership baked onto a context entity.
 *
 * The map includes permissions for:
 * - The context entity itself (e.g., `organization`)
 * - All descendant entity types per the hierarchy (e.g., `attachment`)
 *
 * Actions with `'own'` permission are preserved as `'own'` in the map.
 * The frontend resolves these per-entity by checking `entity.createdBy === userId`.
 *
 * Returns empty map if no membership is provided.
 *
 * @example
 * ```ts
 * const can = computeCan('organization', membership, policies);
 * // can.organization.update → true
 * // can.attachment.update → 'own' (member can only update own attachments)
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
