import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { userGuard } from '#/middlewares/guard';
import {
  deletePushSubscriptionQuerySchema,
  deletePushSubscriptionResponseSchema,
  pushSubscriptionBodySchema,
  pushSubscriptionResponseSchema,
  pushVapidResponseSchema,
} from './push-schema';

const pushRoutes = createXRoutes(['push'], {
  getPushVapid: xRoute({
    method: 'get',
    path: '/vapid',
    xGuard: [userGuard],
    summary: 'Get the Web Push application server key',
    description:
      'Returns the VAPID public key `PushManager.subscribe()` needs, or null when this deployment ' +
      'has no push keys configured; the client then offers no push toggle.',
    responses: { 200: json('VAPID public key', pushVapidResponseSchema) },
  }),
  createPushSubscription: xRoute({
    method: 'post',
    path: '/subscriptions',
    xGuard: [userGuard],
    summary: 'Register a Web Push subscription',
    description:
      'Stores the browser push subscription for the current user. Upserts by endpoint, so ' + 're-subscribing after key rotation reclaims the row.',
    request: { body: jsonBody(pushSubscriptionBodySchema) },
    responses: { 200: json('Stored subscription', pushSubscriptionResponseSchema) },
  }),
  deletePushSubscription: xRoute({
    method: 'delete',
    path: '/subscriptions',
    xGuard: [userGuard],
    summary: 'Remove a Web Push subscription',
    description: 'Deletes the given endpoint for the current user; an endpoint owned by someone else is a no-op.',
    request: { query: deletePushSubscriptionQuerySchema },
    responses: { 200: json('Number of subscriptions removed', deletePushSubscriptionResponseSchema) },
  }),
});

export { pushRoutes };
