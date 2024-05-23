import { type SQL, and, count, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { projectsTable } from '../../db/schema/projects';

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
  updateProjectRouteConfig,
} from './routes';

const app = new CustomHono();

// * Project endpoints
const projectsRoutes = app
  /*
   * Create project
   */
  .openapi(createProjectRouteConfig, async (ctx) => {
    const { name, slug, color } = ctx.req.valid('json');
    const user = ctx.get('user');
    const { workspaceId } = ctx.get('project');

    const slugAvailable = await checkSlugAvailable(slug, 'PROJECT');

    if (!slugAvailable) {
      return errorResponse(ctx, 409, 'slug_exists', 'warn', 'PROJECT', { slug });
    }

    const [createdProject] = await db
      .insert(projectsTable)
      .values({
        workspaceId,
        name,
        slug,
        color,
        createdBy: user.id,
      })
      .returning();

    logEvent('Project created', { project: createdProject.id });

    await db.insert(membershipsTable).values({
      userId: user.id,
      projectId: createdProject.id,
      type: 'PROJECT',
      role: 'ADMIN',
    });

    logEvent('User added to project', {
      user: user.id,
      project: createdProject.id,
    });

    sendSSE(user.id, 'new_project_membership', {
      ...createdProject,
      type: 'PROJECT',
    });

    return ctx.json({
      success: true,
      data: {
        ...createdProject,
        role: 'ADMIN' as const,
      },
    });
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

    return ctx.json({
      success: true,
      data: {
        ...project,
        role: membership?.role || null,
      },
    });
  })
  /*
   * Get projects
   */
  .openapi(getProjectsRouteConfig, async (ctx) => {
    const { q, sort, order, offset, limit, workspace } = ctx.req.valid('query');
    const user = ctx.get('user');

    const membershipsFilters = [eq(membershipsTable.userId, user.id)];

    const filter: SQL | undefined = q ? ilike(projectsTable.name, `%${q}%`) : undefined;
    const projectsFilters = [filter];

    if (workspace) {
      projectsFilters.push(eq(projectsTable.workspaceId, workspace));
    }

    const projectsQuery = db
      .select()
      .from(projectsTable)
      .where(and(...projectsFilters));

    const [{ total }] = await db.select({ total: count() }).from(projectsQuery.as('projects'));

    const counts = db
      .select({
        projectId: membershipsTable.projectId,
        admins: count(sql`CASE WHEN ${membershipsTable.role} = 'ADMIN' THEN 1 ELSE NULL END`).as('admins'),
        members: count().as('members'),
      })
      .from(membershipsTable)
      .groupBy(membershipsTable.projectId)
      .as('counts');

    const membershipRoles = db
      .select({
        projectId: membershipsTable.projectId,
        role: membershipsTable.role,
      })
      .from(membershipsTable)
      .where(and(...membershipsFilters))
      .as('membership_roles');

    const orderColumn = getOrderColumn(
      {
        id: projectsTable.id,
        name: projectsTable.name,
        createdAt: projectsTable.createdAt,
        userRole: membershipRoles.role,
      },
      sort,
      projectsTable.id,
      order,
    );

    const projects = await db
      .select({
        project: projectsTable,
        role: membershipRoles.role,
        admins: counts.admins,
        members: counts.members,
      })
      .from(projectsQuery.as('projects'))
      .leftJoin(membershipRoles, eq(membershipRoles.projectId, projectsTable.id))
      .leftJoin(counts, eq(projectsTable.id, counts.projectId))
      .orderBy(orderColumn)
      .limit(Number(limit))
      .offset(Number(offset));

    return ctx.json({
      success: true,
      data: {
        items: projects.map(({ project, role, admins, members }) => ({
          ...project,
          role,
          counts: { admins, members },
        })),
        total,
      },
    });
  })
  /*
   * Update project
   */
  .openapi(updateProjectRouteConfig, async (ctx) => {
    const user = ctx.get('user');
    const project = ctx.get('project');

    const { name, slug, color } = ctx.req.valid('json');

    if (slug && slug !== project.slug) {
      const slugAvailable = await checkSlugAvailable(slug, 'PROJECT');

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

    return ctx.json({
      success: true,
      data: {
        ...updatedProject,
        role: membership?.role || null,
      },
    });
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
      return ctx.json({
        success: false,
        errors: errors,
      });
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

    return ctx.json({
      success: true,
      errors: errors,
    });
  });

export default projectsRoutes;

export type ProjectsRoutes = typeof projectsRoutes;
