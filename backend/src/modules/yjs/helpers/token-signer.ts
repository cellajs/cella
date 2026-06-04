/**
 * Yjs auth token signing for the backend API.
 *
 * Generates HMAC-SHA256 signed tokens for Yjs relay worker authentication.
 * Same signing algorithm as yjs/src/auth.ts — both share YJS_SECRET.
 *
 * Tokens are context-scoped: they embed the context entity (e.g. project)
 * and the product entity type (e.g. task) the user is authorized to edit.
 * This lets the Yjs worker verify access locally without a backend round-trip.
 */

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
 * The token proves the user has update permission for the given entity type
 * within a specific context (e.g. project). The Yjs worker can verify this
 * locally via HMAC without calling back to the backend.
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
