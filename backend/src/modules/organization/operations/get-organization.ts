import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { getEntityCounts } from '#/modules/entities/entities-queries';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { withAuditUser } from '#/modules/user/helpers/audit-user';
import { getValidChannelEntity } from '#/permissions';

export async function getOrganizationOp(
  ctx: AuthContext,
  id: string,
  tenantId: string,
  opts: { bySlug?: boolean; include: string[] },
) {
  const user = ctx.var.user;
  const { bySlug, include } = opts;

  const { entity: organization, membership } = await getValidChannelEntity(ctx, id, 'organization', 'read', bySlug);

  // Validate organization belongs to the specified tenant, in org itself we do not have orgGuard
  if (organization.tenantId !== tenantId) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization', meta: { reason: 'Tenant mismatch' } });
  }

  // Determine what to include (default: nothing)
  const includeCounts = include.includes('counts');
  const includeMembership = include.includes('membership');

  const [counts, organizationWithAudit] = await Promise.all([
    includeCounts ? getEntityCounts(ctx, organization.entityType, organization.id) : undefined,
    withAuditUser(ctx, organization, user),
  ]);

  const included: { counts?: typeof counts; membership?: ReturnType<typeof toMembershipBase> } = {};

  if (counts) included.counts = counts;
  if (includeMembership && membership) included.membership = toMembershipBase(membership);

  return { ...organizationWithAudit, included };
}
