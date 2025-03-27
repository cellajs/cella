import { createMiddleware } from 'hono/factory';
import { type Env, getContextUser } from '#/lib/context';
import { errorResponse } from '#/lib/errors';

/**
 * Middleware to check if user is a system admin based on their role.
 * Only allows users with 'admin' in their role to proceed.
 *
 * @param ctx - Request/response context.
 * @param next - The next middleware or route handler to call if the check passes.
 * @returns Error response or undefined if the user is allowed to proceed.
 */
export const isSystemAdmin = createMiddleware<Env>(async (ctx, next): Promise<Response | undefined> => {
  const user = getContextUser();

  const isSystemAdmin = user?.role.includes('admin');
  if (!isSystemAdmin) return errorResponse(ctx, 403, 'no_sysadmin', 'warn', undefined, { user: user.id });

  await next();
});
