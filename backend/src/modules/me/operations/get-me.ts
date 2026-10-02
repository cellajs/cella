import type { UserContext } from '#/core/context';
import { findCurrentUser } from '#/modules/me/me-queries';

export async function getMeOp(ctx: UserContext) {
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const user = await findCurrentUser(ctx);

  return { user, isSystemAdmin };
}
