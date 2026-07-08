import { eq, type SQL } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { sharesOrgFilter } from '#/modules/user/helpers/relatable-filter';
import { usersTable } from '#/modules/user/user-db';
import { findUser } from '#/modules/user/user-queries';

interface GetUserOpts {
  bySlug?: boolean;
}

export async function getUserOp(ctx: AuthContext, relatableUserId: string, opts: GetUserOpts = {}) {
  const requestingUser = ctx.var.user;
  const db = ctx.var.db;
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const memberships = ctx.var.memberships;

  const { bySlug } = opts;

  const userCondition = bySlug ? eq(usersTable.slug, relatableUserId) : eq(usersTable.id, relatableUserId);

  // Skip relatable filtering when the caller requests themself by id or slug.
  const isSelf = relatableUserId === requestingUser.id || (bySlug && relatableUserId === requestingUser.slug);

  // Defense in depth: verify shared org membership at query level (mirrors relatableGuard)
  const myOrgIds = [...new Set(memberships.map((m) => m.organizationId))];
  if (!isSelf && !isSystemAdmin && myOrgIds.length === 0) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });
  }

  const filters: SQL[] = [userCondition];
  if (!isSelf && !isSystemAdmin) filters.push(sharesOrgFilter({ var: { db } }, { myOrgIds }));

  const targetUser = await findUser(ctx, { filters });

  if (!targetUser)
    throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: relatableUserId } });

  return targetUser;
}
