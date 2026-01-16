import { xMiddleware } from '#/docs/x-middleware';
import { getContextUser, getContextUserSystemRole } from '#/lib/context';
import { AppError } from '#/lib/error';

/**
 * Middleware to check if user is a system admin based on their role.
 * Only allows users with 'admin' in their role to proceed.
 *
 * @param ctx - Request/response context.
 * @param next - The next middleware or route handler to call if the check passes.
 * @returns Error response or undefined if the user is allowed to proceed.
 */
export const isSystemAdmin = xMiddleware('isSystemAdmin', 'x-guard', async (_, next) => {
  const user = getContextUser();
  const userSystemRole = getContextUserSystemRole();

  if (userSystemRole !== 'admin') throw new AppError(403, 'no_sysadmin', 'warn', { meta: { user: user.id } });

  await next();
});
