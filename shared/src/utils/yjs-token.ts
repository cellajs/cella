import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// The Yjs auth token scheme: the backend signs, the relay verifies. Format is
// base64url(JSON payload) + '.' + the first 16 hex chars of HMAC-SHA256(payload).

const DELIMITER = '.';
const SIGNATURE_LENGTH = 16;

export const yjsTokenPayloadSchema = z.object({
  userId: z.string(),
  entityType: z.string(),
  tenantId: z.string(),
  organizationId: z.string().nullable(),
  exp: z.number(),
});

export type YjsTokenPayload = z.infer<typeof yjsTokenPayloadSchema>;

/**
 * The reason lets callers log by severity. `expired` is routine and self-healing: the 30-minute
 * token lapses on a long-lived editor socket and the client reconnects with a fresh one.
 * `bad_signature` and `malformed` mean secret drift, truncation or tampering.
 */
export type VerifyYjsTokenResult =
  | { ok: true; payload: YjsTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

function computeSignature(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('hex').slice(0, SIGNATURE_LENGTH);
}

/**
 * The token embeds the tenant scope and product entity type the user may edit, so the relay
 * verifies access locally with no call back to the backend.
 */
export function signYjsToken(params: Omit<YjsTokenPayload, 'exp'>, secret: string, ttlMs: number): string {
  const payload: YjsTokenPayload = {
    ...params,
    exp: Date.now() + ttlMs,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = computeSignature(payloadB64, secret);
  return `${payloadB64}${DELIMITER}${signature}`;
}

/** Verify and decode a Yjs HMAC token signed by {@link signYjsToken}. */
export function verifyYjsToken(token: string, secret: string): VerifyYjsTokenResult {
  const delimiterIndex = token.lastIndexOf(DELIMITER);
  if (delimiterIndex === -1) return { ok: false, reason: 'malformed' };

  const payloadB64 = token.slice(0, delimiterIndex);
  const providedSig = token.slice(delimiterIndex + 1);

  const expectedSig = computeSignature(payloadB64, secret);

  if (providedSig.length !== expectedSig.length) return { ok: false, reason: 'bad_signature' };
  const isValid = timingSafeEqual(Buffer.from(providedSig, 'utf8'), Buffer.from(expectedSig, 'utf8'));
  if (!isValid) return { ok: false, reason: 'bad_signature' };

  let payload: YjsTokenPayload;
  try {
    const raw = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    payload = yjsTokenPayloadSchema.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (Date.now() > payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
