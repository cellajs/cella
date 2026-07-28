import { appConfig } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findUserByUnsubscribeToken, updateNewsletter } from '#/modules/me/me-queries';
import { verifyUnsubscribeToken } from '#/utils/unsubscribe-token';

// The link is opened directly by the browser from an email, so failures redirect to a
// frontend error page (willRedirect + errorPagePath); the handler does not return a JSON body.
const errorPage = { willRedirect: true, meta: { errorPagePath: '/auth/error' } } as const;

export async function unsubscribeMeOp(ctx: AuthContext, token: string) {
  const user = await findUserByUnsubscribeToken(ctx, { token });
  // No matching row means the token was pruned by the 90-day partition retention (or never existed).
  if (!user) throw new AppError(404, 'unsubscribe_expired', 'warn', { entityType: 'user', ...errorPage });

  const isValid = verifyUnsubscribeToken(user.email, token);
  if (!isValid) throw new AppError(401, 'unsubscribe_failed', 'warn', { entityType: 'user', ...errorPage });

  await updateNewsletter(ctx, { userId: user.id, newsletter: false });

  return new URL('/auth/unsubscribed', appConfig.frontendUrl);
}
