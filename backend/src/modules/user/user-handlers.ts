import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import { systemRolesTable } from '#/db/schema/system-roles';
import { userActivityTable } from '#/db/schema/user-activity';
import { usersTable } from '#/db/schema/users';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { sharesOrgFilter } from '#/modules/user/helpers/relatable-filter';
import { memberSelect } from '#/modules/user/helpers/select';
import userRoutes from '#/modules/user/user-routes';
import { defaultHook } from '#/utils/default-hook';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const userRouteHandlers = app
  /**
   * Get list of users (cross-tenant).
   * Non-admin users only see users who share at least one organization.
   */
  .openapi(userRoutes.getUsers, async (ctx) => {
    const { q, sort, order, offset, limit, role } = ctx.req.valid('query');

    const db = ctx.var.db;
    const isSystemAdmin = ctx.var.isSystemAdmin;
    const memberships = ctx.var.memberships;

    // Only see users who share at least one organization
    const myOrgIds = [...new Set(memberships.map((m) => m.organizationId))];
    if (myOrgIds.length === 0) return ctx.json({ items: [], total: 0 }, 200);

    const filters = [];
    if (!isSystemAdmin) filters.push(sharesOrgFilter(db, myOrgIds));
    if (role) filters.push(eq(systemRolesTable.role, role));
    if (q) {
      filters.push(
        or(
          ilike(usersTable.name, prepareStringForILikeFilter(q)),
          ilike(usersTable.email, prepareStringForILikeFilter(q)),
        ),
      );
    }

    const orderColumn = getOrderColumn(sort, usersTable.id, order, {
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      createdAt: usersTable.createdAt,
      lastSeenAt: sql`(SELECT ${userActivityTable.lastSeenAt} FROM ${userActivityTable} WHERE ${userActivityTable.userId} = ${usersTable.id})`,
      role: systemRolesTable.role,
    });

    const usersQuerySelect = { ...memberSelect, role: systemRolesTable.role };

    const usersQuery = db
      .select(usersQuerySelect)
      .from(usersTable)
      .leftJoin(systemRolesTable, eq(usersTable.id, systemRolesTable.userId))
      .where(and(...filters))
      .orderBy(orderColumn);

    const [{ total }] = await db.select({ total: count() }).from(usersQuery.as('users'));
    const result = await usersQuery.limit(limit).offset(offset);

    return ctx.json({ items: result, total }, 200);
  })
  /**
   * Get a user by id (cross-tenant). Pass ?slug=true to resolve by slug.
   */
  .openapi(userRoutes.getUser, async (ctx) => {
    const { relatableUserId } = ctx.req.valid('param');
    const { slug: bySlug } = ctx.req.valid('query');
    const requestingUser = ctx.var.user;
    const db = ctx.var.db;

    const userCondition = bySlug ? eq(usersTable.slug, relatableUserId) : eq(usersTable.id, relatableUserId);

    // Check if requesting self (by id or slug) — skip relatable filter
    const isSelf = relatableUserId === requestingUser.id || (bySlug && relatableUserId === requestingUser.slug);

    // Defense in depth: verify shared org membership at query level (mirrors relatableGuard)
    const isSystemAdmin = ctx.var.isSystemAdmin;
    const memberships = ctx.var.memberships;
    const myOrgIds = [...new Set(memberships.map((m) => m.organizationId))];
    if (!isSelf && !isSystemAdmin && myOrgIds.length === 0) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });
    }

    const filters = [userCondition];
    if (!isSelf && !isSystemAdmin) filters.push(sharesOrgFilter(db, myOrgIds));

    // Use memberSelect for all lookups (omits newsletter, userFlags)
    const [targetUser] = await db
      .select(memberSelect)
      .from(usersTable)
      .where(and(...filters))
      .limit(1);

    if (!targetUser)
      throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: relatableUserId } });

    return ctx.json(targetUser, 200);
  });

export default userRouteHandlers;
