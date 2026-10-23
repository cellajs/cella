import type { UserContext } from '#/core/context';
import { findCurrentUser } from '#/modules/me/me-queries';
import { toUserMinimalBase } from '#/modules/user/helpers/user-minimal';

/** The signed-in user, whether the request has system admin access, and the system admin behind an impersonation. */
export async function getMeOp(ctx: UserContext) {
  const { isSystemAdmin, impersonator } = ctx.var;
  const user = await findCurrentUser(ctx);

  return { user, isSystemAdmin, impersonator: impersonator ? toUserMinimalBase(impersonator) : null };
}
