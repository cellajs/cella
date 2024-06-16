import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { workspacesTable } from '../../db/schema/workspaces';

import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { sendSSEToUsers } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { toMembershipInfo } from '../memberships/helpers/to-membership-info';
import workspaceRoutesConfig from './routes';

const app = new CustomHono();

// Workspace endpoints
const workspacesRoutes = app
  /*
   * Create workspace
   */
  .openapi(workspaceRoutesConfig.createWorkspace, async (ctx) => {
    const { name, slug, organizationId } = ctx.req.valid('json');
    const user = ctx.get('user');

    const slugAvailable = await checkSlugAvailable(slug);

    if (!slugAvailable) {
      return errorResponse(ctx, 409, 'slug_exists', 'warn', 'WORKSPACE', { slug });
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

    const [createdMembership] = await db
      .insert(membershipsTable)
      .values({
        userId: user.id,
        organizationId,
        workspaceId: workspace.id,
        type: 'WORKSPACE',
        role: 'ADMIN',
        order: 1,
      })
      .returning();

    logEvent('User added to workspace', { user: user.id, workspace: workspace.id });

    sendSSEToUsers([user.id], 'create_entity', {
      ...workspace,
      membership: toMembershipInfo(createdMembership),
    });

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
   * Get workspace by id or slug
   */
  .openapi(workspaceRoutesConfig.getWorkspace, async (ctx) => {
    const workspace = ctx.get('workspace');
    const memberships = ctx.get('memberships');
    const membership = memberships.find((m) => m.workspaceId === workspace.id && m.type === 'WORKSPACE');

    return ctx.json(
      {
        success: true,
        data: {
          ...workspace,
          membership: toMembershipInfo(membership),
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

    const { name, slug } = ctx.req.valid('json');

    if (slug && slug !== workspace.slug) {
      const slugAvailable = await checkSlugAvailable(slug);

      if (!slugAvailable) {
        return errorResponse(ctx, 409, 'slug_exists', 'warn', 'WORKSPACE', { slug });
      }
    }

    const [updatedWorkspace] = await db
      .update(workspacesTable)
      .set({
        name,
        slug,
        organizationId: workspace.organizationId,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(workspacesTable.id, workspace.id))
      .returning();

    const memberships = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'WORKSPACE'), eq(membershipsTable.workspaceId, workspace.id)));

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
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'WORKSPACE', { workspace: id }));

    // Get members
    const workspaceMembers = await db
      .select({ id: membershipsTable.userId, workspaceId: membershipsTable.workspaceId })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'WORKSPACE'), inArray(membershipsTable.workspaceId, allowedIds)));

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
        sendSSEToUsers(membersId, 'remove_entity', { id, entity: 'WORKSPACE' });
      }

      logEvent('Workspace deleted', { workspace: id });
    }

    return ctx.json({ success: true, errors: errors }, 200);
  });

export default workspacesRoutes;
