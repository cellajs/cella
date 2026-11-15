import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findSystemRole } from '#/modules/system/system-queries';
import { findUserById } from '#/modules/user/user-queries';

/**
 * The user a system administrator may recover: not themselves (the account page is theirs), and not another system
 * administrator. One compromised administrator then cannot strip the others.
 * @throws AppError 404 when no user has the id, 400 `invalid_request` for the administrator's own account, 403 `forbidden`
 *   for another system administrator.
 */
export const findRecoveryTarget = async (ctx: UserContext, userId: string) => {
  const user = await findUserById(ctx, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });
  if (user.id === ctx.var.user.id) throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'own_account' } });
  if (await findSystemRole(ctx, { userId, role: 'admin' })) throw new AppError(403, 'forbidden', 'warn', { meta: { reason: 'system_admin' } });
  return user;
};
