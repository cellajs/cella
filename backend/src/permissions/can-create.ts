import { checkAccess, type SubjectForPermission } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { accessFrom } from '#/permissions/access';
import { assertNotArchived } from '#/permissions/archive';

/**
 * Create check for a product or channel entity, separate from read/update/delete because the row does not exist yet.
 * The subject comes from `buildSubject` or `buildSubjectFromEntity`, which refuse an omitted ancestor id, so the check
 * never falls back to a broader scope. Synchronous: the archive check reads the ids `orgGuard` put on the context.
 * @throws AppError 403 `forbidden` when the placement denies the create.
 * @throws AppError 403 `channel_archived` when the channel the new row would be homed in is archived.
 * @throws AppError 409 when the subject names another organization than the request.
 */
export const canCreateEntity = (ctx: ActorContext, subject: SubjectForPermission) => {
  const { entityType } = subject;
  const { allowed } = checkAccess(accessFrom(ctx), 'create', subject);
  if (!allowed) throw new AppError(403, 'forbidden', 'warn', { entityType });
  // After the grant check: a caller that may not create here learns nothing of the channel's state.
  assertNotArchived(ctx, 'create', subject);

  // Defense in depth: a subject scoped to an organization must name the organization of the request.
  const { organization } = ctx.var;
  const organizationId = subject.channelIds.organization;
  const namesOtherOrganization = organization && organizationId && organizationId !== organization.id;
  if (namesOtherOrganization) throw new AppError(409, 'organization_mismatch', 'error', { entityType });
};
