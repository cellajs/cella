import { createHmac } from 'node:crypto';
import { appConfig } from 'shared';
import { safeEqual } from 'shared/utils/safe-equal';
import { modeSecret } from '#/env';

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
  createHmac('sha256', modeSecret('UNSUBSCRIBE_SECRET')).update(`${userId}:${category}`, 'utf8').digest('hex');

export const verifyCategoryToken = (userId: string, category: UnsubscribeCategory, token: string) =>
  safeEqual(token, generateCategoryToken(userId, category));

export const buildUnsubscribeLink = (userId: string, category: UnsubscribeCategory) => {
  const token = generateCategoryToken(userId, category);
  return `${appConfig.backendUrl}/notifications/unsubscribe?user=${userId}&category=${category}&token=${token}`;
};
