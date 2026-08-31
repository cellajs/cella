import { z } from '@hono/zod-openapi';

/** Body of `PushManager.subscribe()`'s `toJSON()`, verbatim, so the client needs no mapping. */
export const pushSubscriptionBodySchema = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export const pushSubscriptionResponseSchema = z.object({
  id: z.string(),
  endpoint: z.string(),
});

export const deletePushSubscriptionQuerySchema = z.object({
  endpoint: z.string().url().max(2048),
});

export const deletePushSubscriptionResponseSchema = z.object({
  deleted: z.number().int().min(0),
});

/** `publicKey` is null while the deployment has no VAPID keys; the client then hides the toggle. */
export const pushVapidResponseSchema = z.object({
  publicKey: z.string().nullable(),
});
