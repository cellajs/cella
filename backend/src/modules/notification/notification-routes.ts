import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { publicGuard, userGuard } from '#/middlewares/guard';
import { syncReadLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { locationSchema, validIdSchema } from '#/schemas';
import { unsubscribeCategories } from './helpers/category-token';
import {
  markReadBodySchema,
  markReadResponseSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  preferencesSchema,
  updatePreferencesBodySchema,
} from './notification-schema';

const notificationRoutes = createXRoutes(['notifications'], {
  getNotifications: xRoute({
    method: 'get',
    path: '/',
    xGuard: [userGuard],
    xRateLimiter: [syncReadLimiter],
    summary: 'List notifications',
    description:
      'Returns the current user notification inbox, newest first, with the unread count. ' +
      'Ambient posts are not included: those are covered by unseen counts. ' +
      'Rows older than the retention window are removed with their partition.',
    request: { query: notificationListQuerySchema },
    responses: { 200: json('Notifications and unread count', notificationListResponseSchema) },
  }),
  markNotificationsRead: xRoute({
    method: 'post',
    path: '/read',
    xGuard: [userGuard],
    summary: 'Mark notifications as read',
    description:
      'Marks specific notifications read by id, everything sharing one context, or all unread ' +
      'notifications when the body is empty. Idempotent.',
    request: { body: jsonBody(markReadBodySchema) },
    responses: { 200: json('Number of notifications marked read', markReadResponseSchema) },
  }),
  getNotificationPreferences: xRoute({
    method: 'get',
    path: '/preferences',
    xGuard: [userGuard],
    summary: 'Get notification preferences',
    description: 'Email and digest preferences for the current user. In-app delivery is not opt-out.',
    responses: { 200: json('Notification preferences', preferencesSchema) },
  }),
  updateNotificationPreferences: xRoute({
    method: 'patch',
    path: '/preferences',
    xGuard: [userGuard],
    summary: 'Update notification preferences',
    description: 'Partial update; unspecified keys keep their stored value.',
    request: { body: jsonBody(updatePreferencesBodySchema) },
    responses: { 200: json('Updated notification preferences', preferencesSchema) },
  }),
  unsubscribeNotifications: xRoute({
    method: 'get',
    path: '/unsubscribe',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('unsubscribe')],
    summary: 'Unsubscribe from a notification category',
    description:
      'Turns off one email category from a link in an email. The token identifies the user and ' +
      'the category, so unsubscribing from the digest leaves other email untouched. No auth.',
    request: { query: z.object({ user: validIdSchema, category: z.enum(unsubscribeCategories), token: z.string() }) },
    responses: { 302: { description: 'Redirect to FE', headers: locationSchema } },
  }),
});

export { notificationRoutes };
