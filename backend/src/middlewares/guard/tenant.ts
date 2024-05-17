import { SQL, and, eq, or } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { db } from '../../db/db';
import { membershipsTable, type MembershipModel } from '../../db/schema/memberships';
import { type OrganizationModel, organizationsTable } from '../../db/schema/organizations';
import { errorResponse } from '../../lib/errors';
import type { Env } from '../../types/common';
import { logEvent } from '../logger/log-event';
import { type WorkspaceModel, workspacesTable } from '../../db/schema/workspaces';
import { type ProjectModel, projectsTable } from '../../db/schema/projects';

type Entity = OrganizationModel | WorkspaceModel | ProjectModel;

function isOrganization(entity: Entity): entity is OrganizationModel {
  return !('organizationId' in entity);
}

function isWorkspace(entity: Entity): entity is WorkspaceModel {
  return 'organizationId' in entity;
}

function isProject(entity: Entity): entity is ProjectModel {
  return 'workspaceId' in entity;
}

export const getOrganization = async (idOrSlug: string) => {
  const [organization] = await db
    .select()
    .from(organizationsTable)
    .where(or(eq(organizationsTable.id, idOrSlug), eq(organizationsTable.slug, idOrSlug)));

  return organization;
};

export const getWorkspace = async (idOrSlug: string) => {
  const [workspace] = await db
    .select()
    .from(workspacesTable)
    .where(or(eq(workspacesTable.id, idOrSlug), eq(workspacesTable.slug, idOrSlug)));

  return workspace;
};

export const getProject = async (idOrSlug: string) => {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(or(eq(projectsTable.id, idOrSlug), eq(projectsTable.slug, idOrSlug)));

  return project;
};

// tenant() is checking if the user has membership in the organization and if the user has the required role
const tenant =
  (
    paramName: string,
    type: 'ORGANIZATION' | 'WORKSPACE' | 'PROJECT' | 'ANY',
    accessibleFor?: MembershipModel['role'][],
    // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
  ): MiddlewareHandler<Env, any> =>
  async (ctx, next) => {
    // const body = ctx.req.header('content-type') === 'application/json' ? ((await ctx.req.raw.clone().json()) as any) : undefined;
    const idOrSlug = ctx.req.param(paramName)?.toLowerCase() || ctx.req.query(paramName)?.toLowerCase();
    const user = ctx.get('user');

    if (!idOrSlug || !user) {
      return await next();
    }

    let entity: OrganizationModel | WorkspaceModel | ProjectModel;

    if (type === 'ORGANIZATION') {
      entity = await getOrganization(idOrSlug);
    } else if (type === 'WORKSPACE') {
      entity = await getWorkspace(idOrSlug);
    } else if (type === 'PROJECT') {
      entity = await getProject(idOrSlug);
    } else {
      entity = (await getOrganization(idOrSlug)) || (await getWorkspace(idOrSlug));
    }

    if (!entity) {
      const resourceType = type === 'ANY' ? 'UNKNOWN' : type;
      return errorResponse(ctx, 404, 'not_found', 'warn', resourceType, { idOrSlug });
    }

    let filter: SQL;
    if (isOrganization(entity)) {
      ctx.set('organization', entity);
      filter = eq(membershipsTable.organizationId, entity.id);
    } else if (isWorkspace(entity)) {
      ctx.set('workspace', entity);
      filter = eq(membershipsTable.workspaceId, entity.id);
    } else if (isProject(entity)) {
      ctx.set('project', entity);
      filter = eq(membershipsTable.projectId, entity.id);
    } else {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'UNKNOWN', { idOrSlug });
    }

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.userId, user.id),
          filter,
        ),
      );

    if ((!membership || (accessibleFor && !accessibleFor.includes(membership.role))) && user.role !== 'ADMIN') {
      return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id, idOrSlug, type });
    }

    logEvent(`User authenticated in ${type}`, { user: user.id, idOrSlug, type });

    await next();
  };

export default tenant;
