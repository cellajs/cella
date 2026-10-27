import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findUsersPaginated } from '#/modules/user/user-queries';
import type { userListQuerySchema } from '#/modules/user/user-schema';

type GetUsersInput = z.infer<typeof userListQuerySchema>;

/**
 * A page of the users who share an organization with the caller, or of every user for a system admin. Only a system
 * admin gets each user's system `role`, and only they may filter or sort by it.
 * @throws AppError 403 `forbidden` (`meta.reason: 'system_role'`) for anyone else filtering or sorting by role.
 */
export async function getUsersOp(ctx: UserContext, input: GetUsersInput) {
  const { isSystemAdmin, memberships } = ctx.var;
  const { q, sort, order, offset, limit, role } = input;

  // The system role is for system admins to see: a filter or sort on it would list the admins to anyone else.
  if (!isSystemAdmin && (role || sort === 'role')) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'user', meta: { reason: 'system_role' } });
  }

  // Only see users who share at least one organization; a system admin sees every user.
  const myOrgIds = [...new Set(memberships.map((membership) => membership.organizationId))];
  if (!isSystemAdmin && myOrgIds.length === 0) return { items: [], total: 0 };

  const memberOfAny = isSystemAdmin ? undefined : myOrgIds;
  const { items, total } = await findUsersPaginated(ctx, { q, role, memberOfAny, sort, order, limit, offset });
  return { items: isSystemAdmin ? items : items.map(({ role: _role, ...user }) => user), total };
}
