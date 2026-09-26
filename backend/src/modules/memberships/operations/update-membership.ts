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

  const setsPersonalView = archived !== undefined || muted !== undefined || displayOrder !== undefined;
  // With no field to change, the write would only stamp the caller on the row.
  if (role === undefined && !setsPersonalView) {
    throw new AppError(400, 'invalid_request', 'warn', { meta: { membership: membershipId, reason: 'no_fields' } });
  }

  let orderToUpdate = displayOrder;

  const membershipToUpdate = await findMembershipByIdInOrg(ctx, { membershipId });

  if (!membershipToUpdate) {
    throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { membership: membershipId } });
  }

  // Archive, mute and order are the member's own view of the channel: nobody sets them for someone else.
  const isOwnMembership = membershipToUpdate.userId === actorId;
  if (setsPersonalView && !isOwnMembership) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'user', meta: { membership: membershipId } });
  }

  const updatedType = membershipToUpdate.channelType;

  // The new role must exist in the context's vocabulary (e.g. no org 'member' on a course)
  if (role !== undefined && !hierarchy.getRoles(updatedType).includes(role)) {
    throw new AppError(400, 'invalid_role', 'warn', { entityType: updatedType });
  }

  // A role change, and any change to someone else's membership, is an act on the channel.
  const action = role !== undefined || !isOwnMembership ? 'update' : 'read';
  await getValidChannel(ctx, membershipToUpdate.channelId, updatedType, action);

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
