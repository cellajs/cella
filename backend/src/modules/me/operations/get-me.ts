import type { UserContext } from '#/core/context';
import { findCurrentUser } from '#/modules/me/me-queries';
import { toUserMinimalBase } from '#/modules/user/helpers/audit-user';

/** The signed-in user, whether the request has system admin access, and the system admin behind an impersonation. */
export async function getMeOp(ctx: UserContext) {
  const { isSystemAdmin, impersonator } = ctx.var;
  const user = await findCurrentUser(ctx);

  // `toUserMinimalBase` keeps what it is handed, so the admin's row is cut to the minimal fields first.
  const admin = impersonator && { id: impersonator.id, name: impersonator.name, slug: impersonator.slug, thumbnailUrl: impersonator.thumbnailUrl };

  return { user, isSystemAdmin, impersonator: admin ? toUserMinimalBase(admin) : null };
}
