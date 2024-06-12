import { type SQL, and, count, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { projectsTable } from '../../db/schema/projects';
import { projectsToWorkspacesTable } from '../../db/schema/projects-to-workspaces';

import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { getOrderColumn } from '../../lib/order-column';
import { sendSSE, sendSSEToUsers } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import {
  createProjectRouteConfig,
  deleteProjectsRouteConfig,
  getProjectRouteConfig,
  getProjectsRouteConfig,
  updateProjectRouteConfig,
} from './routes';
import { toMembershipInfo } from '../memberships/helpers/to-membership-info';

const app = new CustomHono();

// * Project endpoints
const projectsRoutes = app
  /*
   * Create project
   */
  .openapi(createProjectRouteConfig, async (ctx) => {
    const { name, slug, color, organizationId, workspaceId } = ctx.req.valid('json');
    const user = ctx.get('user');

    const slugAvailable = await checkSlugAvailable(slug);

    if (!slugAvailable) {
      return errorResponse(ctx, 409, 'slug_exists', 'warn', 'PROJECT', { slug });
    }

    const [project] = await db
      .insert(projectsTable)
      .values({
        organizationId,
        name,
        slug,
        color,
        createdBy: user.id,
      })
      .returning();

    logEvent('Project created', { project: project.id });

    const [createdMembership] = await db
    .insert(membershipsTable)
    .values({
      userId: user.id,
      organizationId,
      projectId: project.id,
      type: 'PROJECT',
      role: 'ADMIN',
    }).returning();

    logEvent('User added to project', { user: user.id, project: project.id });

    // If project created in workspace, add project to it
    if (workspaceId) {
      await db.insert(projectsToWorkspacesTable).values({
        projectId: project.id,
        workspaceId: workspaceId,
      });

      logEvent('Project added to workspace', { project: project.id, workspace: workspaceId });
    }

    const createdProject = { ...project, counts: { admins: 1, members: 0 }, membership: toMembershipInfo(createdMembership) };

    sendSSE(user.id, 'create_entity', createdProject);

    return ctx.json({ success: true, data: createdProject }, 200);
  })
  /*
   * Get project by id or slug
   */
  .openapi(getProjectRouteConfig, async (ctx) => {
    const project = ctx.get('project');
    const memberships = ctx.get('memberships');
    const membership = memberships.find(m => m.projectId === project.id && m.type === 'PROJECT')

    // TODO fix counts using a helper
    return ctx.json(
      {
        success: true,
        data: {
          ...project,
          membership: toMembershipInfo(membership),
          counts: { admins: 0, members: 0 },
        },
      },
      200,
    );
  })
  /*
   * Get list of projects
   */
  .openapi(getProjectsRouteConfig, async (ctx) => {
    // TODO: also be able to filter on organizationId
    const { q, sort, order, offset, limit, workspaceId, requestedUserId } = ctx.req.valid('query');
    const user = ctx.get('user');

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

    // @TODO: Permission check which projects a user is allowed to see? (this will skip when requestedUserId is used in query!)
    // It should check organization permissions, project permissions and system admin permission
    const memberships = db
      .select()
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, requestedUserId ? requestedUserId : user.id))
      .as('memberships');

    const orderColumn = getOrderColumn(
      {
        id: projectsTable.id,
        name: projectsTable.name,
        createdAt: projectsTable.createdAt,
        userRole: memberships.role,
      },
      sort,
      projectsTable.id,
      order,
    );

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    let projects: Array<any>;

    if (!workspaceId) {
      projects = await db
        .select({
          project: projectsTable,
          membership: membershipsTable,
          workspaceId: projectsToWorkspacesTable.workspaceId,
          admins: counts.admins,
          members: counts.members,
        })
        .from(projectsQuery.as('projects'))
        .innerJoin(memberships, eq(memberships.projectId, projectsTable.id))
        .leftJoin(projectsToWorkspacesTable, eq(projectsToWorkspacesTable.projectId, projectsTable.id))
        .leftJoin(counts, eq(projectsTable.id, counts.projectId))
        .orderBy(orderColumn)
        .limit(Number(limit))
        .offset(Number(offset));
    } else {
      projects = await db
        .select({
          project: projectsTable,
          membership: membershipsTable,          
          workspaceId: projectsToWorkspacesTable.workspaceId,
          admins: counts.admins,
          members: counts.members,
        })
        .from(projectsToWorkspacesTable)
        .leftJoin(
          projectsTable,
          and(eq(projectsToWorkspacesTable.projectId, projectsTable.id), eq(projectsToWorkspacesTable.workspaceId, workspaceId), ...projectsFilters),
        )
        .leftJoin(counts, eq(projectsTable.id, counts.projectId))
        .leftJoin(memberships, and(eq(memberships.projectId, projectsTable.id)))
        .where(eq(projectsToWorkspacesTable.workspaceId, workspaceId))
        .orderBy(orderColumn)
        .limit(Number(limit))
        .offset(Number(offset));
    }

    return ctx.json(
      {
        success: true,
        data: {
          items: projects.map(({ project, membership, workspaceId, admins, members }) => ({
            ...project,
            membership: toMembershipInfo(membership),
            workspaceId,
            counts: { admins, members },
          })),
          total: projects.length,
        },
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

    const memberships = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'PROJECT'), eq(membershipsTable.projectId, project.id)));

    if (memberships.length > 0) {
      const membersId = memberships.map((member) => member.id);
      sendSSEToUsers(membersId, 'update_entity', updatedProject);
    }

    logEvent('Project updated', { project: updatedProject.id });

    // TODO fix counts using a helper
    return ctx.json(
      {
        success: true,
        data: {
          ...updatedProject,
          membership: toMembershipInfo(memberships.find((member) => member.id === user.id)),
          counts: { admins: 0, members: 0 },
        },
      },
      200,
    );
  })

  /*
   * Delete projects
   */
  .openapi(deleteProjectsRouteConfig, async (ctx) => {
    // * Extract allowed and disallowed ids
    const allowedIds = ctx.get('allowedIds');
    const disallowedIds = ctx.get('disallowedIds');

    // * Map errors of workspaces user is not allowed to delete
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'PROJECT', { project: id }));

    // * Get members
    const projectsMembers = await db
      .select({ id: membershipsTable.userId, projectId: membershipsTable.projectId })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'PROJECT'), inArray(membershipsTable.projectId, allowedIds)));

    // * Delete the projectId
    await db.delete(projectsTable).where(inArray(projectsTable.id, allowedIds));

    // * Send SSE events for the projects that were deleted
    for (const id of allowedIds) {
      // * Send the event to the user if they are a member of the project
      if (projectsMembers.length > 0) {
        const membersId = projectsMembers
          .filter(({ projectId }) => projectId === id)
          .map((member) => member.id)
          .filter(Boolean) as string[];
        sendSSEToUsers(membersId, 'remove_entity', { id, type: 'PROJECT' });
      }

      logEvent('Project deleted', { project: id });
    }

    return ctx.json(
      {
        success: true,
        errors: errors,
      },
      200,
    );
  });

export default projectsRoutes;
