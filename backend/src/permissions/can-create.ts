import type { Context } from 'hono';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { checkPermission } from '#/permissions';
import type { SubjectForPermission } from '#/permissions/permission-manager/types';

/**
 * Checks if user has permission to create product or context entity.
 * This is separate from read/update/delete checks, since the entity doesn't exist yet.
 * Uses SubjectForPermission directly — id is optional for create checks.
 */
export const canCreateEntity = (ctx: Context<Env>, entity: SubjectForPermission) => {
  const userSystemRole = ctx.var.userSystemRole;
  const memberships = ctx.var.memberships;

  const { entityType } = entity;

  // Step 1: Permission check (system admin bypass is handled inside)
  const { isAllowed } = checkPermission(memberships, 'create', entity, { systemRole: userSystemRole });

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
