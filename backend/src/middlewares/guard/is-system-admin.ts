import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { type Env, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { registerMiddlewareDescription } from '#/lib/openapi-describer';

/**
 * Middleware to check if user is a system admin based on their role.
 * Only allows users with 'admin' in their role to proceed.
 *
 * @param ctx - Request/response context.
 * @param next - The next middleware or route handler to call if the check passes.
 * @returns Error response or undefined if the user is allowed to proceed.
 */
export const isSystemAdmin: MiddlewareHandler<Env> = createMiddleware<Env>(async (_, next) => {
  const user = getContextUser();

  const isSystemAdmin = user?.role.includes('admin');
  if (!isSystemAdmin) throw new AppError({ status: 403, type: 'no_sysadmin', severity: 'warn', meta: { user: user.id } });

  await next();
});

/**
 * Registers the `isSystemAdmin` middleware for OpenAPI documentation.
 * This allows the middleware to be recognized and described in the API documentation.
 */
registerMiddlewareDescription({
  name: 'isSystemAdmin',
  middleware: isSystemAdmin,
  category: 'auth',
  scopes: ['system'],
});
