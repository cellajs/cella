import type { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { type UnsubscribeCategory, verifyCategoryToken } from '#/modules/notification/helpers/category-token';
import { updatePreferences } from '#/modules/notification/notification-queries';
import type { updatePreferencesBodySchema } from '#/modules/notification/notification-schema';
import { findUserById, updateUser } from '#/modules/user/user-queries';

// Opened straight from an email client, so failures redirect to an error page, never JSON.
const errorPage = { willRedirect: true } as const;

/** The preference each notification category's link turns off. */
const disabledPreferences = {
  digest: { digest: 'off' },
  mention: { mentionEmail: false },
  comment: { commentEmail: false },
} satisfies Record<Exclude<UnsubscribeCategory, 'newsletter'>, z.infer<typeof updatePreferencesBodySchema>>;

interface UnsubscribeInput {
  userId: string;
  category: UnsubscribeCategory;
  token: string;
}

/**
 * Turn off one email category from an emailed link, without a session.
 *
 * The link carries the user id and a token that is an HMAC over `userId:category`, so holding the
 * link proves it was received in that user's mail and authorizes exactly that one category. The
 * newsletter is a flag on the user; the notification categories are email preferences.
 */
export async function unsubscribeNotificationsOp(ctx: DbContext, { userId, category, token }: UnsubscribeInput): Promise<URL> {
  if (!verifyCategoryToken(userId, category, token)) {
    throw new AppError(401, 'unsubscribe_failed', 'warn', { entityType: 'user', ...errorPage });
  }

  const user = await findUserById(ctx, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', ...errorPage });

  if (category === 'newsletter') {
    // The user acts through their own link.
    await updateUser(ctx, { id: user.id, values: { newsletter: false, ...updateStamps(user.id) } });
  } else {
    await updatePreferences(ctx, { userId: user.id, values: disabledPreferences[category] });
  }

  return new URL('/auth/unsubscribed', appConfig.frontendUrl);
}
