import type { Context, Next } from 'hono';
import { getContextUser, getMemberships } from '#/lib/context';
export { isAuthenticated } from './is-authenticated';

import { getConnInfo } from '@hono/node-server/conninfo';
import { every } from 'hono/combine';
import { ipRestriction } from 'hono/ip-restriction';
import { errorResponse } from '#/lib/errors';

import { eq, or } from 'drizzle-orm';
import { db } from '#/db/db';
import { organizationsTable } from '#/db/schema/organizations';
import { env } from './../../../env';

const allowList = env.REMOTE_SYSTEM_ACCESS_IP.split(',') || [];

// System admin is a user with the 'admin' role in the users table.
export async function isSystemAdmin(ctx: Context, next: Next): Promise<Response | undefined> {
  const user = getContextUser();

  const isSystemAdmin = user?.role.includes('admin');
  if (!isSystemAdmin) return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id });

  await next();
}

// Combine system admin check with IP restriction.
export const systemGuard = every(
  isSystemAdmin,
  ipRestriction(getConnInfo, { allowList }, async (_, c) => {
    return errorResponse(c, 422, 'forbidden', 'warn', undefined);
  }),
);

// Public access is a placeholder for routes accessible to everyone. Default rate limits still apply.
export async function isPublicAccess(_: Context, next: Next): Promise<void> {
  await next();
}

// Organization access is a hard check for accessing organization-scoped routes.
export async function hasOrgAccess(ctx: Context, next: Next): Promise<Response | undefined> {
  const orgIdOrSlug = ctx.req.param('orgIdOrSlug');
  if (!orgIdOrSlug) return errorResponse(ctx, 400, 'invalid_request', 'warn');

  const memberships = getMemberships();
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
