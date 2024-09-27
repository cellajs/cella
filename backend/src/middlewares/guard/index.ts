import { and, eq, or } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { getContextUser } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
export { isAllowedTo } from './is-allowed-to';
export { isAuthenticated } from './is-authenticated';
export { splitByAllowance } from './split-by-allowance';

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
  const user = getContextUser();
  const orgIdOrSlug = ctx.req.param('orgIdOrSlug');

  if (!orgIdOrSlug) return errorResponse(ctx, 401, 'organization_scope_required', 'warn');

  // Find the organization by id or slug
  const [organization] = await db
    .select()
    .from(organizationsTable)
    .where(or(eq(organizationsTable.id, orgIdOrSlug), eq(organizationsTable.slug, orgIdOrSlug)));

  if (!organization) return errorResponse(ctx, 404, 'not_found', 'warn', 'organization', { orgIdOrSlug });

  // Check if the user is member of organization
  const membership = await db
    .select()
    .from(membershipsTable)
    .where(
      and(eq(membershipsTable.userId, user.id), eq(membershipsTable.organizationId, organization.id), eq(membershipsTable.type, 'organization')),
    );

  if (!membership) return errorResponse(ctx, 403, 'forbidden', 'warn', 'organization', { orgIdOrSlug });

  await next();
}
