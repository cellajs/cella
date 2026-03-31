import { OpenAPIHono } from '@hono/zod-openapi';
import { count, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import { systemRolesTable } from '#/db/schema/system-roles';
import { userCountersTable } from '#/db/schema/user-counters';
import { usersTable } from '#/db/schema/users';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { sharesOrgFilter } from '#/modules/user/helpers/relatable-filter';
import { buildUsersListQuery, findUser } from '#/modules/user/user-queries';
import userRoutes from '#/modules/user/user-routes';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * Get list of users (cross-tenant).
 * Non-admin users only see users who share at least one organization.
 */
app.openapi(userRoutes.getUsers, async (ctx) => {
  const db = ctx.var.db;
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const memberships = ctx.var.memberships;

  const { q, sort, order, offset, limit, role } = ctx.req.valid('query');

  // Only see users who share at least one organization
  const myOrgIds = [...new Set(memberships.map((m) => m.organizationId))];
  if (myOrgIds.length === 0) return ctx.json({ items: [], total: 0 }, 200);

  const filters: SQL[] = [];
  if (!isSystemAdmin) filters.push(sharesOrgFilter(db, myOrgIds));
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

  const usersQuery = buildUsersListQuery(db, { filters });

  const [{ total }] = await db.select({ total: count() }).from(usersQuery.as('users'));
  const result = await usersQuery.orderBy(orderColumn).limit(limit).offset(offset);

  return ctx.json({ items: result, total }, 200);
});

/**
 * Get a user by id (cross-tenant). Pass ?slug=true to resolve by slug.
 */
app.openapi(userRoutes.getUser, async (ctx) => {
  const requestingUser = ctx.var.user;
  const db = ctx.var.db;
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const memberships = ctx.var.memberships;

  const { relatableUserId } = ctx.req.valid('param');
  const { slug: bySlug } = ctx.req.valid('query');

  const userCondition = bySlug ? eq(usersTable.slug, relatableUserId) : eq(usersTable.id, relatableUserId);

  // Check if requesting self (by id or slug) — skip relatable filter
  const isSelf = relatableUserId === requestingUser.id || (bySlug && relatableUserId === requestingUser.slug);

  // Defense in depth: verify shared org membership at query level (mirrors relatableGuard)
  const myOrgIds = [...new Set(memberships.map((m) => m.organizationId))];
  if (!isSelf && !isSystemAdmin && myOrgIds.length === 0) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });
  }

  const filters = [userCondition];
  if (!isSelf && !isSystemAdmin) filters.push(sharesOrgFilter(db, myOrgIds));

  const targetUser = await findUser(db, { filters });

  if (!targetUser)
    throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: relatableUserId } });

  return ctx.json(targetUser, 200);
});

export { userTag } from '#/modules/user/user-module';
export const userHandlers = app;
