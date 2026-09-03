import { createHmac, timingSafeEqual } from 'node:crypto';
import { appConfig } from 'shared';
import { env } from '#/env';

export const unsubscribeCategories = ['digest', 'mention', 'comment'] as const;
export type UnsubscribeCategory = (typeof unsubscribeCategories)[number];

/**
 * Category-scoped unsubscribe token: the HMAC binds the category in, so "stop the weekly
 * digest" cannot silently also stop mention emails (the newsletter path's email-only HMAC can
 * only toggle its single global flag).
 *
 * Keyed on the user id, not the email, so the link carries an opaque identifier and keeps
 * working after an email change.
 */
export const generateCategoryToken = (userId: string, category: UnsubscribeCategory) =>
  createHmac('sha256', env.UNSUBSCRIBE_SECRET).update(`${userId}:${category}`, 'utf8').digest('hex');

export const verifyCategoryToken = (userId: string, category: UnsubscribeCategory, token: string) => {
  const expected = Buffer.from(generateCategoryToken(userId, category), 'utf8');
  const received = Buffer.from(token, 'utf8');
  // timingSafeEqual requires equal lengths.
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
};

export const buildUnsubscribeLink = (userId: string, category: UnsubscribeCategory) => {
  const token = generateCategoryToken(userId, category);
  return `${appConfig.backendUrl}/notifications/unsubscribe?user=${userId}&category=${category}&token=${token}`;
};
