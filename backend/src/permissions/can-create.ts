import type { SubjectForPermission } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { validateAncestorScope } from '#/permissions/validate-ancestor-scope';

/**
 * Create check for a product or channel entity, separate from read/update/delete because the row
 * does not exist yet. Every ancestor channel ID must be present: `null` states org-level scope,
 * while an omitted (undefined) ancestor throws 400 so it cannot fall back to a broader scope.
 */
export const canCreateEntity = (ctx: AuthContext, entity: SubjectForPermission) => {
  const { entityType } = entity;

  validateAncestorScope(entity);

  // Permission check (system admin bypass is handled inside)
  const { allowed } = checkAccess(accessFrom(ctx), 'create', entity);

  if (!allowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType });
  }

  const org = ctx.var.organization;

  // Defense in depth check: if entity has an organization scope, it must match the subject's organization
  const organizationId = entity.channelIds.organization;
  if (org && organizationId && organizationId !== org.id) {
    throw new AppError(409, 'organization_mismatch', 'error', { entityType });
  }
};
