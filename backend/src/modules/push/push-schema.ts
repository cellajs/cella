import { z } from '@hono/zod-openapi';
import { isPushServiceEndpoint } from '#/modules/push/helpers/push-service-endpoint';
import { refineWithType } from '#/schemas/common-schemas';

/** A subscription's push service URL. */
const endpointSchema = z.url().max(2048);

/**
 * Body of `PushManager.subscribe()`'s `toJSON()`, verbatim, so the client needs no mapping. The server POSTs each push
 * to `endpoint`, so it must be a known push service: any other URL would let a user pick the host of that request.
 */
export const pushSubscriptionBodySchema = z.object({
  endpoint: endpointSchema.superRefine(refineWithType(isPushServiceEndpoint, 'invalid_push_endpoint')),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});

export const pushSubscriptionResponseSchema = z.object({ id: z.string(), endpoint: z.string() });

export const deletePushSubscriptionQuerySchema = z.object({ endpoint: endpointSchema });

export const deletePushSubscriptionResponseSchema = z.object({ deleted: z.number().int().min(0) });

/** `publicKey` is null while push sending is off (`has.push` off, or VAPID keys web-push refuses); the client then hides the toggle. */
export const pushVapidResponseSchema = z.object({ publicKey: z.string().nullable() });
