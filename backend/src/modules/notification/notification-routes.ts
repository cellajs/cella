import { z } from '@hono/zod-openapi';
import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { publicGuard, userGuard } from '#/middlewares/guard';
import { oneClickUnsubscribeLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { unsubscribeCategories } from '#/modules/notification/helpers/category-token';
import {
  markReadBodySchema,
  markReadResponseSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  preferencesSchema,
  updatePreferencesBodySchema,
} from '#/modules/notification/notification-schema';
import { locationSchema, maxLength, validIdSchema } from '#/schemas';

/** The link token of one email category: the user, the category and an HMAC over both. */
const unsubscribeQuerySchema = z.object({ user: validIdSchema, category: z.enum(unsubscribeCategories), token: z.string().max(maxLength.field) });

export const notificationRoutes = createXRoutes(['notifications', 'cella'], {
  listNotifications: xRoute({
    method: 'get',
    path: '/notifications',
    xGuard: [userGuard],
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
    path: '/notifications/~mark-read',
    xGuard: [userGuard],
    summary: 'Mark notifications as read',
    description:
      'Marks specific notifications read by id, everything sharing one context, or all unread notifications when the body is empty. Idempotent.',
    request: { body: jsonBody(markReadBodySchema) },
    responses: { 200: json('Marked read\n\n`updated` is the number of notifications this request marked read.', markReadResponseSchema) },
  }),
  getNotificationPreferences: xRoute({
    method: 'get',
    path: '/me/notification-preferences',
    xGuard: [userGuard],
    summary: 'Get notification preferences',
    description: 'Email and digest preferences for the current user. In-app delivery is not opt-out.',
    responses: { 200: json('Notification preferences', preferencesSchema) },
  }),
  updateNotificationPreferences: xRoute({
    method: 'patch',
    path: '/me/notification-preferences',
    xGuard: [userGuard],
    summary: 'Update notification preferences',
    description: 'Partial update; unspecified keys keep their stored value.',
    request: { body: jsonBody(updatePreferencesBodySchema) },
    responses: { 200: json('Preferences updated', preferencesSchema) },
  }),
  openUnsubscribeLink: xRoute({
    method: 'get',
    path: '/notifications/unsubscribe',
    xGuard: [publicGuard],
    summary: 'Open an unsubscribe link',
    description:
      'Redirects an unsubscribe link from an email to the page that asks to confirm it, and changes nothing: mail scanners ' +
      'and link previews open links on their own. No auth.',
    request: { query: unsubscribeQuerySchema },
    responses: { 302: { description: 'Redirect to confirmation', headers: locationSchema } },
  }),
  unsubscribeNotifications: xRoute({
    method: 'post',
    path: '/notifications/unsubscribe',
    xGuard: [publicGuard],
    xRateLimiter: [oneClickUnsubscribeLimiter],
    summary: 'Unsubscribe from a notification category',
    description:
      'Turns off one email category. The token identifies the user and the category, so unsubscribing from the digest ' +
      "leaves other email untouched. The confirmation page and a mail client's one-click unsubscribe (RFC 8058) post here. No auth.",
    request: { query: unsubscribeQuerySchema },
    responses: { 204: { description: 'Category turned off' }, ...errors(403, 404) },
  }),
  resubscribeNotifications: xRoute({
    method: 'post',
    path: '/notifications/~resubscribe',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('unsubscribe')],
    summary: 'Turn a notification category back on',
    description: 'Undoes an unsubscribe with the same link token, from the page that confirmed it. No auth.',
    request: { query: unsubscribeQuerySchema },
    responses: { 204: { description: 'Category turned on' }, ...errors(403, 404) },
  }),
});
