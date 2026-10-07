import { type AccessContext, accessFrom } from '#/permissions/access';
import { buildSubject } from '#/permissions/build-subject';
import { checkAccessBatch } from '#/permissions/check-access';

/** Of `organizationIds`, the ones the caller may update, which is what makes them an admin there (`permissions-config`). */
export const administeredOrganizationIds = (ctx: AccessContext, organizationIds: string[]) => {
  const subjects = organizationIds.map((id) => buildSubject('organization', {}, { id }));
  const { results } = checkAccessBatch(accessFrom(ctx), 'update', subjects);
  return organizationIds.filter((id) => results.get(id)?.allowed);
};
