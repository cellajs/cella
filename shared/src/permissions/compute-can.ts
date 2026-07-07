import { appConfig } from '../config-builder/app-config';
import { hierarchy } from '../../config/hierarchy-config';
import type { ContextEntityType, EntityActionType, EntityRole, EntityType } from '../../types';
import { recordFromKeys } from '../config-builder/utils';
import { getPolicyPermissions, getSubjectPolicies } from './access-policies';
import { allActionsDenied } from './action-helpers';
import { isRowCondition } from './row-conditions';
import type { AccessPolicies, ActionPermissionState } from './types';

/**
 * Per-action permission state for a single entity type.
 *
 * - `true` = unconditionally allowed (policy value `1`)
 * - `false` = denied (policy value `0`)
 * - condition name (e.g. `'own'`) = allowed only for rows satisfying that row condition.
 *   The frontend resolves it per row: `resolvePermission` handles the built-in `'own'`
 *   (compare `entity.createdBy` against the current user ID); custom conditions resolve
 *   via their check-form.
 *
 * Keeping the state three-valued preserves row-condition semantics at the UI layer.
 */
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
    // Row-conditional grant → surface the condition name (e.g. 'own'); the frontend
    // resolves it per row via resolvePermission / the condition's check-form.
    if (isRowCondition(value)) return value.name;
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
