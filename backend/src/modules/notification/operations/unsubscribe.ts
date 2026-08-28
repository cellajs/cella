import { eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { usersTable } from '#/modules/user/user-db';
import { type UnsubscribeCategory, verifyCategoryToken } from '../helpers/category-token';
import { findOrCreatePreferences, updatePreferences } from '../notification-queries';

// Opened straight from an email client, so failures redirect to an error page, never JSON.
const errorPage = { willRedirect: true, meta: { errorPagePath: '/auth/error' } } as const;

/** Turning the digest off is a frequency change; the other two are booleans. */
const disableFor = (category: UnsubscribeCategory) =>
  category === 'digest'
    ? { digest: 'off' as const }
    : category === 'mention'
      ? { mentionEmail: false }
      : { commentEmail: false };

/**
 * Turn off one email category from an emailed link, without a session.
 *
 * The link carries the user id and a token that is an HMAC over `userId:category`, so holding the
 * link proves it was received in that user's mail and authorises exactly that one category.
 */
export async function unsubscribeNotificationsOp(
  userId: string,
  category: UnsubscribeCategory,
  token: string,
): Promise<URL> {
  if (!verifyCategoryToken(userId, category, token)) {
    throw new AppError(401, 'unsubscribe_failed', 'warn', { entityType: 'user', ...errorPage });
  }

  const [user] = await baseDb.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', ...errorPage });

  const dbCtx = { var: { db: baseDb } };
  await findOrCreatePreferences(dbCtx, user.id);
  await updatePreferences(dbCtx, user.id, disableFor(category));

  return new URL('/auth/unsubscribed', appConfig.frontendUrl);
}
