import { and, eq, or } from 'drizzle-orm';
import { MiddlewareHandler } from 'hono';
import { getI18n } from 'i18n';
import { db } from '../../db/db';
import { MembershipModel, membershipsTable, organizationsTable } from '../../db/schema';
import { customLogger } from '../../lib/custom-logger';
import { createError, forbiddenError } from '../../lib/errors';
import { Env, ErrorResponse } from '../../types/common';

const i18n = getI18n('backend');

// organizationAuthMiddleware() is checking if the user has membership in the organization and if the user has the required role
const organizationAuthMiddleware =
  (accessibleFor?: MembershipModel['role'][]): MiddlewareHandler<Env, ':organizationIdentifier'> =>
  async (ctx, next) => {
    const organizationIdentifier = ctx.req.param('organizationIdentifier').toLowerCase();
    const user = ctx.get('user');

    const [organization] = await db
      .select()
      .from(organizationsTable)
      .where(or(eq(organizationsTable.id, organizationIdentifier), eq(organizationsTable.slug, organizationIdentifier)));

    if (!organization) {
      customLogger('Organization not found', { organizationIdentifier });

      return ctx.json<ErrorResponse>(createError(i18n, 'error.organization_not_found', 'Organization not found'), 404);
    }

    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, user.id), eq(membershipsTable.organizationId, organization.id)));

    if ((!membership || (accessibleFor && !accessibleFor.includes(membership.role))) && user.role !== 'ADMIN') {
      customLogger('User forbidden in organization', {
        userId: user.id,
        organizationId: organization.id,
      });

      return ctx.json<ErrorResponse>(forbiddenError(i18n), 403);
    }

    ctx.set('organization', organization);

    customLogger('User authenticated in organization', {
      userId: user.id,
      organizationId: organization.id,
    });

    await next();
  };

export default organizationAuthMiddleware;
