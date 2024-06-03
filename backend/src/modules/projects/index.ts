import { type SQL, and, count, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { projectsTable } from '../../db/schema/projects';
import { workspacesTable } from '../../db/schema/workspaces';
import { projectsToWorkspacesTable } from '../../db/schema/projects-to-workspaces';

import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { getOrderColumn } from '../../lib/order-column';
import { sendSSE } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import {
  createProjectRouteConfig,
  deleteProjectsRouteConfig,
  getProjectByIdOrSlugRouteConfig,
  getProjectsRouteConfig,
  getUserProjectsRouteConfig,
  getUsersByProjectIdRouteConfig,
  updateProjectRouteConfig,
} from './routes';
import { usersTable } from '../../db/schema/users';
import permissionManager from '../../lib/permission-manager';

const app = new CustomHono();

// * Project endpoints
const projectsRoutes = app
  /*
   * Create project
   */
  .openapi(createProjectRouteConfig, async (ctx) => {
    const { name, slug, color, workspace } = ctx.req.valid('json');
    const user = ctx.get('user');
    const memberships = ctx.get('memberships');
    const { organizationId } = ctx.get('project');

    const slugAvailable = await checkSlugAvailable(slug);

    if (!slugAvailable) {
      return errorResponse(ctx, 409, 'slug_exists', 'warn', 'PROJECT', { slug });
    }

    if (workspace && !permissionManager.isPermissionAllowed(memberships, 'update', { type: 'WORKSPACE', id: workspace, organizationId })) {
      return errorResponse(ctx, 403, 'forbidden', 'warn', 'PROJECT', { user: user.id, id: workspace });
    }

    const [createdProject] = await db
      .insert(projectsTable)
      .values({
        organizationId,
        name,
        slug,
        color,
        createdBy: user.id,
      })
      .returning();

    logEvent('Project created', { project: createdProject.id });    

    await db.insert(membershipsTable).values({
      userId: user.id,
      organizationId,
      projectId: createdProject.id,
      type: 'PROJECT',
      role: 'ADMIN',
    });

    logEvent('User added to project', {
      user: user.id,
      project: createdProject.id,
    });

    if (workspace) {
      await db.insert(projectsToWorkspacesTable).values({
        projectId: createdProject.id,
        workspaceId: workspace,
      })

      logEvent('Project added to workspace', {
        project: createdProject.id,
        workspace,
      });
    }
    

    sendSSE(user.id, 'new_project_membership', {
      ...createdProject,
      type: 'PROJECT',
    });

    return ctx.json(
      {
        success: true,
        data: {
          ...createdProject,
          role: 'ADMIN' as const,
        },
      },
      200,
    );
  })

  /*
   * Get project by id or slug
   */
  .openapi(getProjectByIdOrSlugRouteConfig, async (ctx) => {
    const user = ctx.get('user');
    const project = ctx.get('project');

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.projectId, project.id)));

    return ctx.json(
      {
        success: true,
        data: {
          ...project,
          role: membership?.role || null,
        },
      },
      200,
    );
  })
  /*
   * Get list of projects
   */
  .openapi(getProjectsRouteConfig, async (ctx) => {
    const { q, sort, order, offset, limit, workspace } = ctx.req.valid('query');
    const user = ctx.get('user');

    const membershipsFilters = [eq(membershipsTable.userId, user.id)];

    const filter: SQL | undefined = q ? ilike(projectsTable.name, `%${q}%`) : undefined;
    const projectsFilters = [filter];

    const projectsQuery = db
      .select()
      .from(projectsTable)
      .where(and(...projectsFilters));

    const counts = db
      .select({
        projectId: membershipsTable.projectId,
        admins: count(sql`CASE WHEN ${membershipsTable.role} = 'ADMIN' THEN 1 ELSE NULL END`).as('admins'),
        members: count().as('members'),
      })
      .from(membershipsTable)
      .groupBy(membershipsTable.projectId)
      .as('counts');

    const membership = db
      .select({
        projectId: membershipsTable.projectId,
        role: membershipsTable.role,
        archived: membershipsTable.inactive,
      })
      .from(membershipsTable)
      .where(and(...membershipsFilters))
      .as('membership_roles');

    const orderColumn = getOrderColumn(
      {
        id: projectsTable.id,
        name: projectsTable.name,
        createdAt: projectsTable.createdAt,
        userRole: membership.role,
      },
      sort,
      projectsTable.id,
      order,
    );

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    let projects: Array<any>;
    let total = 0;

    if (!workspace) {
      const [{ total: matches }] = await db.select({ total: count() }).from(projectsQuery.as('projects'));
      total = matches;
      projects = await db
      .select({
        project: projectsTable,
        role: membership.role,
        archived: membership.archived,
        admins: counts.admins,
        members: counts.members,
      })
      .from(projectsQuery.as('projects'))
      .leftJoin(membership, eq(membership.projectId, projectsTable.id))
      .leftJoin(counts, eq(projectsTable.id, counts.projectId))
      .orderBy(orderColumn)
      .limit(Number(limit))
      .offset(Number(offset));
    } else {
      projectsFilters.push(eq(projectsToWorkspacesTable.workspaceId, workspace))

      const [{ total: matches }] = await db
        .select({ total: count() })
        .from(projectsToWorkspacesTable)
        .leftJoin(projectsTable, and(eq(projectsToWorkspacesTable.projectId, projectsTable.id),  ...projectsFilters))
        .where(eq(projectsToWorkspacesTable.workspaceId, workspace))
        
      total = matches;

      projects = await db
        .select({
          project: projectsTable,
          role: membership.role,
          archived: membership.archived,
          admins: counts.admins,
          members: counts.members,
        })
        .from(projectsToWorkspacesTable)
        .leftJoin(projectsTable, and(eq(projectsToWorkspacesTable.projectId, projectsTable.id),  ...projectsFilters))
        .leftJoin(counts, eq(projectsTable.id, counts.projectId))
        .leftJoin(membership, eq(membership.projectId, projectsTable.id))
        .where(eq(projectsToWorkspacesTable.workspaceId, workspace))
        .orderBy(orderColumn)
        .limit(Number(limit))
        .offset(Number(offset));
    }

    return ctx.json(
      {
        success: true,
        data: {
          items: projects.map(({ project, role, admins, members, archived }) => ({
            ...project,
            role,
            archived: archived,
            counts: { admins, members },
          })),
          total,
        },
      },
      200,
    );
  })
  /*
   * Get user projects
   */
  .openapi(getUserProjectsRouteConfig, async (ctx) => {
    const { userId } = ctx.req.valid('param');

    // * Get the membership
    const projects = await db
      .select({
        id: projectsTable.id,
        name: projectsTable.name,
        createdAt: projectsTable.createdAt,
      })
      .from(projectsTable)
      .where(eq(projectsTable.id, membershipsTable.projectId))
      .innerJoin(membershipsTable, and(eq(membershipsTable.userId, userId), eq(membershipsTable.type, 'PROJECT')));

    if (!projects) return errorResponse(ctx, 404, 'not_found', 'warn', 'UNKNOWN', { user: userId });

    logEvent('Get user projects', { user: userId });

    return ctx.json(
      {
        success: true,
        data: projects,
      },
      200,
    );
  })
  /*
   * Update project
   */
  .openapi(updateProjectRouteConfig, async (ctx) => {
    const user = ctx.get('user');
    const project = ctx.get('project');

    const { name, slug, color } = ctx.req.valid('json');

    if (slug && slug !== project.slug) {
      const slugAvailable = await checkSlugAvailable(slug);

      if (!slugAvailable) {
        return errorResponse(ctx, 409, 'slug_exists', 'warn', 'PROJECT', { slug });
      }
    }

    const [updatedProject] = await db
      .update(projectsTable)
      .set({
        name,
        slug,
        color,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(projectsTable.id, project.id))
      .returning();

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.projectId, project.id)));

    if (membership) {
      sendSSE(user.id, 'update_project', {
        ...updatedProject,
        role: membership.role,
        type: 'PROJECT',
      });
    }

    logEvent('Project updated', { project: updatedProject.id });

    return ctx.json(
      {
        success: true,
        data: {
          ...updatedProject,
          role: membership?.role || null,
        },
      },
      200,
    );
  })

  /*
   * Delete projects
   */
  .openapi(deleteProjectsRouteConfig, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const user = ctx.get('user');

    // * Convert the projects ids to an array
    const projectsIds = Array.isArray(ids) ? ids : [ids];

    const errors: ErrorType[] = [];

    // * Get the projects and the user role
    const targets = await db
      .select({
        project: projectsTable,
        userRole: membershipsTable.role,
      })
      .from(projectsTable)
      .leftJoin(membershipsTable, and(eq(membershipsTable.projectId, projectsTable.id), eq(membershipsTable.userId, user.id)))
      .where(inArray(projectsTable.id, projectsIds));

    // * Check if the projects exist
    for (const id of projectsIds) {
      if (!targets.some((target) => target.project.id === id)) {
        errors.push(
          createError(ctx, 404, 'not_found', 'warn', 'PROJECT', {
            project: id,
          }),
        );
      }
    }

    // * Filter out projects that the user doesn't have permission to delete
    const allowedTargets = targets.filter((target) => {
      const projectId = target.project.id;

      if (user.role !== 'ADMIN' && target.userRole !== 'ADMIN') {
        errors.push(
          createError(ctx, 403, 'delete_forbidden', 'warn', 'PROJECT', {
            project: projectId,
          }),
        );
        return false;
      }

      return true;
    });

    // * If the user doesn't have permission to delete any of the projects, return an error
    if (allowedTargets.length === 0) {
      return ctx.json(
        {
          success: false,
          errors: errors,
        },
        200,
      );
    }

    // * Delete the projectId
    await db.delete(projectsTable).where(
      inArray(
        projectsTable.id,
        allowedTargets.map((target) => target.project.id),
      ),
    );

    // * Send SSE events for the projects that were deleted
    for (const { project, userRole } of allowedTargets) {
      // * Send the event to the user if they are a member of the project
      if (userRole) {
        sendSSE(user.id, 'remove_project', project);
      }

      logEvent('Project deleted', { project: project.id });
    }

    return ctx.json(
      {
        success: true,
        errors: errors,
      },
      200,
    );
  })
  /*
   * Get members by project id
   */
  .openapi(getUsersByProjectIdRouteConfig, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');
    const project = ctx.get('project');

    const filter: SQL | undefined = q ? ilike(usersTable.email, `%${q}%`) : undefined;

    const usersQuery = db.select().from(usersTable).where(filter).as('users');

    const membersFilters = [eq(membershipsTable.projectId, project.id), eq(membershipsTable.type, 'PROJECT')];

    const roles = db
      .select({
        userId: membershipsTable.userId,
        id: membershipsTable.id,
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
        membershipId: roles.id,
      },
      sort,
      usersTable.id,
      order,
    );

    const membersQuery = db
      .select({
        user: usersTable,
        membershipId: roles.id,
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
      result.map(async ({ user, membershipId, counts }) => ({
        ...user,
        electricJWTToken: null,
        sessions: [],
        membershipId,
        counts,
      })),
    );

    return ctx.json(
      {
        success: true,
        data: {
          items: members,
          total,
        },
      },
      200,
    );
  });

export default projectsRoutes;

export type ProjectsRoutes = typeof projectsRoutes;
