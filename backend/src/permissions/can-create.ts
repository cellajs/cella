import { checkAccess, type SubjectForPermission } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { accessFrom } from '#/permissions/access';

/**
 * Create check for a product or channel entity, separate from read/update/delete because the row does not exist yet.
 * The subject comes from `buildSubject` or `buildSubjectFromEntity`, which refuse an omitted ancestor id, so the check
 * never falls back to a broader scope.
 * @throws AppError 403 when the placement denies the create, 409 when the subject names another organization than the request.
 */
export const canCreateEntity = (ctx: ActorContext, subject: SubjectForPermission) => {
  const { entityType } = subject;

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
