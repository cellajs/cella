import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { workspacesTable } from '../../db/schema/workspaces';

import { type ErrorType, createError, errorResponse } from '../../lib/errors';
import { sendSSEToUsers } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { createWorkspaceRouteConfig, deleteWorkspacesRouteConfig, getWorkspaceRouteConfig, updateWorkspaceRouteConfig } from './routes';

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

    await db.insert(membershipsTable).values({
      userId: user.id,
      organizationId,
      workspaceId: workspace.id,
      type: 'WORKSPACE',
      role: 'ADMIN',
    });

    logEvent('User added to workspace', { user: user.id, workspace: workspace.id });

    sendSSEToUsers([user.id], 'create_entity', { role: 'ADMIN', ...workspace});

    return ctx.json(
      {
        success: true,
        data: {
          ...workspace,
          role: 'ADMIN' as const,
        },
      },
      200,
    );
  })

  /*
   * Get workspace by id or slug
   */
  .openapi(getWorkspaceRouteConfig, async (ctx) => {
    const user = ctx.get('user');
    const workspace = ctx.get('workspace');

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.workspaceId, workspace.id)));

    return ctx.json(
      {
        success: true,
        data: {
          ...workspace,
          role: membership?.role || null,
        },
      },
      200,
    );
  })

  /*
   * Update workspace
   */
  .openapi(updateWorkspaceRouteConfig, async (ctx) => {
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
      const membersId = memberships.map((member) => member.id);
      sendSSEToUsers(membersId, 'update_entity', updatedWorkspace);
    }

    logEvent('Workspace updated', { workspace: updatedWorkspace.id });

    return ctx.json(
      {
        success: true,
        data: {
          ...updatedWorkspace,
          role: memberships.find((member) => member.id === user.id)?.role || null,
        },
      },
      200,
    );
  })

  /*
   * Delete workspaces
   */
  .openapi(deleteWorkspacesRouteConfig, async (ctx) => {
    // * Extract allowed and disallowed ids
    const allowedIds = ctx.get('allowedIds');
    const disallowedIds = ctx.get('disallowedIds');

    // * Map errors of workspaces user is not allowed to delete
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'WORKSPACE', { workspace: id }));

    // * Get members
    const workspaceMembers = await db
      .select({ id: membershipsTable.userId, workspaceId: membershipsTable.workspaceId })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.type, 'WORKSPACE'), inArray(membershipsTable.workspaceId, allowedIds)));

    // * Delete the workspaces
    await db.delete(workspacesTable).where(inArray(workspacesTable.id, allowedIds));

    // * Send SSE events for the workspaces that were deleted
    for (const id of allowedIds) {
      // * Send the event to the user if they are a member of the workspace
      if (workspaceMembers.length > 0) {
        const membersId = workspaceMembers
          .filter(({ workspaceId }) => workspaceId === id)
          .map((member) => member.id)
          .filter(Boolean) as string[];
        sendSSEToUsers(membersId, 'remove_entity', { id, type: 'WORKSPACE' });
      }

      logEvent('Workspace deleted', { workspace: id });
    }

    return ctx.json({ success: true, errors: errors }, 200);
  });

export default workspacesRoutes;

export type WorkspacesRoutes = typeof workspacesRoutes;
