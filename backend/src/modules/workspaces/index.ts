import { and, count, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { workspacesTable } from '../../db/schema/workspaces';

import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { sendSSEToUsers } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { insertMembership } from '../memberships/helpers/insert-membership';
import { toMembershipInfo } from '../memberships/helpers/to-membership-info';
import workspaceRoutesConfig from './routes';
import { projectsToWorkspacesTable } from '../../db/schema/projects-to-workspaces';
import { projectsTable } from '../../db/schema/projects';
import { usersTable } from '../../db/schema/users';

const app = new CustomHono();

// Workspace endpoints
const workspacesRoutes = app
  /*
   * Create workspace
   */
  .openapi(workspaceRoutesConfig.createWorkspace, async (ctx) => {
    const { name, slug, organizationId } = ctx.req.valid('json');
    const user = ctx.get('user');
    const memberships = ctx.get('memberships');

    const slugAvailable = await checkSlugAvailable(slug);

    if (!slugAvailable) {
      return errorResponse(ctx, 409, 'slug_exists', 'warn', 'workspace', { slug });
    }

    const [workspace] = await db
      .insert(workspacesTable)
      .values({
        organizationId,
        name,
        slug,
      })
      .returning();

    logEvent('Workspace created', { workspace: workspace.id });

    // Insert membership
    const [createdMembership] = await insertMembership({ user, role: 'admin', entity: workspace, memberships });

    return ctx.json(
      {
        success: true,
        data: {
          ...workspace,
          membership: toMembershipInfo(createdMembership),
        },
      },
      200,
    );
  })
  /*
   * Get workspace by id or slug with related projects & members
   */
  .openapi(workspaceRoutesConfig.getWorkspace, async (ctx) => {
    const workspace = ctx.get('workspace');
    const memberships = ctx.get('memberships');
    const user = ctx.get('user');
    const membership = memberships.find((m) => m.workspaceId === workspace.id && m.type === 'workspace');
    const projectsWithMembership = await db
      .select({
        project: projectsTable,
        membership: membershipsTable,
      })
      .from(projectsTable)
      .innerJoin(projectsToWorkspacesTable, eq(projectsToWorkspacesTable.workspaceId, workspace.id))
      .innerJoin(membershipsTable, and(eq(membershipsTable.projectId, projectsToWorkspacesTable.projectId), eq(membershipsTable.userId, user.id)))
      .where(eq(projectsTable.id, projectsToWorkspacesTable.projectId))
      .orderBy(membershipsTable.order);

    const projects = projectsWithMembership.map(({ project, membership }) => {
      return {
        ...project,
        membership: toMembershipInfo(membership),
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
        user: usersTable,
        membership: membershipsTable,
        counts: {
          memberships: membershipCount.memberships,
        },
        projectId: membershipsTable.projectId,
      })
      .from(usersTable)
      .innerJoin(membershipsTable, and(...membersFilters));

    const members = (await membersQuery).map(({ user, membership, projectId, counts }) => ({
      ...user,
      membership: toMembershipInfo.required(membership),
      projectId,
      counts,
    }));
    const uniqueMembersMap = members.reduce((acc, member) => {
      const existingMember = acc.get(member.id);
      if (existingMember) {
        existingMember.projectIds.push(member.projectId);
      } else {
        acc.set(member.id, { ...member, projectIds: [member.projectId] });
      }
      return acc;
    }, new Map());

    const uniqueMembers = Array.from(uniqueMembersMap.values());

    return ctx.json(
      {
        success: true,
        data: {
          workspace: { ...workspace, membership: toMembershipInfo(membership) },
          relatedProjects: projects,
          workspaceMembers: uniqueMembers,
        },
      },
      200,
    );
  })
  /*
   * Update workspace
   */
  .openapi(workspaceRoutesConfig.updateWorkspace, async (ctx) => {
    const user = ctx.get('user');
    const workspace = ctx.get('workspace');

    const { name, slug, thumbnailUrl } = ctx.req.valid('json');

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
        organizationId: workspace.organizationId,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(workspacesTable.id, workspace.id))
      .returning();

    const memberships = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'workspace'), eq(membershipsTable.workspaceId, workspace.id)));

    if (memberships.length > 0) {
      memberships.map((member) =>
        sendSSEToUsers([member.id], 'update_entity', {
          ...updatedWorkspace,
          membership: toMembershipInfo(memberships.find((m) => m.id === member.id)),
        }),
      );
    }

    logEvent('Workspace updated', { workspace: updatedWorkspace.id });

    return ctx.json(
      {
        success: true,
        data: {
          ...updatedWorkspace,
          membership: toMembershipInfo(memberships.find((m) => m.id === user.id)),
        },
      },
      200,
    );
  })
  /*
   * Delete workspaces
   */
  .openapi(workspaceRoutesConfig.deleteWorkspaces, async (ctx) => {
    // Extract allowed and disallowed ids
    const allowedIds = ctx.get('allowedIds');
    const disallowedIds = ctx.get('disallowedIds');

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
      // Send the event to the user if they are a member of the workspace
      if (workspaceMembers.length > 0) {
        const membersId = workspaceMembers
          .filter(({ workspaceId }) => workspaceId === id)
          .map((member) => member.id)
          .filter(Boolean) as string[];
        sendSSEToUsers(membersId, 'remove_entity', { id, entity: 'workspace' });
      }

      logEvent('Workspace deleted', { workspace: id });
    }

    return ctx.json({ success: true, errors: errors }, 200);
  });

export default workspacesRoutes;
