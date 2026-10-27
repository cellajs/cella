import type { ActorBinding, DbContext } from '#/core/context';
import { withActorRef } from '#/modules/actors/actor-refs';
import { getChannelCounts } from '#/modules/entities/entities-queries';
import { isMembershipRow, toMembershipBase } from '#/modules/memberships/helpers/select';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import type { OrganizationModel } from '#/modules/organization/organization-db';

/**
 * An organization as it reads on the wire: config defaults under its sparse flags and setup config, its writers as
 * references, and in `included` its counts and the caller's membership when asked for.
 * @param grant - The caller's grant on the organization. A service account's grant is not a membership row, so only a
 * user's row is returned.
 */
export async function toOrganizationResponse(
  ctx: DbContext,
  organization: OrganizationModel,
  grant: ActorBinding | null,
  include: { counts: boolean; membership: boolean },
) {
  const [counts, organizationWithAudit] = await Promise.all([
    include.counts ? getChannelCounts(ctx, { entityType: 'organization', entityId: organization.id }) : undefined,
    withActorRef(ctx, withOrganizationDefaults(organization)),
  ]);
  const membership = include.membership && grant && isMembershipRow(grant) ? toMembershipBase(grant) : undefined;
  return { ...organizationWithAudit, included: { ...(membership && { membership }), ...(counts && { counts }) } };
}
