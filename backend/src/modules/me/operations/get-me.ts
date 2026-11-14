import type { UserContext } from '#/core/context';
import { findServedUserById } from '#/modules/user/user-queries';

/** The signed-in user, whether the request has system admin access, and the session it presents. */
export async function getMeOp(ctx: UserContext) {
  const { id, expiresAt } = ctx.var.session;
  return { user: await findServedUserById(ctx, { id: ctx.var.user.id }), isSystemAdmin: ctx.var.isSystemAdmin, session: { id, expiresAt } };
}
