import type { z } from '@hono/zod-openapi';
import { eq, ilike, or, type SQL } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { sharesOrgFilter } from '#/modules/user/helpers/relatable-filter';
import { usersTable } from '#/modules/user/user-db';
import { findUsersPaginated } from '#/modules/user/user-queries';
import type { userListQuerySchema } from '#/modules/user/user-schema';
import { prepareStringForILikeFilter } from '#/utils/sql';

type GetUsersInput = z.infer<typeof userListQuerySchema>;

export async function getUsersOp(ctx: UserContext, input: GetUsersInput) {
  const db = ctx.var.db;
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const memberships = ctx.var.memberships;

  const { q, sort, order, offset, limit, role } = input;

  // The system role is for system admins to see: a filter or sort on it would list the admins to anyone else.
  if (!isSystemAdmin && (role || sort === 'role')) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'user', meta: { reason: 'system_role' } });
  }

  // Only see users who share at least one organization
  const myOrgIds = [...new Set(memberships.map((m) => m.organizationId))];
  if (myOrgIds.length === 0) return { items: [], total: 0 };

  const filters: SQL[] = [];
  if (!isSystemAdmin) filters.push(sharesOrgFilter({ var: { db } }, { myOrgIds }));
  if (role) filters.push(eq(systemRolesTable.role, role));
  if (q) {
    filters.push(
      or(
        ilike(usersTable.name, prepareStringForILikeFilter(q)),
        ilike(usersTable.email, prepareStringForILikeFilter(q)),
      )!,
    );
  }

  const { items, total } = await findUsersPaginated(ctx, { filters, sort, order, limit, offset });
  return { items: isSystemAdmin ? items : items.map(({ role: _role, ...user }) => user), total };
}
