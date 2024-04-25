import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { workspacesTable } from '../../db/schema/workspaces';

import { createError, errorResponse, type ErrorType } from '../../lib/errors';
import { sendSSE } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { createWorkspaceRouteConfig, getWorkspaceByIdOrSlugRouteConfig, updateWorkspaceRouteConfig, deleteWorkspacesRouteConfig } from './routes';

const app = new CustomHono();

// * Workspace endpoints
const workspacesRoutes = app
  /*
   * Create workspace
   */
  .openapi(createWorkspaceRouteConfig, async (ctx) => {
    const { name, slug } = ctx.req.valid('json');
    const user = ctx.get('user');
    const organization = ctx.get('organization');

    const slugAvailable = await checkSlugAvailable(slug, 'WORKSPACE');

    if (!slugAvailable) {
      return errorResponse(ctx, 409, 'slug_exists', 'warn', 'WORKSPACE', { slug });
    }

    const [createdWorkspace] = await db
      .insert(workspacesTable)
      .values({
        organizationId: organization.id,
        name,
        slug,
      })
      .returning({
        id: workspacesTable.id,
      });

    logEvent('Workspace created', { workspace: createdWorkspace.id });

    await db.insert(membershipsTable).values({
      userId: user.id,
      workspaceId: createdWorkspace.id,
      type: 'WORKSPACE',
      role: 'ADMIN',
    });

    logEvent('User added to workspace', {
      user: user.id,
      workspace: createdWorkspace.id,
    });

    sendSSE(user.id, 'new_workspace_membership', {
      ...createdWorkspace,
      role: 'ADMIN',
      type: 'WORKSPACE',
    });

    return ctx.json({
      success: true,
      data: {
        ...createdWorkspace,
        role: 'ADMIN' as const,
      },
    });
  })

  /*
   * Get workspace by id or slug
   */
  .openapi(getWorkspaceByIdOrSlugRouteConfig, async (ctx) => {
    const user = ctx.get('user');
    const workspace = ctx.get('workspace');

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.workspaceId, workspace.id)));

    return ctx.json({
      success: true,
      data: {
        ...workspace,
        role: membership?.role || null,
      },
    });
  })

  /*
   * Update workspace
   */
  .openapi(updateWorkspaceRouteConfig, async (ctx) => {
    const user = ctx.get('user');
    const workspace = ctx.get('workspace');

    const { name, slug, organizationId } = ctx.req.valid('json');

    if (slug && slug !== workspace.slug) {
      const slugAvailable = await checkSlugAvailable(slug, 'WORKSPACE');

      if (!slugAvailable) {
        return errorResponse(ctx, 409, 'slug_exists', 'warn', 'WORKSPACE', { slug });
      }
    }

    const [updatedWorkspace] = await db
      .update(workspacesTable)
      .set({
        name,
        slug,
        organizationId,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(workspacesTable.id, workspace.id))
      .returning();

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.workspaceId, workspace.id)));

    if (membership) {
      sendSSE(user.id, 'update_workspace', {
        ...updatedWorkspace,
        role: membership.role,
        type: 'WORKSPACE',
      });
    }

    logEvent('Workspace updated', { workspace: updatedWorkspace.id });

    return ctx.json({
      success: true,
      data: {
        ...updatedWorkspace,
        role: membership?.role || null,
      },
    });
  })

  /*
   * Delete workspaces
   */
  .openapi(deleteWorkspacesRouteConfig, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const user = ctx.get('user');

    // * Convert the workspace ids to an array
    const workspaceIds = Array.isArray(ids) ? ids : [ids];

    const errors: ErrorType[] = [];

    // * Get the workspaces and the user role
    const targets = await db
      .select({
        workspace: workspacesTable,
        userRole: membershipsTable.role,
      })
      .from(workspacesTable)
      .leftJoin(membershipsTable, and(eq(membershipsTable.workspaceId, workspacesTable.id), eq(membershipsTable.userId, user.id)))
      .where(inArray(workspacesTable.id, workspaceIds));

    // * Check if the workspaces exist
    for (const id of workspaceIds) {
      if (!targets.some((target) => target.workspace.id === id)) {
        errors.push(
          createError(ctx, 404, 'not_found', 'warn', 'WORKSPACE', {
            workspace: id,
          }),
        );
      }
    }

    // * Filter out workspaces that the user doesn't have permission to delete
    const allowedTargets = targets.filter((target) => {
      const workspaceId = target.workspace.id;

      if (user.role !== 'ADMIN' && target.userRole !== 'ADMIN') {
        errors.push(
          createError(ctx, 403, 'delete_forbidden', 'warn', 'WORKSPACE', {
            workspace: workspaceId,
          }),
        );
        return false;
      }

      return true;
    });

    // * If the user doesn't have permission to delete any of the workspaces, return an error
    if (allowedTargets.length === 0) {
      return ctx.json({
        success: false,
        errors: errors,
      });
    }

    // * Delete the workspaces
    await db.delete(workspacesTable).where(
      inArray(
        workspacesTable.id,
        allowedTargets.map((target) => target.workspace.id),
      ),
    );

    // * Send SSE events for the workspaces that were deleted
    for (const { workspace, userRole } of allowedTargets) {
      // * Send the event to the user if they are a member of the workspace
      if (userRole) {
        sendSSE(user.id, 'remove_workspace', workspace);
      }

      logEvent('Workspace deleted', { workspace: workspace.id });
    }

    return ctx.json({
      success: true,
      errors: errors,
    });
  });

export default workspacesRoutes;

export type WorkspacesRoutes = typeof workspacesRoutes;
