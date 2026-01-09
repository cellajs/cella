import * as Sentry from '@sentry/node';
import { eq, or } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { db } from '#/db/db';
import { organizationsTable } from '#/db/schema/organizations';
import { type Env, getContextMemberships, getContextUserSystemRole } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { registerMiddlewareDescription } from '#/lib/openapi-describer';

/**
 * Middleware to ensure the user has access to an organization-scoped route.
 * Valid access for users that is a member of the organization or is a system admin.
 *
 * @param ctx - Request/response context, which includes the `orgIdOrSlug` parameter.
 * @param next - The next middleware or route handler to call if the check passes.
 * @returns Error response or undefined if the user is allowed to proceed.
 */

export const hasOrgAccess: MiddlewareHandler<Env> = createMiddleware<Env>(async (ctx, next) => {
  const orgIdOrSlug = ctx.req.param('orgIdOrSlug');
  if (!orgIdOrSlug) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

  const memberships = getContextMemberships();
  const userSystemRole = getContextUserSystemRole();

  // Fetch organization
  const idOrSlugFilter = or(eq(organizationsTable.id, orgIdOrSlug), eq(organizationsTable.slug, orgIdOrSlug));
  const [organization] = await db.select().from(organizationsTable).where(idOrSlugFilter);

  if (!organization)
    throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'organization' });

  // Check if user has access to organization (or is a system admin)
  const orgMembership =
    memberships.find((m) => m.organizationId === organization.id && m.contextType === 'organization') || null;
  if (userSystemRole !== 'admin' && !orgMembership) {
    throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', entityType: 'organization' });
  }
  const orgWithMembership = { ...organization, membership: orgMembership };

  // Set organization with membership (can be null for system admins!) in context
  ctx.set('organization', orgWithMembership);
  Sentry.setTag('organization_id', orgWithMembership.id);
  Sentry.setTag('organization_slug', orgWithMembership.slug);

  await next();
});

/**
 * Registers the `hasOrgAccess` middleware for OpenAPI documentation.
 * This allows the middleware to be recognized and described in the API documentation.
 */
registerMiddlewareDescription({
  name: 'hasOrgAccess',
  middleware: hasOrgAccess,
  category: 'guard',
  scopes: ['org'],
});
