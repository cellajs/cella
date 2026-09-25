import { type EntityRole, hierarchy } from 'shared';
import { getEdgeOrder } from 'shared/utils/display-order';
import type { UserContext } from '#/core/context';
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

/** User-only: `memberships.updatedBy` references `users`, so a service account never edits a membership (D9). */
export async function updateMembershipOp(ctx: UserContext, membershipId: string, input: UpdateMembershipInput) {
  // `memberships.updatedBy` is a user id: the type rejects `actor.id`, which could be a service account.
  const actorId = ctx.var.user.id;
  const memberships = ctx.var.memberships;

  const { role, archived, muted, displayOrder } = input;

  let orderToUpdate = displayOrder;

  const membershipToUpdate = await findMembershipByIdInOrg(ctx, { membershipId });

  if (!membershipToUpdate) {
    throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { membership: membershipId } });
  }

  // Archive, mute and order are the member's own view of the channel: nobody sets them for someone else.
  const setsPersonalView = archived !== undefined || muted !== undefined || displayOrder !== undefined;
  if (setsPersonalView && membershipToUpdate.userId !== actorId) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'user', meta: { membership: membershipId } });
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
    updatedBy: actorId,
    updatedAt: getIsoDate(),
  };
  const updatedMembership = await updateMembership(ctx, { id: membershipId, values });

  invalidateCache.user(updatedMembership.userId);

  log.info('Membership updated', { userId: updatedMembership.userId, membershipId: updatedMembership.id });

  return updatedMembership;
}
