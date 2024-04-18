import { and, eq, or } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { db } from '../../db/db';
import { membershipsTable, type MembershipModel } from '../../db/schema/memberships';
import { type OrganizationModel, organizationsTable } from '../../db/schema/organizations';
import { errorResponse } from '../../lib/errors';
import type { Env } from '../../types/common';
import { logEvent } from '../logger/log-event';
import { type WorkspaceModel, workspacesTable } from '../../db/schema/workspaces';

// tenant() is checking if the user has membership in the organization and if the user has the required role
const tenant =
  (accessibleFor?: MembershipModel['role'][]): MiddlewareHandler<Env, ':idOrSlug?'> =>
  async (ctx, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
    const body = ctx.req.header('content-type') === 'application/json' ? ((await ctx.req.raw.clone().json()) as any) : undefined;
    const idOrSlug = (ctx.req.param('idOrSlug') || body?.idOrSlug)?.toLowerCase();
    const type = ctx.req.path.split('/')[1] === 'workspaces' ? 'workspace' : 'organization';
    const user = ctx.get('user');

    if (!idOrSlug || !type || !user) {
      return await next();
    }

    let entity: OrganizationModel | WorkspaceModel;

    if (type === 'workspace') {
      [entity] = await db
        .select()
        .from(workspacesTable)
        .where(or(eq(workspacesTable.id, idOrSlug), eq(workspacesTable.slug, idOrSlug)));

      if (entity) {
        ctx.set('workspace', entity);
      }
    } else {
      [entity] = await db
        .select()
        .from(organizationsTable)
        .where(or(eq(organizationsTable.id, idOrSlug), eq(organizationsTable.slug, idOrSlug)));

      if (entity) {
        ctx.set('organization', entity);
      }
    }

    if (!entity) {
      // t('common:error.resource_not_found.text', { resource: 'organization' })
      return errorResponse(ctx, 404, 'not_found', 'warn', type, { idOrSlug });
    }

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(
        and(eq(membershipsTable.userId, user.id), or(eq(membershipsTable.organizationId, entity.id), eq(membershipsTable.workspaceId, entity.id))),
      );

    if ((!membership || (accessibleFor && !accessibleFor.includes(membership.role))) && user.role !== 'ADMIN') {
      return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id, idOrSlug, type });
    }

    logEvent(`User authenticated in ${type}`, { user: user.id, idOrSlug, type });

    await next();
  };

export default tenant;
