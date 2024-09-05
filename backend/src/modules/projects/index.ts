import { type SQL, and, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { projectsTable } from '#/db/schema/projects';
import { projectsToWorkspacesTable } from '#/db/schema/projects-to-workspaces';

import { counts } from '#/lib/counts';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { getOrderColumn } from '#/lib/order-column';
import { sendSSEToUsers } from '#/lib/sse';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono } from '#/types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { insertMembership } from '../memberships/helpers/insert-membership';
import projectRoutesConfig from './routes';

const app = new CustomHono();

// Project endpoints
const projectsRoutes = app
  .basePath('/projects')
  /*
   * Create project
   */
  .openapi(projectRoutesConfig.createProject, async (ctx) => {
    const { name, slug, organizationId } = ctx.req.valid('json');
    const workspaceId = ctx.req.query('workspaceId');

    const user = ctx.get('user');
    const memberships = ctx.get('memberships');

    const slugAvailable = await checkSlugAvailable(slug);

    if (!slugAvailable) {
      return errorResponse(ctx, 409, 'slug_exists', 'warn', 'project', { slug });
    }

    const [project] = await db
      .insert(projectsTable)
      .values({
        organizationId,
        name,
        slug,
        createdBy: user.id,
      })
      .returning();

    logEvent('Project created', { project: project.id });

    // Insert membership
    const createdMembership = await insertMembership({ user, role: 'admin', entity: project, memberships });

    // If project created in workspace, add project to it
    if (workspaceId) {
      await db.insert(projectsToWorkspacesTable).values({
        projectId: project.id,
        workspaceId: workspaceId,
      });

      logEvent('Project added to workspace', { project: project.id, workspace: workspaceId });
    }

    const createdProject = {
      ...project,
      workspaceId,
      counts: {
        memberships: { admins: 1, members: 1, total: 1 },
      },
      membership: createdMembership,
    };

    return ctx.json({ success: true, data: createdProject }, 200);
  })
  /*
   * Get project by id or slug
   */
  .openapi(projectRoutesConfig.getProject, async (ctx) => {
    const project = ctx.get('project');
    const memberships = ctx.get('memberships');
    const membership = memberships.find((m) => m.projectId === project.id && m.type === 'project') ?? null;
    const [projectToWorkspace] = await db.select().from(projectsToWorkspacesTable).where(eq(projectsToWorkspacesTable.projectId, project.id));
    return ctx.json(
      {
        success: true,
        data: {
          ...project,
          workspaceId: projectToWorkspace.workspaceId,
          membership,
          counts: await counts('project', project.id),
        },
      },
      200,
    );
  })
  /*
   * Get list of projects
   */
  .openapi(projectRoutesConfig.getProjects, async (ctx) => {
    const { q, sort, order, offset, limit, workspaceId, organizationId } = ctx.req.valid('query');
    const user = ctx.get('user');

    const projectsFilters: SQL[] = [];
    if (q) projectsFilters.push(ilike(projectsTable.name, `%${q}%`));
    if (organizationId) projectsFilters.push(eq(projectsTable.organizationId, organizationId));

    const projectsQuery = db
      .select()
      .from(projectsTable)
      .where(and(...projectsFilters));

    const countsQuery = await counts('project');

    const memberships = db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id)).as('memberships');

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
          admins: countsQuery.admins,
          members: countsQuery.members,
        })
        .from(projectsQuery.as('projects'))
        .innerJoin(memberships, eq(memberships.projectId, projectsTable.id))
        .leftJoin(projectsToWorkspacesTable, eq(projectsToWorkspacesTable.projectId, projectsTable.id))
        .leftJoin(countsQuery, eq(projectsTable.id, countsQuery.id))
        .orderBy(orderColumn)
        .limit(Number(limit))
        .offset(Number(offset));
    } else {
      projects = await db
        .select({
          project: projectsTable,
          membership: membershipSelect,
          workspaceId: projectsToWorkspacesTable.workspaceId,
          admins: countsQuery.admins,
          members: countsQuery.members,
        })
        .from(projectsToWorkspacesTable)
        .leftJoin(
          projectsTable,
          and(eq(projectsToWorkspacesTable.projectId, projectsTable.id), eq(projectsToWorkspacesTable.workspaceId, workspaceId), ...projectsFilters),
        )
        .leftJoin(countsQuery, eq(projectsTable.id, countsQuery.id))
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
            membership,
            workspaceId,
            counts: {
              memberships: { admins, members },
            },
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
  .openapi(projectRoutesConfig.updateProject, async (ctx) => {
    const user = ctx.get('user');
    const project = ctx.get('project');

    const { name, thumbnailUrl, slug, workspaceId } = ctx.req.valid('json');

    if (slug && slug !== project.slug) {
      const slugAvailable = await checkSlugAvailable(slug);
      if (!slugAvailable) return errorResponse(ctx, 409, 'slug_exists', 'warn', 'project', { slug });
    }

    const [updatedProject] = await db
      .update(projectsTable)
      .set({
        name,
        slug,
        thumbnailUrl,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(projectsTable.id, project.id))
      .returning();

    const [workspaceRelation] = await db.select().from(projectsToWorkspacesTable).where(eq(projectsToWorkspacesTable.projectId, project.id));
    if (workspaceId && workspaceRelation.workspaceId !== workspaceId) {
      await db.update(projectsToWorkspacesTable).set({
        projectId: project.id,
        workspaceId,
      });
    }

    const memberships = await db
      .select(membershipSelect)
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'project'), eq(membershipsTable.projectId, project.id)));

    if (memberships.length > 0) {
      memberships.map((membership) =>
        sendSSEToUsers([membership.userId], 'update_entity', {
          ...updatedProject,
          membership: memberships.find((m) => m.id === membership.id) ?? null,
        }),
      );
    }

    logEvent('Project updated', { project: updatedProject.id });

    return ctx.json(
      {
        success: true,
        data: {
          ...updatedProject,
          parentId: workspaceId,
          membership: memberships.find((m) => m.id === user.id) ?? null,
          counts: await counts('project', project.id),
        },
      },
      200,
    );
  })

  /*
   * Delete projects
   */
  .openapi(projectRoutesConfig.deleteProjects, async (ctx) => {
    // Extract allowed and disallowed ids
    const allowedIds = ctx.get('allowedIds');
    const disallowedIds = ctx.get('disallowedIds');

    // Map errors of workspaces user is not allowed to delete
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'project', { project: id }));

    // Get members
    const projectsMembers = await db
      .select({ id: membershipsTable.userId, projectId: membershipsTable.projectId })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'project'), inArray(membershipsTable.projectId, allowedIds)));

    // Delete the projectId
    await db.delete(projectsTable).where(inArray(projectsTable.id, allowedIds));

    // Send SSE events for the projects that were deleted
    for (const id of allowedIds) {
      // Send the event to the user if they are a member of the project
      if (projectsMembers.length > 0) {
        const membersId = projectsMembers
          .filter(({ projectId }) => projectId === id)
          .map((member) => member.id)
          .filter(Boolean) as string[];
        sendSSEToUsers(membersId, 'remove_entity', { id, entity: 'project' });
      }

      logEvent('Project deleted', { project: id });
    }

    return ctx.json({ success: true, errors: errors }, 200);
  });

export type AppProjectsType = typeof projectsRoutes;

export default projectsRoutes;
