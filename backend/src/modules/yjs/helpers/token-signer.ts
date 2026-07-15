import { createHmac } from 'node:crypto';
import { env } from '#/env';

const DELIMITER = '.';
const SIGNATURE_LENGTH = 16;

/** Token TTL: 30 minutes */
const TOKEN_TTL_MS = 30 * 60 * 1000;

export interface YjsTokenPayload {
  userId: string;
  entityType: string;
  tenantId: string;
  organizationId: string | null;
  exp: number;
}

function computeSignature(encodedPayload: string): string {
  return createHmac('sha256', env.YJS_SECRET).update(encodedPayload).digest('hex').slice(0, SIGNATURE_LENGTH);
}

/**
 * Sign a context-scoped Yjs auth token.
 * Uses the same HMAC-SHA256 signing algorithm as the Yjs relay. The token
 * embeds the channel entity and product entity type the user may edit, so the
 * relay can verify access locally without calling back to the backend.
 */
export function signYjsToken(params: Omit<YjsTokenPayload, 'exp'>): string {
  const payload: YjsTokenPayload = {
    ...params,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = computeSignature(payloadB64);
  return `${payloadB64}${DELIMITER}${signature}`;
}
