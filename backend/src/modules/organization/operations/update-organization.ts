import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { dispatchMutation } from '#/lib/mutation-bus';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { getChannelCounts } from '#/modules/entities/entities-queries';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';
import { isMembershipRow, toMembershipBase } from '#/modules/memberships/helpers/select';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import { updateOrganization } from '#/modules/organization/organization-queries';
import { organizationContract } from '#/modules/organization/organization-schema';
import { withAuditUser } from '#/modules/user/helpers/audit-user';
import { getValidChannel } from '#/permissions';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { assertBlockMediaUrls } from '#/utils/validate-block-urls';

export async function updateOrganizationOp(
  ctx: ActorContext,
  id: string,
  tenantId: string,
  rawInput: Record<string, unknown>,
) {
  // Normalize old-shape field names to their current names before any body access
  const input = organizationContract.normalizeBody(rawInput);
  const actorId = ctx.var.actor.id;

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

  // Media in the welcome text may reference only this organization's uploads.
  if (input.welcomeText) {
    assertBlockMediaUrls(input.welcomeText as string, organization.id, 'organization', 'welcomeText');
  }

  const values = { ...input, updatedAt: getIsoDate(), updatedBy: actorId };
  const updatedRecord = await updateOrganization(ctx, { id: organization.id, values });
  // Rows store organizationFlags/setupConfig sparse; merge config defaults under the stored bag
  const updatedOrganizationRecord = withOrganizationDefaults(updatedRecord);

  await dispatchMutation(ctx, 'organization.updated', {
    before: [withOrganizationDefaults(organization)],
    after: [updatedOrganizationRecord],
  });

  invalidateCache.org(tenantId, organization.id);

  log.info('Organization updated', { organizationId: updatedOrganizationRecord.id });

  const counts = await getChannelCounts(ctx, {
    entityType: organization.entityType,
    entityId: organization.id,
  });

  const included = {
    // A service account's grant is not a membership row; only a user's row is returned.
    ...(membership && isMembershipRow(membership) && { membership: toMembershipBase(membership) }),
    counts,
  };

  const organizationWithAudit = await withAuditUser(ctx, updatedOrganizationRecord);

  return { ...organizationWithAudit, included };
}
