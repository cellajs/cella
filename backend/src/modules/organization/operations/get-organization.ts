import type { ActorContext } from '#/core/context';
import { getChannelCounts } from '#/modules/entities/entities-queries';
import { isMembershipRow, toMembershipBase } from '#/modules/memberships/helpers/select';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import { withAuditUser } from '#/modules/user/operations/with-audit-users';
import { getValidChannel } from '#/permissions';

export async function getOrganizationOp(ctx: ActorContext, id: string, opts: { bySlug?: boolean; include: string[] }) {
  const { bySlug, include } = opts;

  // The tenant comparison is getValidChannel's: an organization of another tenant reads as missing.
  const { entity, membership } = await getValidChannel(ctx, id, 'organization', 'read', bySlug);
  // Rows store organizationFlags sparse; merge config defaults under the stored bag
  const organization = withOrganizationDefaults(entity);

  const includeCounts = include.includes('counts');
  const includeMembership = include.includes('membership');

  const [counts, organizationWithAudit] = await Promise.all([
    includeCounts ? getChannelCounts(ctx, { entityType: organization.entityType, entityId: organization.id }) : undefined,
    withAuditUser(ctx, organization),
  ]);

  const included: { counts?: typeof counts; membership?: ReturnType<typeof toMembershipBase> } = {};

  if (counts) included.counts = counts;
  // A service account's grant is not a membership row; only a user's row is returned.
  if (includeMembership && membership && isMembershipRow(membership)) {
    included.membership = toMembershipBase(membership);
  }

  return { ...organizationWithAudit, included };
}
