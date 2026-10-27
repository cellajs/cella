import type { UserContext } from '#/core/context';
import { toUserMinimalBase } from '#/modules/user/helpers/user-minimal';
import { findUserById } from '#/modules/user/user-queries';

/** The signed-in user, whether the request has system admin access, and the system admin behind an impersonation. */
export async function getMeOp(ctx: UserContext) {
  const { isSystemAdmin, impersonator } = ctx.var;
  const user = await findUserById(ctx, { id: ctx.var.user.id });

  return { user, isSystemAdmin, impersonator: impersonator ? toUserMinimalBase(impersonator) : null };
}
