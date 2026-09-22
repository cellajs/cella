import { type EntityRole, hierarchy } from 'shared';
import { getEdgeOrder } from 'shared/utils/display-order';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { findMembershipByIdInOrg, updateMembership } from '#/modules/memberships/memberships-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

interface UpdateMembershipInput {
  role?: EntityRole;
  archived?: boolean;
  muted?: boolean;
  displayOrder?: number;
}

export async function updateMembershipOp(ctx: ActorContext, membershipId: string, input: UpdateMembershipInput) {
  const principalId = ctx.var.principalId;
  const memberships = ctx.var.grants;

  const { role, archived, muted, displayOrder } = input;

  let orderToUpdate = displayOrder;

  const membershipToUpdate = await findMembershipByIdInOrg(ctx, { membershipId });

  if (!membershipToUpdate) {
    throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { membership: membershipId } });
  }

  const updatedType = membershipToUpdate.channelType;

  // The new role must exist in the context's vocabulary (e.g. no org 'member' on a course)
  if (role !== undefined && !hierarchy.getRoles(updatedType).includes(role)) {
    throw new AppError(400, 'invalid_role', 'warn', { entityType: updatedType });
  }

  await getValidChannel(ctx, membershipToUpdate.channelId, updatedType, role ? 'update' : 'read');

  if (archived !== undefined && archived !== membershipToUpdate.archived) {
    const relevantOrders = memberships
      .filter((m) => m.channelType === updatedType && m.archived === archived)
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
    updatedBy: principalId,
    updatedAt: getIsoDate(),
  };
  const updatedMembership = await updateMembership(ctx, { id: membershipId, values });

  invalidateCache.user(updatedMembership.userId);

  log.info('Membership updated', { userId: updatedMembership.userId, membershipId: updatedMembership.id });

  return updatedMembership;
}
