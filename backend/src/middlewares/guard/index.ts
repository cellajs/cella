import type { Context, MiddlewareHandler } from 'hono';
import isAuthenticated from './is-authenticated';
import isAllowedTo from './is-allowed-to';
import { errorResponse } from '../../lib/errors';

export { isAuthenticated };
export { isAllowedTo };

export const isSystemAdmin: MiddlewareHandler = async (ctx: Context, next) => {
  // Extract user
  const user = ctx.get('user');

  // TODO: Add more checks for system admin, such as IP address, 2FA etc.
  if (!user || !user.role.includes('ADMIN')) {
    return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id });
  }

  await next();
};

export const isPublicAccess: MiddlewareHandler = async (_, next) => {
  await next();
};
