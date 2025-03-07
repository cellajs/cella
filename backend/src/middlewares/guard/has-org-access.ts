import type { Context, Next } from 'hono';
import { getContextMemberships, getContextUser } from '#/lib/context';
export { isAuthenticated } from './is-authenticated';

import { errorResponse } from '#/lib/errors';

import { eq, or } from 'drizzle-orm';
import { db } from '#/db/db';
import { organizationsTable } from '#/db/schema/organizations';

/**
 * Middleware to ensure the user has access to an organization-scoped route.
 * Valid access for users that is a member of the organization or is a system admin.
 *
 * @param ctx - Request/response context, which includes the `orgIdOrSlug` parameter.
 * @param next - The next middleware or route handler to call if the check passes.
 * @returns Error response or undefined if the user is allowed to proceed.
 */
export async function hasOrgAccess(ctx: Context, next: Next): Promise<Response | undefined> {
  const orgIdOrSlug = ctx.req.param('orgIdOrSlug');
  if (!orgIdOrSlug) return errorResponse(ctx, 400, 'invalid_request', 'error');

  const memberships = getContextMemberships();
  const user = getContextUser();
  const isSystemAdmin = user.role === 'admin';

  // Fetch organization
  const idOrSlugFilter = or(eq(organizationsTable.id, orgIdOrSlug), eq(organizationsTable.slug, orgIdOrSlug));
  const [organization] = await db.select().from(organizationsTable).where(idOrSlugFilter);

  if (!organization) return errorResponse(ctx, 404, 'not_found', 'warn', 'organization');

  // Check if user has access to organization (or is a system admin)
  const orgMembership = memberships.find((m) => m.organizationId === organization.id && m.type === 'organization') || null;
  if (!isSystemAdmin && !orgMembership) return errorResponse(ctx, 403, 'forbidden', 'warn', 'organization');

  const orgWithMembership = { ...organization, membership: orgMembership };

  // Set organization with membership (can be null for system admins!) in context
  ctx.set('organization', orgWithMembership);

  await next();
}
