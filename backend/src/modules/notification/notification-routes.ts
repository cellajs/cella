import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/core/x-routes';
import { authGuard, publicGuard } from '#/middlewares/guard';
import { syncReadLimiter, tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { errorResponseRefs, locationSchema, validIdSchema } from '#/schemas';
import { unsubscribeCategories } from './helpers/category-token';
import {
  markReadBodySchema,
  markReadResponseSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  preferencesSchema,
  updatePreferencesBodySchema,
} from './notification-schema';

const notificationRoutes = {
  getNotifications: createXRoute({
    operationId: 'getNotifications',
    method: 'get',
    path: '/',
    xGuard: [authGuard],
    xRateLimiter: [syncReadLimiter],
    tags: ['notifications'],
    summary: 'List notifications',
    description:
      'Returns the current user notification inbox, newest first, with the unread count. ' +
      'Ambient posts are not included: those are covered by unseen counts. ' +
      'Rows older than the retention window are removed with their partition.',
    request: { query: notificationListQuerySchema },
    responses: {
      200: {
        description: 'Notifications and unread count',
        content: { 'application/json': { schema: notificationListResponseSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  markNotificationsRead: createXRoute({
    operationId: 'markNotificationsRead',
    method: 'post',
    path: '/read',
    xGuard: [authGuard],
    tags: ['notifications'],
    summary: 'Mark notifications as read',
    description:
      'Marks specific notifications read by id, everything sharing one context, or all unread ' +
      'notifications when the body is empty. Idempotent.',
    request: {
      body: { required: true, content: { 'application/json': { schema: markReadBodySchema } } },
    },
    responses: {
      200: {
        description: 'Number of notifications marked read',
        content: { 'application/json': { schema: markReadResponseSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  getNotificationPreferences: createXRoute({
    operationId: 'getNotificationPreferences',
    method: 'get',
    path: '/preferences',
    xGuard: [authGuard],
    tags: ['notifications'],
    summary: 'Get notification preferences',
    description: 'Email and digest preferences for the current user. In-app delivery is not opt-out.',
    responses: {
      200: {
        description: 'Notification preferences',
        content: { 'application/json': { schema: preferencesSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  updateNotificationPreferences: createXRoute({
    operationId: 'updateNotificationPreferences',
    method: 'patch',
    path: '/preferences',
    xGuard: [authGuard],
    tags: ['notifications'],
    summary: 'Update notification preferences',
    description: 'Partial update; unspecified keys keep their stored value.',
    request: {
      body: { required: true, content: { 'application/json': { schema: updatePreferencesBodySchema } } },
    },
    responses: {
      200: {
        description: 'Updated notification preferences',
        content: { 'application/json': { schema: preferencesSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  unsubscribeNotifications: createXRoute({
    operationId: 'unsubscribeNotifications',
    method: 'get',
    path: '/unsubscribe',
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('unsubscribe')],
    tags: ['notifications'],
    summary: 'Unsubscribe from a notification category',
    description:
      'Turns off one email category from a link in an email. The token identifies the user and ' +
      'the category, so unsubscribing from the digest leaves other email untouched. No auth.',
    request: {
      query: z.object({
        user: validIdSchema,
        category: z.enum(unsubscribeCategories),
        token: z.string(),
      }),
    },
    responses: {
      302: { description: 'Redirect to FE', headers: locationSchema },
      ...errorResponseRefs,
    },
  }),
};

export { notificationRoutes };
