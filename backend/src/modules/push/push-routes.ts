import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { userGuard } from '#/middlewares/guard';
import { pushSubscriptionLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  pushSubscriptionBodySchema,
  pushSubscriptionResponseSchema,
  pushVapidResponseSchema,
  removePushSubscriptionBodySchema,
  removePushSubscriptionResponseSchema,
} from '#/modules/push/push-schema';

const pushRoutes = createXRoutes(['push', 'cella'], {
  getPushVapid: xRoute({
    method: 'get',
    path: '/vapid',
    xGuard: [userGuard],
    summary: 'Get the Web Push application server key',
    description:
      'Returns the VAPID public key `PushManager.subscribe()` needs, or null while push sending is off ' +
      '(push turned off, VAPID keys missing, or keys or subject refused); the client then offers no push toggle.',
    responses: { 200: json('VAPID public key', pushVapidResponseSchema) },
  }),
  createPushSubscription: xRoute({
    method: 'post',
    path: '/subscriptions',
    xGuard: [userGuard],
    xRateLimiter: [pushSubscriptionLimiter],
    summary: 'Register a Web Push subscription',
    description:
      'Stores the browser push subscription for the current user. Upserts by endpoint, so re-subscribing after key rotation reclaims the row. ' +
      'The endpoint must be an https URL of a known browser push service. Past the per-user cap, the least recently seen subscriptions are removed.',
    request: { body: jsonBody(pushSubscriptionBodySchema) },
    responses: { 201: json('Stored subscription', pushSubscriptionResponseSchema) },
  }),
  removePushSubscription: xRoute({
    method: 'post',
    path: '/subscriptions/~remove',
    xGuard: [userGuard],
    summary: 'Remove a Web Push subscription',
    description: 'Deletes the given endpoint for the current user; an endpoint owned by someone else is a no-op.',
    request: { body: jsonBody(removePushSubscriptionBodySchema) },
    responses: {
      200: json(
        'Subscriptions removed\n\n`deleted` is the number removed, 0 when the endpoint belongs to another user.',
        removePushSubscriptionResponseSchema,
      ),
    },
  }),
});

export { pushRoutes };
