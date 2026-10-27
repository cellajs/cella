import type { SubjectForPermission } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { validateAncestorScope } from '#/permissions/build-subject';

/**
 * Create check for a product or channel entity, separate from read/update/delete because the row
 * does not exist yet. Every ancestor channel ID must be present: `null` states org-level scope,
 * while an omitted (undefined) ancestor throws 400 so it cannot fall back to a broader scope.
 */
export const canCreateEntity = (ctx: ActorContext, subject: SubjectForPermission) => {
  const { entityType } = subject;

  validateAncestorScope(subject);

  const { allowed } = checkAccess(accessFrom(ctx), 'create', subject);

  if (!allowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType });
  }

  const organization = ctx.var.organization;

  // Defense in depth: a subject scoped to an organization must name the organization of the request.
  const organizationId = subject.channelIds.organization;
  if (organization && organizationId && organizationId !== organization.id) {
    throw new AppError(409, 'organization_mismatch', 'error', { entityType });
  }
};
