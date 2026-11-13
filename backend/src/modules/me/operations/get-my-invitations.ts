import type { UserContext } from '#/core/context';
import { withCreatorRefs } from '#/modules/actors/actor-refs';
import { findPendingInvitationsByUser } from '#/modules/memberships/invitations-queries';

/** The user's open invitations with their channels and inviters. */
export async function getMyInvitationsOp(ctx: UserContext) {
  const rawItems = await findPendingInvitationsByUser(ctx, { userId: ctx.var.user.id });

  const invitations = new Map(
    (
      await withCreatorRefs(
        ctx,
        rawItems.map((item) => item.invitation),
      )
    ).map((row) => [row.id, row]),
  );
  const items = rawItems.flatMap((item) => {
    const invitation = invitations.get(item.invitation.id);
    return invitation ? [{ ...item, invitation }] : [];
  });

  return items;
}
