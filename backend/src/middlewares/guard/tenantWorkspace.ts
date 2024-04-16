import { and, eq, or } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { db } from '../../db/db';
import { type WorkspaceMembershipModel, workspaceMembershipsTable } from '../../db/schema/workspaceMembership';
import { errorResponse } from '../../lib/errors';
import type { Env } from '../../types/common';
import { logEvent } from '../logger/log-event';
import { workspacesTable } from '../../db/schema/workspaces';

// tenantWorkspace() is checking if the user has membership in the workspace and if the user has the required role
const tenantWorkspace =
  (accessibleFor?: WorkspaceMembershipModel['role'][]): MiddlewareHandler<Env, ':workspaceIdentifier?'> =>
  async (ctx, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
    const body = ctx.req.header('content-type') === 'application/json' ? ((await ctx.req.raw.clone().json()) as any) : undefined;
    const workspaceIdentifier = (ctx.req.param('workspaceIdentifier') || body?.workspaceIdentifier)?.toLowerCase();
    const user = ctx.get('user');

    if (!workspaceIdentifier) {
      return await next();
    }

    const [workspace] = await db
      .select()
      .from(workspacesTable)
      .where(or(eq(workspacesTable.id, workspaceIdentifier), eq(workspacesTable.slug, workspaceIdentifier)));

    if (!workspace) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'workspace', { workspace: workspaceIdentifier });
    }

    const [membership] = await db
      .select()
      .from(workspaceMembershipsTable)
      .where(and(eq(workspaceMembershipsTable.userId, user.id), eq(workspaceMembershipsTable.workspaceId, workspace.id)));

    if ((!membership || (accessibleFor && !accessibleFor.includes(membership.role))) && user.role !== 'ADMIN') {
      return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id, organization: workspace.id });
    }

    ctx.set('workspace', workspace);

    logEvent('User authenticated in workspace', { user: user.id, workspace: workspace.id });

    await next();
  };

export default tenantWorkspace;
