import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { findPendingInactiveMembershipsByUser } from '#/modules/memberships/inactive-memberships-queries';

/** The user's open invitations with their channels and inviters, all in one page. */
export async function getMyInvitationsOp(ctx: UserContext) {
  const rawItems = await findPendingInactiveMembershipsByUser(ctx, { userId: ctx.var.user.id });

  const allMemberships = rawItems.map((item) => item.inactiveMembership);
  const populatedMemberships = await withActorRefs(ctx, allMemberships);
  const items = rawItems.map((item, i) => ({ ...item, inactiveMembership: populatedMemberships[i] }));
  const total = items.length;

  return { items, total };
}
