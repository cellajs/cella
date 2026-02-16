import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import { lastSeenTable } from '#/db/schema/last-seen';
import { systemRolesTable } from '#/db/schema/system-roles';
import { usersTable } from '#/db/schema/users';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { userSelect } from '#/modules/user/helpers/select';
import userRoutes from '#/modules/user/user-routes';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const userRouteHandlers = app
  /**
   * Get list of users (cross-tenant).
   * Users table has no RLS — all authenticated users can list users.
   * No memberships join; memberships are fetched separately when needed.
   */
  .openapi(userRoutes.getUsers, async (ctx) => {
    const { q, sort, order, offset, limit, role } = ctx.req.valid('query');

    const db = ctx.var.db;

    const filters = [
      ...(role ? [eq(systemRolesTable.role, role)] : []),
      ...(q
        ? [
            or(
              ilike(usersTable.name, prepareStringForILikeFilter(q)),
              ilike(usersTable.email, prepareStringForILikeFilter(q)),
            ),
          ]
        : []),
    ];

    const orderColumn = getOrderColumn(sort, usersTable.id, order, {
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      createdAt: usersTable.createdAt,
      lastSeenAt: sql`(SELECT ${lastSeenTable.lastSeenAt} FROM ${lastSeenTable} WHERE ${lastSeenTable.userId} = ${usersTable.id})`,
      role: systemRolesTable.role,
    });

    const usersQuerySelect = { ...userSelect, role: systemRolesTable.role };

    const usersQuery = db
      .select(usersQuerySelect)
      .from(usersTable)
      .leftJoin(systemRolesTable, eq(usersTable.id, systemRolesTable.userId))
      .where(and(...filters))
      .orderBy(orderColumn);

    const [{ total }] = await db.select({ total: count() }).from(usersQuery.as('users'));
    const users = await usersQuery.limit(limit).offset(offset);

    return ctx.json({ items: users, total }, 200);
  })
  /**
   * Get a user by id (cross-tenant). Pass ?slug=true to resolve by slug.
   */
  .openapi(userRoutes.getUser, async (ctx) => {
    const { userId } = ctx.req.valid('param');
    const { slug: bySlug } = ctx.req.valid('query');
    const requestingUser = ctx.var.user;
    const db = ctx.var.db;

    // Check if requesting self (by id or slug)
    if (userId === requestingUser.id || (bySlug && userId === requestingUser.slug)) {
      const [self] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, requestingUser.id)).limit(1);
      return ctx.json(self, 200);
    }

    // Resolve user by ID or slug (users table has no RLS)
    const userCondition = bySlug ? eq(usersTable.slug, userId) : eq(usersTable.id, userId);
    const [targetUser] = await db.select(userSelect).from(usersTable).where(userCondition).limit(1);

    if (!targetUser) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: userId } });

    return ctx.json(targetUser, 200);
  });

export default userRouteHandlers;
