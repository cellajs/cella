import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { findPendingInvitationsByUser } from '#/modules/memberships/invitations-queries';

/** The user's open invitations with their channels and inviters; one whose inviter no longer resolves is left out. */
export async function getMyInvitationsOp(ctx: UserContext) {
  const rawItems = await findPendingInvitationsByUser(ctx, { userId: ctx.var.user.id });
  const invitations = await withActorRefs(
    ctx,
    rawItems.map((item) => item.invitation),
  );

  return rawItems.flatMap((item, index) => {
    const { createdBy, ...invitation } = invitations[index];
    return createdBy ? [{ ...item, invitation: { ...invitation, createdBy } }] : [];
  });
}
