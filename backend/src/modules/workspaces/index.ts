import { and, eq } from 'drizzle-orm';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { workspacesTable } from '../../db/schema/workspaces';

import { errorResponse } from '../../lib/errors';
import { sendSSE } from '../../lib/sse';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import { checkSlugAvailable } from '../general/helpers/check-slug';
import { createWorkspaceRouteConfig, getWorkspaceByIdOrSlugRouteConfig } from './routes';

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

    const slugAvailable = await checkSlugAvailable(slug);

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
      .returning();

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
  });

export default workspacesRoutes;

export type WorkspacesRoutes = typeof workspacesRoutes;
