import { and, eq, or } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { db } from '../../db/db';
import { type MembershipModel, membershipsTable } from '../../db/schema/memberships';
import { organizationsTable } from '../../db/schema/organizations';
import { errorResponse } from '../../lib/errors';
import type { Env } from '../../types/common';
import { logEvent } from '../logger/log-event';

// tenant() is checking if the user has membership in the organization and if the user has the required role
const tenant =
  (accessibleFor?: MembershipModel['role'][]): MiddlewareHandler<Env, ':organizationIdentifier?'> =>
  async (ctx, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
    const body = ctx.req.header('content-type') === 'application/json' ? ((await ctx.req.raw.clone().json()) as any) : undefined;
    const organizationIdentifier = (ctx.req.param('organizationIdentifier') || body?.organizationIdentifier)?.toLowerCase();
    const user = ctx.get('user');

    if (!organizationIdentifier) {
      return await next();
    }

    const [organization] = await db
      .select()
      .from(organizationsTable)
      .where(or(eq(organizationsTable.id, organizationIdentifier), eq(organizationsTable.slug, organizationIdentifier)));

    if (!organization) {
      // t('common:error.resource_not_found.text', { resource: 'organization' })
      return errorResponse(ctx, 404, 'not_found', 'warn', 'organization', { organization: organizationIdentifier });
    }

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.organizationId, organization.id)));

    if ((!membership || (accessibleFor && !accessibleFor.includes(membership.role))) && user.role !== 'ADMIN') {
      return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id, organization: organization.id });
    }

    ctx.set('organization', organization);

    logEvent('User authenticated in organization', { user: user.id, organization: organization.id });

    await next();
  };

export default tenant;
