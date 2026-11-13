import { ECDH } from 'node:crypto';
import { z } from '@hono/zod-openapi';
import { isPushServiceEndpoint } from '#/modules/push/helpers/push-service-endpoint';
import { refineWithType } from '#/schemas/common-schemas';

/** A subscription's push service URL. */
const endpointSchema = z.string().max(2048).pipe(z.url()).openapi({ format: 'uri' });

/** Whether `value` is the browser's public key as `getKey('p256dh')` gives it: an uncompressed point on P-256 (RFC 8291 §7), base64url. */
const isP256PublicKey = (value: string) => {
  const point = Buffer.from(value, 'base64url');
  if (point.length !== 65 || point[0] !== 0x04) return false;
  try {
    ECDH.convertKey(point, 'prime256v1');
    return true;
  } catch {
    return false;
  }
};

/** Whether `value` is the auth secret as `getKey('auth')` gives it: 16 octets (RFC 8291 §3.2), base64url. */
const isAuthSecret = (value: string) => Buffer.from(value, 'base64url').length === 16;

/**
 * Body of `PushManager.subscribe()`'s `toJSON()`, verbatim, so the client needs no mapping; its `expirationTime` is
 * dropped unread. The server POSTs each push to `endpoint`, so it must be a known push service: any other URL would let
 * a user pick the host of that request. The keys are refused unless they are the shape a browser makes, so no stored
 * row fails every send.
 */
export const pushSubscriptionBodySchema = z.object({
  endpoint: endpointSchema.superRefine(refineWithType(isPushServiceEndpoint, 'invalid_push_endpoint')),
  keys: z.object({
    p256dh: z.string().max(512).superRefine(refineWithType(isP256PublicKey, 'invalid_push_keys')),
    auth: z.string().max(512).superRefine(refineWithType(isAuthSecret, 'invalid_push_keys')),
  }),
});

export const pushSubscriptionResponseSchema = z.object({ id: z.string(), endpoint: z.string() });

export const removePushSubscriptionBodySchema = z.object({ endpoint: endpointSchema });

/** `publicKey` is null while push sending is off (`has.push` off, or VAPID keys web-push refuses); the client then hides the toggle. */
export const pushVapidResponseSchema = z.object({ publicKey: z.string().nullable() });
