import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { getChannelCounts } from '#/modules/entities/entities-queries';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { withOrganizationFlagDefaults } from '#/modules/organization/helpers/select';
import { updateOrganization } from '#/modules/organization/organization-queries';
import { organizationContract } from '#/modules/organization/organization-schema';
import { withAuditUser } from '#/modules/user/helpers/audit-user';
import { getValidChannel } from '#/permissions';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { assertBlockMediaUrls } from '#/utils/validate-block-urls';

export async function updateOrganizationOp(
  ctx: AuthContext,
  id: string,
  tenantId: string,
  rawInput: Record<string, unknown>,
) {
  // Lens seam: normalize old-shape field names to their current names before any body access
  const input = organizationContract.normalizeBody(rawInput);
  const user = ctx.var.user;

  const { entity: organization, membership } = await getValidChannel(ctx, id, 'organization', 'update');

  // Validate organization belongs to the specified tenant, in org itself we do not have orgGuard
  if (organization.tenantId !== tenantId) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization', meta: { reason: 'Tenant mismatch' } });
  }

  const slug = input.slug as string | undefined;

  if (slug && slug !== organization.slug) {
    const slugAvailable = await checkSlugAvailable(ctx, slug, 'organization');
    if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'organization', meta: { slug } });
  }

  // Validate media URLs in welcomeText are from trusted sources (CDN only)
  if (input.welcomeText) assertBlockMediaUrls(input.welcomeText as string, 'organization', 'welcomeText');

  const values = { ...input, updatedAt: getIsoDate(), updatedBy: user.id };
  const updatedRecord = await updateOrganization(ctx, { id: organization.id, values });
  // Rows store organizationFlags sparse; merge config defaults under the stored bag
  const updatedOrganizationRecord = withOrganizationFlagDefaults(updatedRecord);

  invalidateCache.org(tenantId, organization.id);

  log.info('Organization updated', { organizationId: updatedOrganizationRecord.id });

  const counts = await getChannelCounts(ctx, organization.entityType, organization.id);

  const included = {
    ...(membership && { membership: toMembershipBase(membership) }),
    counts,
  };

  const organizationWithAudit = await withAuditUser(ctx, updatedOrganizationRecord, user);

  return { ...organizationWithAudit, included };
}
