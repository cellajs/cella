import { xMiddleware } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';

/**
 * Middleware to check if user is a system admin based on their role.
 * Only allows users with 'admin' in their role to proceed.
 *
 * @param ctx - Request/response context.
 * @param next - The next middleware or route handler to call if the check passes.
 * @returns Error response or undefined if the user is allowed to proceed.
 */
export const sysAdminGuard = xMiddleware('sysAdminGuard', 'x-guard', async (ctx, next) => {
  const user = ctx.var.user;
  const userSystemRole = ctx.var.userSystemRole;

  if (userSystemRole !== 'admin') throw new AppError(403, 'no_sysadmin', 'warn', { meta: { user: user.id } });

  await next();
});
