import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { checkPermission } from '#/permissions';
import type { SubjectForPermission } from '#/permissions/permission-manager/types';
import { validateAncestorScope } from '#/permissions/validate-ancestor-scope';

/**
 * Checks if user has permission to create product or context entity.
 * This is separate from read/update/delete checks, since the entity doesn't exist yet.
 * Uses SubjectForPermission directly — id is optional for create checks.
 *
 * Enforces scope completeness: if the entity type has ancestor contexts (e.g., attachment → project → organization),
 * all ancestor context IDs must be provided. Pass `null` to explicitly signal org-level scope (no project).
 * Omitting a required ancestor (undefined) throws a 400 error — this prevents silent fallback to a broader scope.
 */
export const canCreateEntity = (ctx: AuthContext, entity: SubjectForPermission) => {
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const memberships = ctx.var.memberships;

  const { entityType } = entity;

  // Enforce that all ancestor context IDs are explicitly provided (null = intentional, undefined = missing)
  validateAncestorScope(entity);

  // Permission check (system admin bypass is handled inside)
  const { isAllowed } = checkPermission(memberships, 'create', entity, { isSystemAdmin });

  // Deny if not allowed
  if (!isAllowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType });
  }

  const org = ctx.var.organization;

  // Defense in depth check: if entity has organizationId, it must match context organization
  if (org && 'organizationId' in entity && entity.organizationId && entity.organizationId !== org.id) {
    throw new AppError(409, 'organization_mismatch', 'error', { entityType });
  }
};
