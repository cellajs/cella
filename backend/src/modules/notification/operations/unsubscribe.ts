import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { updateUser } from '#/modules/system/system-queries';
import { findUserById } from '#/modules/user/user-queries';
import { type UnsubscribeCategory, verifyCategoryToken } from '../helpers/category-token';
import { findOrCreatePreferences, updatePreferences } from '../notification-queries';

// Opened straight from an email client, so failures redirect to an error page, never JSON.
const errorPage = { willRedirect: true, meta: { errorPagePath: '/auth/error' } } as const;

/** Turning the digest off is a frequency change; the other two are booleans. */
const disableFor = (category: Exclude<UnsubscribeCategory, 'newsletter'>) =>
  category === 'digest' ? { digest: 'off' as const } : category === 'mention' ? { mentionEmail: false } : { commentEmail: false };

/**
 * Turn off one email category from an emailed link, without a session.
 *
 * The link carries the user id and a token that is an HMAC over `userId:category`, so holding the
 * link proves it was received in that user's mail and authorises exactly that one category. The
 * newsletter is a flag on the user; the notification categories are email preferences.
 */
export async function unsubscribeNotificationsOp(userId: string, category: UnsubscribeCategory, token: string): Promise<URL> {
  if (!verifyCategoryToken(userId, category, token)) {
    throw new AppError(401, 'unsubscribe_failed', 'warn', { entityType: 'user', ...errorPage });
  }

  const dbCtx = { var: { db: baseDb } };
  const user = await findUserById(dbCtx, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', ...errorPage });

  if (category === 'newsletter') {
    await updateUser(dbCtx, { id: user.id, values: { newsletter: false } });
  } else {
    await findOrCreatePreferences(dbCtx, { userId: user.id });
    await updatePreferences(dbCtx, { userId: user.id, values: disableFor(category) });
  }

  return new URL('/auth/unsubscribed', appConfig.frontendUrl);
}
