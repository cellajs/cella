import * as Sentry from '@sentry/node';
import { eq } from 'drizzle-orm';
import { organizationsTable } from '#/db/schema/organizations';
import { xMiddleware } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';

/**
 * Middleware to ensure the user has access to an organization-scoped route.
 * Must run after tenantGuard to use tenant-scoped transaction with RLS.
 * Valid access for users that is a member of the organization or is a system admin.
 *
 * @param ctx - Request/response context with orgId URL parameter
 * @param next - The next middleware or route handler to call if the check passes
 * @returns Error response or continues to next handler with organization context set
 */
export const orgGuard = xMiddleware('orgGuard', 'x-guard', async (ctx, next) => {
  const orgId = ctx.req.param('orgId');
  if (!orgId) throw new AppError(400, 'invalid_request', 'error', { meta: { reason: 'Missing orgId parameter' } });

  const db = ctx.var.db;
  const memberships = ctx.var.memberships;
  const userSystemRole = ctx.var.userSystemRole;

  // Guard: tenantGuard must run before orgGuard to provide tenant-scoped db
  if (!db) {
    throw new AppError(500, 'server_error', 'error', { message: 'orgGuard requires tenantGuard middleware' });
  }

  // Guard: isAuthenticated must run before orgGuard to populate memberships
  if (memberships === undefined) {
    throw new AppError(500, 'server_error', 'error', { message: 'orgGuard requires isAuthenticated middleware' });
  }

  // Fetch organization by ID within tenant context (RLS filters by tenant)
  const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId));

  if (!organization) throw new AppError(404, 'not_found', 'warn', { entityType: 'organization' });

  // Check if user has access to organization (or is a system admin)
  const orgMembership =
    memberships.find((m) => m.organizationId === organization.id && m.contextType === 'organization') || null;
  if (userSystemRole !== 'admin' && !orgMembership) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization' });
  }
  const orgWithMembership = { ...organization, membership: orgMembership };

  // Set organization with membership (can be null for system admins!) in context
  ctx.set('organization', orgWithMembership);

  Sentry.setTag('organization_id', orgWithMembership.id);
  Sentry.setTag('organization_slug', orgWithMembership.slug);

  await next();
});
