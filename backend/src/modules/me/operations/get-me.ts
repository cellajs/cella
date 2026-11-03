import type { UserContext } from '#/core/context';
import { findUserById } from '#/modules/user/user-queries';

/** The signed-in user and whether the request has system admin access. */
export async function getMeOp(ctx: UserContext) {
  const user = await findUserById(ctx, { id: ctx.var.user.id });
  return { user, isSystemAdmin: ctx.var.isSystemAdmin };
}
