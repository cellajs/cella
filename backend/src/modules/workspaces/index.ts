import { type SQL, and, count, eq, ilike } from 'drizzle-orm';
import { db } from '../../db/db';
import { type MembershipModel, membershipsTable } from '../../db/schema/memberships';
import { workspacesTable } from '../../db/schema/workspaces';
import { usersTable } from '../../db/schema/users';

import { errorResponse } from '../../lib/errors';
import { getOrderColumn } from '../../lib/order-column';
import { sendSSE } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { createWorkspaceRouteConfig, getWorkspaceByIdOrSlugRouteConfig, getWorkspaceRouteConfig, getUsersByWorkspaceIdRouteConfig } from './routes';

const app = new CustomHono();

// * Workspace endpoints
const workspacesRoutes = app
  /*
   * Create workspace
   */
  .openapi(createWorkspaceRouteConfig, async (ctx) => {
    const { name, slug, organizationId } = ctx.req.valid('json');
    const user = ctx.get('user');

    const slugAvailable = await checkSlugAvailable(slug);

    if (!slugAvailable) {
      return errorResponse(ctx, 409, 'slug_exists', 'warn', 'workspace', { slug });
    }

    const [createdWorkspace] = await db
      .insert(workspacesTable)
      .values({
        name,
        slug,
      })
      .returning();

    logEvent('Workspace created', { workspace: createdWorkspace.id });

    await db
      .update(membershipsTable)
      .set({
        workspaceId: createdWorkspace.id,
      })
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.organizationId, organizationId)))
      .returning();

    logEvent('User added to workspace', {
      user: user.id,
      workspace: createdWorkspace.id,
    });

    sendSSE(user.id, 'new_workspace_membership', {
      ...createdWorkspace,
      role: 'ADMIN',
    });

    return ctx.json({
      success: true,
      data: {
        ...createdWorkspace,
        role: 'ADMIN' as const,
      },
    });
  })
  /*
   * Get an workspace
   */
  .openapi(getWorkspaceRouteConfig, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');
    const user = ctx.get('user');

    const filter: SQL | undefined = q ? ilike(workspacesTable.name, `%${q}%`) : undefined;

    const workspaceQuery = db.select().from(workspacesTable).where(filter);

    const [{ total }] = await db.select({ total: count() }).from(workspaceQuery.as('workspaces'));

    const membershipRoles = db
      .select({
        workspaceId: membershipsTable.workspaceId,
        role: membershipsTable.role,
      })
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, user.id))
      .as('membership_roles');

    const orderColumn = getOrderColumn(
      {
        id: workspacesTable.id,
        name: workspacesTable.name,
        createdAt: workspacesTable.createdAt,
        role: membershipRoles.role,
      },
      sort,
      workspacesTable.id,
      order,
    );

    const workspaces = await db
      .select({
        workspace: workspacesTable,
        role: membershipRoles.role,
      })
      .from(workspaceQuery.as('workspaces'))
      .leftJoin(membershipRoles, eq(workspacesTable.id, membershipRoles.workspaceId))
      .orderBy(orderColumn)
      .limit(Number(limit))
      .offset(Number(offset));

    return ctx.json({
      success: true,
      data: {
        items: workspaces.map(({ workspace, role }) => ({
          ...workspace,
          role,
        })),
        total,
      },
    });
  })

  /*
   * Get workspace by id or slug
   */
  .openapi(getWorkspaceByIdOrSlugRouteConfig, async (ctx) => {
    const user = ctx.get('user');
    const workspace = ctx.get('workspace');

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.workspaceId, workspace.id)));

    return ctx.json({
      success: true,
      data: {
        ...workspace,
        role: membership?.role || null,
      },
    });
  })
  /*
   * Get users by workspace id
   */
  .openapi(getUsersByWorkspaceIdRouteConfig, async (ctx) => {
    const { q, sort, order, offset, limit, role } = ctx.req.valid('query');
    const workspace = ctx.get('workspace');

    const filter: SQL | undefined = q ? ilike(usersTable.email, `%${q}%`) : undefined;

    const usersQuery = db.select().from(usersTable).where(filter).as('users');

    const membersFilters = [eq(membershipsTable.workspaceId, workspace.id)];

    if (role) membersFilters.push(eq(membershipsTable.role, role.toUpperCase() as MembershipModel['role']));

    const roles = db
      .select({
        userId: membershipsTable.userId,
        role: membershipsTable.role,
      })
      .from(membershipsTable)
      .where(and(...membersFilters))
      .as('roles');

    const membershipCount = db
      .select({
        userId: membershipsTable.userId,
        memberships: count().as('memberships'),
      })
      .from(membershipsTable)
      .groupBy(membershipsTable.userId)
      .as('membership_count');

    const orderColumn = getOrderColumn(
      {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
        lastSeenAt: usersTable.lastSeenAt,
        workspaceRole: roles.role,
      },
      sort,
      usersTable.id,
      order,
    );

    const membersQuery = db
      .select({
        user: usersTable,
        workspaceRole: roles.role,
        counts: {
          memberships: membershipCount.memberships,
        },
      })
      .from(usersQuery)
      .innerJoin(roles, eq(usersTable.id, roles.userId))
      .leftJoin(membershipCount, eq(usersTable.id, membershipCount.userId))
      .orderBy(orderColumn);

    const [{ total }] = await db.select({ total: count() }).from(membersQuery.as('memberships'));

    const result = await membersQuery.limit(Number(limit)).offset(Number(offset));

    const members = await Promise.all(
      result.map(async ({ user, workspaceRole, counts }) => ({
        ...user,
        sessions: [],
        workspaceRole,
        counts,
      })),
    );

    return ctx.json({
      success: true,
      data: {
        items: members,
        total,
      },
    });
  });

export default workspacesRoutes;

export type WorkspacesRoutes = typeof workspacesRoutes;
