import { type SQL, and, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { projectsTable } from '#/db/schema/projects';

import { getContextUser, getMemberships } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { sendSSEToUsers } from '#/lib/sse';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono } from '#/types/common';
import { getOrderColumn } from '#/utils/order-column';
import { splitByAllowance } from '#/utils/split-by-allowance';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { insertMembership } from '../memberships/helpers/insert-membership';
import projectRoutesConfig from './routes';

const app = new CustomHono();

// Project endpoints
const projectsRoutes = app
  /*
   * Create project
   */
  .openapi(projectRoutesConfig.createProject, async (ctx) => {
    const { name, slug, organizationId } = ctx.req.valid('json');
    const workspaceId = ctx.req.query('workspaceId');

    const user = getContextUser();

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
        parentId: workspaceId ?? null,
        createdBy: user.id,
      })
      .returning();

    logEvent('Project created', { project: project.id });

    // Insert membership
    const createdMembership = await insertMembership({ user, role: 'admin', entity: project });

    const createdProject = {
      ...project,
      workspaceId,
      membership: createdMembership,
    };

    return ctx.json({ success: true, data: createdProject }, 200);
  })
  /*
   * Get project by id or slug
   */
  .openapi(projectRoutesConfig.getProject, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');
    const memberships = getMemberships();

    const project = await resolveEntity('project', idOrSlug);

    if (!project) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'project', { id: idOrSlug });
    }

    const membership = memberships.find((m) => m.projectId === project.id && m.type === 'project') ?? null;

    return ctx.json(
      {
        success: true,
        data: {
          ...project,
          workspaceId: project.parentId,
          membership,
        },
      },
      200,
    );
  })
  /*
   * Get list of projects
   */
  .openapi(projectRoutesConfig.getProjects, async (ctx) => {
    const { q, sort, order, offset, limit, organizationId } = ctx.req.valid('query');
    const user = getContextUser();

    const projectsFilters: SQL[] = [];
    if (q) projectsFilters.push(ilike(projectsTable.name, `%${q}%`));
    if (organizationId) projectsFilters.push(eq(projectsTable.organizationId, organizationId));

    const projectsQuery = db
      .select()
      .from(projectsTable)
      .where(and(...projectsFilters));

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

    const projects = await db
      .select({
        project: projectsTable,
        membership: membershipsTable,
      })
      .from(projectsQuery.as('projects'))
      .innerJoin(memberships, eq(memberships.projectId, projectsTable.id))
      .orderBy(orderColumn)
      .limit(Number(limit))
      .offset(Number(offset));

    return ctx.json(
      {
        success: true,
        data: {
          items: projects.map(({ project, membership }) => ({
            ...project,
            membership,
            workspaceId: project.parentId,
          })),
          total: projects.length,
        },
      },
      200,
    );
  })
  /*
   * Update project by id or slug
   */
  .openapi(projectRoutesConfig.updateProject, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');
    const { name, thumbnailUrl, slug } = ctx.req.valid('json');

    const user = getContextUser();

    const project = await resolveEntity('project', idOrSlug);

    if (!project) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'project', { id: idOrSlug });
    }

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
          parentId: updatedProject.parentId,
          membership: memberships.find((m) => m.id === user.id) ?? null,
        },
      },
      200,
    );
  })

  /*
   * Delete projects
   */
  .openapi(projectRoutesConfig.deleteProjects, async (ctx) => {
    const { ids } = ctx.req.valid('query');

    const memberships = getMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];

    if (!toDeleteIds.length) {
      return errorResponse(ctx, 400, 'invalid_request', 'warn', 'project');
    }

    const { allowedIds, disallowedIds } = await splitByAllowance('delete', 'project', toDeleteIds, memberships);

    if (!allowedIds.length) {
      return errorResponse(ctx, 403, 'forbidden', 'warn', 'project');
    }

    // Map errors of projects user is not allowed to delete
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'project', { project: id }));

    // Get members
    const projectsMembers = await db
      .select({ id: membershipsTable.userId, projectId: membershipsTable.projectId })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'project'), inArray(membershipsTable.projectId, allowedIds)));

    // Delete the projects
    await db.delete(projectsTable).where(inArray(projectsTable.id, allowedIds));

    // Send SSE events for the projects that were deleted
    for (const id of allowedIds) {
      if (!projectsMembers.length) continue;

      const membersId = projectsMembers
        .filter(({ projectId }) => projectId === id)
        .map((member) => member.id)
        .filter(Boolean) as string[];
      sendSSEToUsers(membersId, 'remove_entity', { id, entity: 'project' });
    }

    logEvent('Projects deleted', { ids: allowedIds.join() });

    return ctx.json({ success: true, errors: errors }, 200);
  });

export default projectsRoutes;
