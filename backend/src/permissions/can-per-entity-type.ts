import type { EntityActionType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { checkPermission } from '#/permissions';
import type { SubjectForPermission } from '#/permissions/permission-manager/types';
import { validateAncestorScope } from '#/permissions/validate-ancestor-scope';

/**
 * Checks if user has permission to perform a collection-level action on an entity type.
 * Use for list/collection endpoints where no specific entity exists yet (e.g., getAttachments).
 *
 * Enforces scope completeness: if the entity type has ancestor contexts (e.g., attachment → project → organization),
 * all ancestor context IDs must be provided. Pass `null` to explicitly signal org-level scope (no project).
 * Omitting a required ancestor (undefined) throws a 400 error — this prevents silent fallback to a broader scope.
 *
 * For single-entity checks, use `getValidProductEntity` or `getValidContextEntity` instead.
 * For create checks, use `canCreateEntity`.
 *
 * @param action - The action to check (e.g., `"read"`)
 * @param entity - Subject with entityType and context IDs (e.g., `{ entityType: 'attachment', organizationId, projectId }`)
 * @throws AppError 400 if required ancestor context IDs are missing (undefined)
 * @throws AppError 403 if user lacks permission
 */
export const canPerEntityType = (
  ctx: AuthContext,
  action: Exclude<EntityActionType, 'create'>,
  entity: SubjectForPermission,
) => {
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const memberships = ctx.var.memberships;

  const { entityType } = entity;

  // Enforce that all ancestor context IDs are explicitly provided (null = intentional, undefined = missing)
  validateAncestorScope(entity);

  const { isAllowed } = checkPermission(memberships, action, entity, { isSystemAdmin });

  if (!isAllowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });
  }
};
