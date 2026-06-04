import { appConfig } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findUserByUnsubscribeToken, updateNewsletter } from '#/modules/me/me-queries';
import { verifyUnsubscribeToken } from '#/utils/unsubscribe-token';

export async function unsubscribeMeOp(ctx: AuthContext, token: string) {
  const user = await findUserByUnsubscribeToken(ctx, { token });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  const isValid = verifyUnsubscribeToken(user.email, token);
  if (!isValid) throw new AppError(401, 'unsubscribe_failed', 'warn', { entityType: 'user' });

  await updateNewsletter(ctx, { userId: user.id, newsletter: false });

  return new URL('/auth/unsubscribed', appConfig.frontendUrl);
}
