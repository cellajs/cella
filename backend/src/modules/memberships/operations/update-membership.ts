import type { z } from '@hono/zod-openapi';
import { hierarchy } from 'shared';
import { getArchiveMoveOrder } from 'shared/utils/display-order';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { withActorRef } from '#/modules/actors/actor-refs';
import { membershipAsSeenBy } from '#/modules/memberships/helpers/select';
import { findMembershipByIdInOrg, updateMembership } from '#/modules/memberships/memberships-queries';
import { type membershipUpdateBodySchema, personalViewKeys } from '#/modules/memberships/memberships-schema';
import { getValidChannel } from '#/permissions';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { assertRoleGrant } from '#/permissions/role-grant';
import { log } from '#/utils/logger';

type UpdateMembershipInput = z.infer<typeof membershipUpdateBodySchema>;

/**
 * Updates a membership's role, which needs `update` on its channel and neither the new nor the old role above the
 * actor's own (`assertRoleGrant`), or the member's own archive, mute and menu order. User-only: `memberships.updatedBy`
 * references `users`, so a service account never edits a membership.
 */
export async function updateMembershipOp(ctx: UserContext, membershipId: string, input: UpdateMembershipInput) {
  const actorId = ctx.var.user.id;
  const memberships = ctx.var.memberships;

  const { role, archived, muted, displayOrder } = input;

  const setsPersonalView = personalViewKeys.some((key) => input[key] !== undefined);
  // Refused here as well as by the body schema, so the rule holds for every caller of the operation.
  if (role === undefined && !setsPersonalView) throw new AppError(400, 'invalid_request', 'warn');

  let orderToUpdate = displayOrder;

  const membershipToUpdate = await findMembershipByIdInOrg(ctx, { membershipId });

  if (!membershipToUpdate) {
    throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { membership: membershipId } });
  }

  // Archive, mute and order are the member's own view of the channel: nobody sets them for someone else.
  const isActorsMembership = membershipToUpdate.userId === actorId;
  if (setsPersonalView && !isActorsMembership) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'user', meta: { membership: membershipId } });
  }

  const updatedType = membershipToUpdate.channelType;

  if (role !== undefined && !hierarchy.getRoles(updatedType).includes(role)) {
    throw new AppError(400, 'invalid_role', 'warn', { entityType: updatedType });
  }

  // A role change is an act on the channel; a member's own view needs no more than reading it. Any other field is a
  // personal-view key, which the refusal above already held to the member's own row.
  const action = role !== undefined ? 'update' : 'read';
  const { entity } = await getValidChannel(ctx, membershipToUpdate.channelId, updatedType, action);

  // Nobody raises a member past their own role, nor changes the role of a member who outranks them.
  if (role !== undefined) {
    const subject = buildSubjectFromEntity(updatedType, entity);
    for (const handedOut of [role, membershipToUpdate.role]) assertRoleGrant(ctx, { subject, role: handedOut, action: 'update' });
  }

  if (archived !== undefined && archived !== membershipToUpdate.archived) {
    orderToUpdate = getArchiveMoveOrder(memberships, updatedType, archived);
  }

  const values = {
    ...(role !== undefined && { role }),
    ...(orderToUpdate !== undefined && { displayOrder: orderToUpdate }),
    ...(muted !== undefined && { muted }),
    ...(archived !== undefined && { archived }),
    ...updateStamps(actorId),
  };
  const updatedMembership = await updateMembership(ctx, { id: membershipId, values });
  invalidateCache.user(updatedMembership.userId);

  log.info('Membership updated', { userId: updatedMembership.userId, membershipId: updatedMembership.id });

  return withActorRef(ctx, membershipAsSeenBy(updatedMembership, actorId));
}
