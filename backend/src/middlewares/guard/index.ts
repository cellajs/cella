import type { Context, Next } from 'hono';
import { getContextUser } from '#/lib/context';
import { getValidEntity } from '#/lib/permission-manager';
export { isAuthenticated } from './is-authenticated';

import { getConnInfo } from '@hono/node-server/conninfo';
import { every } from 'hono/combine';
import { ipRestriction } from 'hono/ip-restriction';
import { errorResponse } from '#/lib/errors';

import { config } from 'config';
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

  if (!orgIdOrSlug) return errorResponse(ctx, 400, 'organization_missing', 'warn');

  if (!config.contextEntityTypes.includes('organization')) {
    return errorResponse(ctx, 403, 'forbidden', 'warn');
  }

  const { entity, isAllowed } = await getValidEntity('organization', 'read', orgIdOrSlug);

  if (!entity || !isAllowed) {
    return errorResponse(ctx, 403, 'forbidden', 'warn');
  }

  // Set organization with membership in context
  ctx.set('organization', entity);

  await next();
}
