import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findUsersPaginated } from '#/modules/user/user-queries';
import type { userListQuerySchema } from '#/modules/user/user-schema';
import { accessFrom } from '#/permissions/access';
import type { PageWindow } from '#/utils/list-page';

type GetUsersInput = z.infer<typeof userListQuerySchema>;

/**
 * A page of the users the caller sees (themself, and whoever holds a membership row the caller may read), or of every
 * account with a proven address for a system admin, who may also list the anonymous ones (`includeAnonymous`). Only a system admin gets each user's
 * system `role`, and only they may filter or sort by it.
 * @throws AppError 403 `forbidden` (`meta.reason: 'system_role'`) for anyone else filtering or sorting by role, or
 * asking for anonymous accounts.
 */
export async function getUsersOp(ctx: UserContext, input: GetUsersInput, { offset, limit }: PageWindow) {
  const { isSystemAdmin } = ctx.var;
  const { q, orderBy, role, includeAnonymous } = input;
  const { sort, order } = orderBy;

  // The system role is for system admins to see: a filter or sort on it would list the admins to anyone else.
  if (!isSystemAdmin && (role || sort === 'role' || includeAnonymous)) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'user', meta: { reason: 'system_role' } });
  }

  const visibleTo = isSystemAdmin ? undefined : { access: accessFrom(ctx), userId: ctx.var.user.id };
  const provenOnly = isSystemAdmin && !includeAnonymous;
  const { items, total } = await findUsersPaginated(ctx, { q, role, visibleTo, provenOnly, sort, order, limit, offset });
  return { items: isSystemAdmin ? items : items.map(({ role: _role, ...user }) => user), total };
}
