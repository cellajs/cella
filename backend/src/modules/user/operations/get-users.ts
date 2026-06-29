import type { z } from '@hono/zod-openapi';
import { eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { sharesOrgFilter } from '#/modules/user/helpers/relatable-filter';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { usersTable } from '#/modules/user/user-db';
import { buildUsersListQuery, countUsersList } from '#/modules/user/user-queries';
import type { userListQuerySchema } from '#/modules/user/user-schema';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

type GetUsersInput = z.infer<typeof userListQuerySchema>;

export async function getUsersOp(ctx: AuthContext, input: GetUsersInput) {
  const db = ctx.var.db;
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const memberships = ctx.var.memberships;

  const { q, sort, order, offset, limit, role } = input;

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

  const orderColumn = getOrderColumn(sort, usersTable.id, order, {
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    createdAt: usersTable.createdAt,
    lastSeenAt: sql`(SELECT ${userCountersTable.lastSeenAt} FROM ${userCountersTable} WHERE ${userCountersTable.userId} = ${usersTable.id})`,
    role: systemRolesTable.role,
  });

  const total = await countUsersList(ctx, { filters });
  const usersQuery = buildUsersListQuery(ctx, { filters });
  const result = await usersQuery.orderBy(orderColumn).limit(limit).offset(offset);

  return { items: result, total };
}
