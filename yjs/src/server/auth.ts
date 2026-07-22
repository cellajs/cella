import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../env';

const DELIMITER = '.';
const SIGNATURE_LENGTH = 16;

const tokenPayloadSchema = z.object({
  userId: z.string(),
  entityType: z.string(),
  tenantId: z.string(),
  organizationId: z.string().nullable(),
  exp: z.number(),
});

export type YjsTokenPayload = z.infer<typeof tokenPayloadSchema>;

/**
 * Discriminated verification outcome. The reason lets the caller log by severity:
 * `expired` is routine and self-healing (the 30-minute token lapses on a long-lived
 * editor socket; the client reconnects with a fresh one), while `bad_signature` and
 * `malformed` are genuine anomalies (secret drift, truncation, or tampering).
 */
export type VerifyTokenResult =
  | { ok: true; payload: YjsTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

function computeSignature(encodedPayload: string): string {
  return createHmac('sha256', env.YJS_SECRET).update(encodedPayload).digest('hex').slice(0, SIGNATURE_LENGTH);
}

/** Verify and decode a Yjs HMAC token. Same pattern as backend/src/modules/yjs/helpers/token-signer.ts. */
export function verifyToken(token: string): VerifyTokenResult {
  const delimiterIndex = token.lastIndexOf(DELIMITER);
  if (delimiterIndex === -1) return { ok: false, reason: 'malformed' };

  const payloadB64 = token.slice(0, delimiterIndex);
  const providedSig = token.slice(delimiterIndex + 1);

  const expectedSig = computeSignature(payloadB64);

  // Timing-safe comparison
  if (providedSig.length !== expectedSig.length) return { ok: false, reason: 'bad_signature' };
  const isValid = timingSafeEqual(Buffer.from(providedSig, 'utf8'), Buffer.from(expectedSig, 'utf8'));
  if (!isValid) return { ok: false, reason: 'bad_signature' };

  let payload: YjsTokenPayload;
  try {
    const raw = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    payload = tokenPayloadSchema.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (Date.now() > payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
