import type { UserContext } from '#/core/context';
import { findServedUserById } from '#/modules/user/user-queries';

/** The signed-in user and whether the request has system admin access. */
export async function getMeOp(ctx: UserContext) {
  return { user: await findServedUserById(ctx, { id: ctx.var.user.id }), isSystemAdmin: ctx.var.isSystemAdmin };
}
