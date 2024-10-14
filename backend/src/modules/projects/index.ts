import { type SQL, and, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { projectsTable } from '#/db/schema/projects';

import { getContextUser, getMemberships, getOrganization } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import permissionManager from '#/lib/permission-manager';
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
    const { name, slug } = ctx.req.valid('json');
    const { workspaceId } = ctx.req.valid('query');
    const memberships = getMemberships();

    // Make sure the user is a member of the workspace
    const workspaceMembership = memberships.find((m) => m.workspaceId === workspaceId && m.type === 'workspace');
    if (!workspaceMembership) return errorResponse(ctx, 403, 'forbidden', 'warn', 'workspace');

    const organization = getOrganization();
    const user = getContextUser();

    const slugAvailable = await checkSlugAvailable(slug);
    if (!slugAvailable) return errorResponse(ctx, 409, 'slug_exists', 'warn', 'project', { slug });

    // Create project with valid organization
    const [project] = await db
      .insert(projectsTable)
      .values({
        organizationId: organization.id,
        name,
        slug,
        createdBy: user.id,
      })
      .returning();

    logEvent('Project created', { project: project.id });

    // Insert membership
    const createdMembership = await insertMembership({ user, role: 'admin', entity: project, workspaceId });

    const createdProject = {
      ...project,
      membership: createdMembership,
    };

    return ctx.json({ success: true, data: createdProject }, 200);
  })
  /*
   * Get project by id or slug
   */
  .openapi(projectRoutesConfig.getProject, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const user = getContextUser();
    const memberships = getMemberships();

    const project = await resolveEntity('project', idOrSlug);
    if (!project) return errorResponse(ctx, 404, 'not_found', 'warn', 'project', { id: idOrSlug });

    // TODO remove this and use permission manager once it returns membership
    const membership = memberships.find((m) => m.projectId === project.id && m.type === 'project');
    if (!membership) return errorResponse(ctx, 403, 'forbidden', 'warn', 'project');

    // If not allowed and not admin, return forbidden
    const canRead = permissionManager.isPermissionAllowed(memberships, 'read', project);
    if (!canRead && user.role !== 'admin') return errorResponse(ctx, 403, 'forbidden', 'warn', 'project');

    return ctx.json({ success: true, data: { ...project, membership } }, 200);
  })
  /*
   * Get list of projects
   */
  .openapi(projectRoutesConfig.getProjects, async (ctx) => {
    const { q, sort, order, offset, limit, userId: requestUserId } = ctx.req.valid('query');

    const user = getContextUser();
    const organization = getOrganization();

    // Get projects for a specific user or self
    const userId = requestUserId ?? user.id;

    // Filter projects at least by valid organization
    const projectsFilters: SQL[] = [eq(projectsTable.organizationId, organization.id)];

    // Add other filters
    if (q) projectsFilters.push(ilike(projectsTable.name, `%${q}%`));

    const projectsQuery = db
      .select()
      .from(projectsTable)
      .where(and(...projectsFilters));

    const memberships = db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId)).as('memberships');

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
        membership: membershipSelect,
      })
      .from(projectsQuery.as('projects'))
      .innerJoin(memberships, eq(memberships.projectId, projectsTable.id))
      .orderBy(orderColumn)
      .limit(Number(limit))
      .offset(Number(offset));

    // TODO map membership directly in the query?
    const projectsWithMembership = projects.map(({ project, membership }) => ({
      ...project,
      membership,
    }));

    const data = {
      items: projectsWithMembership,
      total: projects.length,
    };

    return ctx.json({ success: true, data }, 200);
  })
  /*
   * Update project by id or slug
   */
  .openapi(projectRoutesConfig.updateProject, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');
    const { name, thumbnailUrl, slug } = ctx.req.valid('json');

    const memberships = getMemberships();
    const user = getContextUser();

    const project = await resolveEntity('project', idOrSlug);
    if (!project) return errorResponse(ctx, 404, 'not_found', 'warn', 'project', { id: idOrSlug });

    // TODO remove this and user permission manager once it returns membership
    const userMembership = memberships.find((m) => m.projectId === project.id && m.type === 'project');
    if (!userMembership) return errorResponse(ctx, 403, 'forbidden', 'warn', 'project');

    // If not allowed and not admin, return forbidden
    const canUpdate = permissionManager.isPermissionAllowed(memberships, 'update', project);
    if (!canUpdate && user.role !== 'admin') return errorResponse(ctx, 403, 'forbidden', 'warn', 'organization');

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

    const projectMemberships = await db
      .select(membershipSelect)
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'project'), eq(membershipsTable.projectId, project.id)));

    // Send SSE events to project members
    for (const membership of projectMemberships) {
      sendSSEToUsers([membership.userId], 'update_entity', { ...updatedProject, membership });
    }

    logEvent('Project updated', { project: updatedProject.id });

    return ctx.json({ success: true, data: { ...updatedProject, membership: userMembership } }, 200);
  })

  /*
   * Delete projects
   */
  .openapi(projectRoutesConfig.deleteProjects, async (ctx) => {
    const { ids } = ctx.req.valid('query');

    const memberships = getMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];

    if (!toDeleteIds.length) return errorResponse(ctx, 400, 'invalid_request', 'warn', 'project');

    const { allowedIds, disallowedIds } = await splitByAllowance('delete', 'project', toDeleteIds, memberships);
    if (!allowedIds.length) return errorResponse(ctx, 403, 'forbidden', 'warn', 'project');

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
