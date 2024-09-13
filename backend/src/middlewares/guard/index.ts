import type { Context, MiddlewareHandler } from 'hono';
import { getContextUser } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
import isAllowedTo from './is-allowed-to';
import isAuthenticated from './is-authenticated';
import splitByAllowance from './split-by-allowance';

export { isAllowedTo, isAuthenticated, splitByAllowance };

export const isSystemAdmin: MiddlewareHandler = async (ctx: Context, next) => {
  // Extract user
  const user = getContextUser();

  // TODO: Add more checks for system admin, such as IP address, 2FA etc.
  if (!user || !user.role.includes('admin')) {
    return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id });
  }

  await next();
};

export const isPublicAccess: MiddlewareHandler = async (_, next) => {
  await next();
};
