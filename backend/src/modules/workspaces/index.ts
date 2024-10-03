import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { workspacesTable } from '#/db/schema/workspaces';

import { labelsTable } from '#/db/schema/labels';
import { projectsTable } from '#/db/schema/projects';
import { safeUserSelect, usersTable } from '#/db/schema/users';
import { getContextUser, getMemberships, getOrganization } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { sendSSEToUsers } from '#/lib/sse';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono } from '#/types/common';
import { splitByAllowance } from '#/utils/split-by-allowance';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { insertMembership } from '../memberships/helpers/insert-membership';
import { transformDatabaseUserWithCount } from '../users/helpers/transform-database-user';
import workspaceRoutesConfig from './routes';

const app = new CustomHono();

// Workspace endpoints
const workspacesRoutes = app
  /*
   * Create workspace
   */
  .openapi(workspaceRoutesConfig.createWorkspace, async (ctx) => {
    const { name, slug } = ctx.req.valid('json');
    const organization = getOrganization();
    const user = getContextUser();

    const slugAvailable = await checkSlugAvailable(slug);

    if (!slugAvailable) {
      return errorResponse(ctx, 409, 'slug_exists', 'warn', 'workspace', { slug });
    }

    const [workspace] = await db
      .insert(workspacesTable)
      .values({
        organizationId: organization.id,
        name,
        slug,
      })
      .returning();

    logEvent('Workspace created', { workspace: workspace.id });

    // Insert membership
    const createdMembership = await insertMembership({ user, role: 'admin', entity: workspace });

    return ctx.json(
      {
        success: true,
        data: {
          ...workspace,
          membership: createdMembership,
        },
      },
      200,
    );
  })
  /*
   * Get workspace by id or slug with related projects, members and labels
   */
  .openapi(workspaceRoutesConfig.getWorkspace, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');

    const memberships = getMemberships();
    const user = getContextUser();

    const workspace = await resolveEntity('workspace', idOrSlug);

    if (!workspace) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'workspace', { id: idOrSlug });
    }

    const membership = memberships.find((m) => m.workspaceId === workspace.id && m.type === 'workspace');
    const projectsWithMembership = await db
      .select({
        project: projectsTable,
        membership: membershipSelect,
      })
      .from(projectsTable)
      .innerJoin(workspacesTable, eq(workspacesTable.id, workspace.id))
      .innerJoin(
        membershipsTable,
        and(eq(membershipsTable.projectId, projectsTable.id), eq(membershipsTable.userId, user.id), eq(membershipsTable.archived, false)),
      )
      .where(eq(projectsTable.parentId, workspace.id))
      .orderBy(asc(membershipsTable.order));

    const projects = projectsWithMembership.map(({ project, membership }) => {
      return {
        ...project,
        membership,
        workspaceId: workspace.id,
      };
    });

    const membershipCount = db
      .select({
        userId: membershipsTable.userId,
        memberships: count().as('memberships'),
      })
      .from(membershipsTable)
      .groupBy(membershipsTable.userId)
      .as('membership_count');

    const membersFilters = [eq(usersTable.id, membershipsTable.userId), eq(membershipsTable.type, 'project')];
    if (projects.length)
      membersFilters.push(
        inArray(
          membershipsTable.projectId,
          projects.map((p) => p.id),
        ),
      );
    const membersQuery = db
      .select({
        user: safeUserSelect,
        membership: membershipSelect,
        counts: {
          memberships: membershipCount.memberships,
        },
        projectId: membershipsTable.projectId,
      })
      .from(usersTable)
      .innerJoin(membershipsTable, and(...membersFilters));

    const members = (await membersQuery).map(({ user, membership, projectId, counts }) => ({
      ...transformDatabaseUserWithCount(user, counts.memberships),
      membership,
      projectId,
    }));

    const labelsQuery = db
      .select()
      .from(labelsTable)
      .where(
        inArray(
          labelsTable.projectId,
          projects.map((p) => p.id),
        ),
      );

    const labels = await db.select().from(labelsQuery.as('labels'));

    return ctx.json(
      {
        success: true,
        data: {
          workspace: { ...workspace, membership: membership ?? null },
          projects,
          members,
          labels,
        },
      },
      200,
    );
  })
  /*
   * Update workspace by id or slug
   */
  .openapi(workspaceRoutesConfig.updateWorkspace, async (ctx) => {
    const { idOrSlug } = ctx.req.valid('param');
    const { name, slug, thumbnailUrl, bannerUrl } = ctx.req.valid('json');

    const user = getContextUser();

    const workspace = await resolveEntity('workspace', idOrSlug);

    if (!workspace) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'workspace', { id: idOrSlug });
    }

    if (slug && slug !== workspace.slug) {
      const slugAvailable = await checkSlugAvailable(slug);

      if (!slugAvailable) {
        return errorResponse(ctx, 409, 'slug_exists', 'warn', 'workspace', { slug });
      }
    }

    const [updatedWorkspace] = await db
      .update(workspacesTable)
      .set({
        name,
        slug,
        thumbnailUrl,
        bannerUrl,
        organizationId: workspace.organizationId,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(workspacesTable.id, workspace.id))
      .returning();

    const memberships = await db
      .select(membershipSelect)
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'workspace'), eq(membershipsTable.workspaceId, workspace.id)));

    if (memberships.length > 0) {
      memberships.map((membership) =>
        sendSSEToUsers([membership.userId], 'update_entity', {
          ...updatedWorkspace,
          membership: memberships.find((m) => m.id === membership.id) ?? null,
        }),
      );
    }

    logEvent('Workspace updated', { workspace: updatedWorkspace.id });

    return ctx.json(
      {
        success: true,
        data: {
          ...updatedWorkspace,
          membership: memberships.find((m) => m.id === user.id) ?? null,
        },
      },
      200,
    );
  })
  /*
   * Delete workspaces
   */
  .openapi(workspaceRoutesConfig.deleteWorkspaces, async (ctx) => {
    const { ids } = ctx.req.valid('query');

    const memberships = getMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];

    if (!toDeleteIds.length) {
      return errorResponse(ctx, 400, 'invalid_request', 'warn', 'workspace');
    }

    const { allowedIds, disallowedIds } = await splitByAllowance('delete', 'workspace', toDeleteIds, memberships);

    if (!allowedIds.length) {
      return errorResponse(ctx, 403, 'forbidden', 'warn', 'project');
    }

    // Map errors of workspaces user is not allowed to delete
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'workspace', { workspace: id }));

    // Get members
    const workspaceMembers = await db
      .select({ id: membershipsTable.userId, workspaceId: membershipsTable.workspaceId })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'workspace'), inArray(membershipsTable.workspaceId, allowedIds)));

    // Delete the workspaces
    await db.delete(workspacesTable).where(inArray(workspacesTable.id, allowedIds));

    // Send SSE events for the workspaces that were deleted
    for (const id of allowedIds) {
      if (!workspaceMembers.length) continue;

      const membersId = workspaceMembers
        .filter(({ workspaceId }) => workspaceId === id)
        .map((member) => member.id)
        .filter(Boolean) as string[];
      sendSSEToUsers(membersId, 'remove_entity', { id, entity: 'workspace' });
    }

    logEvent('Workspaces deleted', { ids: allowedIds.join() });

    return ctx.json({ success: true, errors: errors }, 200);
  });

export default workspacesRoutes;
