import type { EntityRole } from 'shared';
import { getEdgeOrder } from 'shared/utils/display-order';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { findMembershipByIdInOrg, updateMembership } from '#/modules/memberships/memberships-queries';
import { getValidContextEntity } from '#/permissions/get-context-entity';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

interface UpdateMembershipInput {
  role?: EntityRole;
  archived?: boolean;
  muted?: boolean;
  displayOrder?: number;
}

export async function updateMembershipOp(ctx: AuthContext, membershipId: string, input: UpdateMembershipInput) {
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;

  const { role, archived, muted, displayOrder } = input;

  let orderToUpdate = displayOrder;

  const membershipToUpdate = await findMembershipByIdInOrg(ctx, { membershipId });

  if (!membershipToUpdate) {
    throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { membership: membershipId } });
  }

  const updatedType = membershipToUpdate.contextType;

  await getValidContextEntity(ctx, membershipToUpdate.contextId, updatedType, role ? 'update' : 'read');

  if (archived !== undefined && archived !== membershipToUpdate.archived) {
    const relevantOrders = memberships
      .filter((m) => m.contextType === updatedType && m.archived === archived)
      // Use ceil so a fractional displayOrder doesn't squeeze a future insert.
      .map((m) => Math.ceil(m.displayOrder));

    // Push to the visual bottom of the destination bucket (ascending list).
    orderToUpdate = getEdgeOrder(relevantOrders, 'bottom', true);
  }

  const values = {
    ...(role !== undefined && { role }),
    ...(orderToUpdate !== undefined && { displayOrder: orderToUpdate }),
    ...(muted !== undefined && { muted }),
    ...(archived !== undefined && { archived }),
    updatedBy: user.id,
    updatedAt: getIsoDate(),
  };
  const updatedMembership = await updateMembership(ctx, { id: membershipId, values });

  invalidateCache.user(updatedMembership.userId);

  log.info('Membership updated', { userId: updatedMembership.userId, membershipId: updatedMembership.id });

  return updatedMembership;
}
