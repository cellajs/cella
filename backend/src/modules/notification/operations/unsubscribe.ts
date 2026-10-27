import type { z } from '@hono/zod-openapi';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { type UnsubscribeCategory, verifyCategoryToken } from '#/modules/notification/helpers/category-token';
import { defaultDigestFrequency } from '#/modules/notification/notification-db';
import { updatePreferences } from '#/modules/notification/notification-queries';
import type { updatePreferencesBodySchema } from '#/modules/notification/notification-schema';
import { findUserById, updateUser } from '#/modules/user/user-queries';

type Preferences = z.infer<typeof updatePreferencesBodySchema>;

/** The preferences each notification category's link sets, off and back on. The digest comes back at its default. */
const categoryPreferences = {
  digest: (enabled) => ({ digest: enabled ? defaultDigestFrequency : 'off' }),
  mention: (enabled) => ({ mentionEmail: enabled }),
  comment: (enabled) => ({ commentEmail: enabled }),
} satisfies Record<Exclude<UnsubscribeCategory, 'newsletter'>, (enabled: boolean) => Preferences>;

interface EmailCategoryInput {
  userId: string;
  category: UnsubscribeCategory;
  token: string;
  /** False unsubscribes; true undoes it from the page that confirmed it. */
  enabled: boolean;
}

/**
 * Turns one email category off or back on from an emailed link, without a session. The link carries the user id and a
 * token that is an HMAC over `userId:category`, so holding it proves it was received in that user's mail and authorizes
 * exactly that one category. The newsletter is a flag on the user; the notification categories are email preferences.
 * @throws AppError 401 `unsubscribe_failed` for a token of another user or category, 404 `not_found` for a deleted user.
 */
export async function setEmailCategoryOp(ctx: DbContext, { userId, category, token, enabled }: EmailCategoryInput) {
  if (!verifyCategoryToken(userId, category, token)) throw new AppError(401, 'unsubscribe_failed', 'warn', { entityType: 'user' });

  const user = await findUserById(ctx, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  if (category === 'newsletter') {
    // The user acts through their own link.
    await updateUser(ctx, { id: user.id, values: { newsletter: enabled, ...updateStamps(user.id) } });
  } else {
    await updatePreferences(ctx, { userId: user.id, values: categoryPreferences[category](enabled) });
  }
}
