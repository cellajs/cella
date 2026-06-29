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

function computeSignature(encodedPayload: string): string {
  return createHmac('sha256', env.YJS_SECRET).update(encodedPayload).digest('hex').slice(0, SIGNATURE_LENGTH);
}

/** Verify and decode a Yjs HMAC token. Same pattern as backend/src/lib/yjs-token-signer.ts. */
export function verifyToken(token: string): YjsTokenPayload | null {
  const delimiterIndex = token.lastIndexOf(DELIMITER);
  if (delimiterIndex === -1) return null;

  const payloadB64 = token.slice(0, delimiterIndex);
  const providedSig = token.slice(delimiterIndex + 1);

  const expectedSig = computeSignature(payloadB64);

  // Timing-safe comparison
  if (providedSig.length !== expectedSig.length) return null;
  const isValid = timingSafeEqual(Buffer.from(providedSig, 'utf8'), Buffer.from(expectedSig, 'utf8'));
  if (!isValid) return null;

  try {
    const raw = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const payload = tokenPayloadSchema.parse(raw);
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
