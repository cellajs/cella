import type { Context, Next } from 'hono';
import { getContextUser, getMemberships } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { errorResponse } from '#/lib/errors';
import permissionManager from '#/lib/permission-manager';
export { isAuthenticated } from './is-authenticated';

// System admin is a user with the 'admin' role in the users table.
export async function isSystemAdmin(ctx: Context, next: Next): Promise<Response | undefined> {
  const user = getContextUser();

  const isSystemAdmin = user?.role.includes('admin');

  if (!isSystemAdmin) return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id });

  // TODO: Add more checks for system admin, such as IP address

  await next();
}

// Public access is a placeholder for routes accessible to everyone. Default rate limits apply.
export async function isPublicAccess(_: Context, next: Next): Promise<void> {
  await next();
}

// Organization access is a hard check for accessing organization-scoped routes.
export async function hasOrgAccess(ctx: Context, next: Next): Promise<Response | undefined> {
  const memberships = getMemberships();
  const orgIdOrSlug = ctx.req.param('orgIdOrSlug');

  if (!orgIdOrSlug) return errorResponse(ctx, 400, 'organization_missing', 'warn');

  // Find the organization by id or slug
  const organization = await resolveEntity('organization', orgIdOrSlug);

  if (!organization) return errorResponse(ctx, 404, 'not_found', 'warn', 'organization', { orgIdOrSlug });

  // Check if user is allowed to read organization
  const canReadOrg = permissionManager.isPermissionAllowed(memberships, 'read', organization);
  if (!canReadOrg) return errorResponse(ctx, 403, 'forbidden', 'warn', 'organization', { orgIdOrSlug });

  // Set organization with membership in context
  ctx.set('organization', organization);

  await next();
}
