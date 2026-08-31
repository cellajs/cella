import { createXRoute } from '#/core/x-routes';
import { authGuard } from '#/middlewares/guard';
import { errorResponseRefs } from '#/schemas';
import {
  deletePushSubscriptionQuerySchema,
  deletePushSubscriptionResponseSchema,
  pushSubscriptionBodySchema,
  pushSubscriptionResponseSchema,
  pushVapidResponseSchema,
} from './push-schema';

const pushRoutes = {
  getPushVapid: createXRoute({
    operationId: 'getPushVapid',
    method: 'get',
    path: '/vapid',
    xGuard: [authGuard],
    tags: ['push'],
    summary: 'Get the Web Push application server key',
    description:
      'Returns the VAPID public key `PushManager.subscribe()` needs, or null when this deployment ' +
      'has no push keys configured; the client then offers no push toggle.',
    responses: {
      200: {
        description: 'VAPID public key',
        content: { 'application/json': { schema: pushVapidResponseSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  createPushSubscription: createXRoute({
    operationId: 'createPushSubscription',
    method: 'post',
    path: '/subscriptions',
    xGuard: [authGuard],
    tags: ['push'],
    summary: 'Register a Web Push subscription',
    description:
      'Stores the browser push subscription for the current user. Upserts by endpoint, so ' +
      're-subscribing after key rotation reclaims the row.',
    request: {
      body: { required: true, content: { 'application/json': { schema: pushSubscriptionBodySchema } } },
    },
    responses: {
      200: {
        description: 'Stored subscription',
        content: { 'application/json': { schema: pushSubscriptionResponseSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  deletePushSubscription: createXRoute({
    operationId: 'deletePushSubscription',
    method: 'delete',
    path: '/subscriptions',
    xGuard: [authGuard],
    tags: ['push'],
    summary: 'Remove a Web Push subscription',
    description: 'Deletes the given endpoint for the current user; an endpoint owned by someone else is a no-op.',
    request: { query: deletePushSubscriptionQuerySchema },
    responses: {
      200: {
        description: 'Number of subscriptions removed',
        content: { 'application/json': { schema: deletePushSubscriptionResponseSchema } },
      },
      ...errorResponseRefs,
    },
  }),
};

export { pushRoutes };
