import type { Context, Next } from 'hono';
import { getContextMemberships, getContextUser } from '#/lib/context';
export { isAuthenticated } from './is-authenticated';

import { every } from 'hono/combine';
import { ipRestriction } from 'hono/ip-restriction';
import { errorResponse } from '#/lib/errors';

import { eq, or } from 'drizzle-orm';
import { db } from '#/db/db';
import { organizationsTable } from '#/db/schema/organizations';
import { getIp } from '#/utils/get-ip';
import { env } from './../../../env';

const allowList = env.REMOTE_SYSTEM_ACCESS_IP.split(',') || [];

/**
 * Middleware to check if user is a system admin based on their role.
 * Only allows users with 'admin' in their role to proceed.
 *
 * @param ctx - Request/response context.
 * @param next - The next middleware or route handler to call if the check passes.
 * @returns Error response or undefined if the user is allowed to proceed.
 */
export async function isSystemAdmin(ctx: Context, next: Next): Promise<Response | undefined> {
  const user = getContextUser();

  const isSystemAdmin = user?.role.includes('admin');
  if (!isSystemAdmin) return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id });

  await next();
}

/**
 * Middleware that combines system admin check with IP restriction.
 * Uses `every` function from Hono to ensure both system admin check and IP restriction are passed.
 *
 * @returns Error response or undefined if the user is allowed to proceed.
 */
export const systemGuard = every(
  isSystemAdmin,
  ipRestriction(getIp, { allowList }, async (_, c) => {
    return errorResponse(c, 422, 'forbidden', 'warn', undefined);
  }),
);

/**
 * Middleware for routes that are publicly accessible.
 * This is a required placeholder for routes that can be accessed by anyone.
 *
 * @param _ - Request context (unused here, but required by Hono middleware signature).
 * @param next - The next middleware or route handler.
 */
export async function isPublicAccess(_: Context, next: Next): Promise<void> {
  await next();
}

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
  if (!orgIdOrSlug) return errorResponse(ctx, 400, 'invalid_request', 'warn');

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
