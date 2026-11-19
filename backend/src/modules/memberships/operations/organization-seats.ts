import type { DbContext } from '#/core/context';
import { countInvitationSeats } from '#/modules/memberships/invitations-queries';
import { countMembershipsByChannel } from '#/modules/memberships/memberships-queries';
import { lockTenantQuota } from '#/modules/tenants/quota-lock';

interface CountTakenSeatsOpts {
  organizationId: string;
  /** Addresses the caller charges a seat for itself; their invitations are not counted again. */
  exceptEmails?: string[];
}

/** The seats of the tenant's member limit an organization holds: its members and the seats its invitations hold. */
export const countTakenSeats = async (ctx: DbContext, { organizationId, exceptEmails }: CountTakenSeatsOpts) => {
  const members = await countMembershipsByChannel(ctx, { channelType: 'organization', channelId: organizationId });
  return members + (await countInvitationSeats(ctx, { organizationId, exceptEmails }));
};

interface HasFreeSeatsOpts extends CountTakenSeatsOpts {
  tenantId: string;
  /** The tenant's member limit (`restrictions.quotas.user`); 0 for none. */
  quota: number;
  /** The seats the caller takes; one when left out. */
  seats?: number;
}

/**
 * Whether the organization has `seats` free seats, under the tenant's lock on its member limit until the caller's
 * transaction ends: a launch, an import and an invitation that each take the last seat run one after the other, and
 * the second finds none.
 */
export const hasFreeSeats = async (txCtx: DbContext, { tenantId, quota, seats = 1, ...taken }: HasFreeSeatsOpts) => {
  if (quota === 0 || seats === 0) return true;
  await lockTenantQuota(txCtx, { tenantId, key: 'user' });
  return (await countTakenSeats(txCtx, taken)) + seats <= quota;
};
