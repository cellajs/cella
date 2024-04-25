import { and, eq, or } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { db } from '../../db/db';
import { membershipsTable, type MembershipModel } from '../../db/schema/memberships';
import { type OrganizationModel, organizationsTable } from '../../db/schema/organizations';
import { errorResponse } from '../../lib/errors';
import type { Env } from '../../types/common';
import { logEvent } from '../logger/log-event';
import { type WorkspaceModel, workspacesTable } from '../../db/schema/workspaces';
import { mustBeUUID } from '../../lib/uuid';

function isOrganization(entity: OrganizationModel | WorkspaceModel): entity is OrganizationModel {
  return !('organizationId' in entity);
}

function isWorkspace(entity: OrganizationModel | WorkspaceModel): entity is WorkspaceModel {
  return 'organizationId' in entity;
}

export const getOrganization = async (idOrSlug: string) => {
  const [organization] = await db
    .select()
    .from(organizationsTable)
    .where(or(eq(organizationsTable.id, mustBeUUID(idOrSlug)), eq(organizationsTable.slug, idOrSlug)));

  return organization;
};

export const getWorkspace = async (idOrSlug: string) => {
  const [workspace] = await db
    .select()
    .from(workspacesTable)
    .where(or(eq(workspacesTable.id, mustBeUUID(idOrSlug)), eq(workspacesTable.slug, idOrSlug)));

  return workspace;
};

// tenant() is checking if the user has membership in the organization and if the user has the required role
const tenant =
  // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
    (paramName: string, type: 'ORGANIZATION' | 'WORKSPACE' | 'ANY', accessibleFor?: MembershipModel['role'][]): MiddlewareHandler<Env, any> =>
    async (ctx, next) => {
      // const body = ctx.req.header('content-type') === 'application/json' ? ((await ctx.req.raw.clone().json()) as any) : undefined;
      const idOrSlug = ctx.req.param(paramName)?.toLowerCase();
      const user = ctx.get('user');

      if (!idOrSlug || !user) {
        return await next();
      }

      let entity: OrganizationModel | WorkspaceModel;

      if (type === 'WORKSPACE') {
        entity = await getWorkspace(idOrSlug);
      } else if (type === 'ORGANIZATION') {
        entity = await getOrganization(idOrSlug);
      } else {
        entity = (await getOrganization(idOrSlug)) || (await getWorkspace(idOrSlug));
      }

      if (!entity) {
        const resourceType = type === 'ANY' ? 'UNKNOWN' : type;
        return errorResponse(ctx, 404, 'not_found', 'warn', resourceType, { idOrSlug });
      }

      if (isWorkspace(entity)) {
        ctx.set('workspace', entity);
      } else if (isOrganization(entity)) {
        ctx.set('organization', entity);
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
