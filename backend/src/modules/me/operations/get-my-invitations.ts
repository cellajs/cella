import type { AuthContext } from '#/core/context';
import { findPendingInvitations } from '#/modules/me/me-queries';
import { withAuditUsers } from '#/modules/user/helpers/audit-user';

export async function getMyInvitationsOp(ctx: AuthContext) {
  const user = ctx.var.user;

  const rawItems = await findPendingInvitations(ctx, { userId: user.id });

  const allMemberships = rawItems.map((item) => item.inactiveMembership);
  const populatedMemberships = await withAuditUsers(ctx, allMemberships);
  const items = rawItems.map((item, i) => ({
    ...item,
    inactiveMembership: populatedMemberships[i],
  }));
  const total = items.length;

  return { items, total };
}
