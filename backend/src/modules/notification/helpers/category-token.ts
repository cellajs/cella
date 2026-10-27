import { createHmac } from 'node:crypto';
import { appConfig } from 'shared';
import { safeEqual } from 'shared/utils/safe-equal';
import { modeSecret } from '#/env';

/** The email categories an unsubscribe link turns off, one category per link. */
export const unsubscribeCategories = ['digest', 'mention', 'comment', 'newsletter'] as const;
export type UnsubscribeCategory = (typeof unsubscribeCategories)[number];

/**
 * HMAC over the user id and the category. The user id, not the email, so the link carries an opaque identifier and
 * keeps working after an email change.
 */
const generateCategoryToken = (userId: string, category: UnsubscribeCategory) =>
  createHmac('sha256', modeSecret('UNSUBSCRIBE_SECRET')).update(`${userId}:${category}`, 'utf8').digest('hex');

/**
 * Whether `token` is this user's token for this category, compared in constant time. The category is bound into the
 * HMAC, so "stop the weekly digest" cannot also stop mention emails or the newsletter.
 */
export const verifyCategoryToken = (userId: string, category: UnsubscribeCategory, token: string) =>
  safeEqual(token, generateCategoryToken(userId, category));

/** The unsubscribe link for one category. Nothing is stored for its token, so a link works however old it is. */
export const buildUnsubscribeLink = (userId: string, category: UnsubscribeCategory) => {
  const token = generateCategoryToken(userId, category);
  return `${appConfig.backendUrl}/notifications/unsubscribe?user=${userId}&category=${category}&token=${token}`;
};
