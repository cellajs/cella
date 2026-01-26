/**
 * Access token utilities for entity cache.
 * HMAC-signed tokens prove authorization at subscription time.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '#/env';

/** Access token payload */
export interface AccessTokenPayload {
  /** User ID */
  userId: string;
  /** Organization IDs the user has access to */
  organizationIds: string[];
  /** Expiration timestamp (ms) */
  expiresAt: number;
}

/** Token TTL: 10 minutes */
const tokenTtl = 10 * 60 * 1000;

/** Get the secret for signing tokens */
function getSecret(): string {
  // Use ARGON_SECRET as base for token signing
  return env.ARGON_SECRET || 'dev-entity-cache-secret-change-in-production';
}

/**
 * Generate an HMAC-signed access token.
 * Token contains user ID, org IDs, and expiry.
 *
 * @param userId - The user's ID
 * @param organizationIds - IDs of organizations the user is a member of
 * @returns Base64URL encoded token string
 */
export function generateAccessToken(userId: string, organizationIds: string[]): string {
  const payload: AccessTokenPayload = {
    userId,
    organizationIds,
    expiresAt: Date.now() + tokenTtl,
  };

  const data = JSON.stringify(payload);
  const signature = createHmac('sha256', getSecret()).update(data).digest('base64url');

  return `${Buffer.from(data).toString('base64url')}.${signature}`;
}

/**
 * Verify and decode an access token.
 * Returns null if invalid, expired, or tampered.
 *
 * @param token - The token string to verify
 * @returns The payload if valid, null otherwise
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [dataB64, signature] = parts;
    if (!dataB64 || !signature) return null;

    const data = Buffer.from(dataB64, 'base64url').toString();
    const expectedSig = createHmac('sha256', getSecret()).update(data).digest('base64url');

    // Timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);

    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(sigBuffer, expectedBuffer)) return null;

    const payload: AccessTokenPayload = JSON.parse(data);

    // Check expiration
    if (Date.now() > payload.expiresAt) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Check if a token grants access to a specific organization.
 *
 * @param token - The access token
 * @param organizationId - The org ID to check
 * @returns True if token grants access to the org
 */
export function tokenHasOrgAccess(token: string, organizationId: string): boolean {
  const payload = verifyAccessToken(token);
  if (!payload) return false;
  return payload.organizationIds.includes(organizationId);
}

/**
 * Get the remaining TTL of a token in milliseconds.
 * Returns 0 if expired or invalid.
 */
export function getTokenTtl(token: string): number {
  const payload = verifyAccessToken(token);
  if (!payload) return 0;

  const remaining = payload.expiresAt - Date.now();
  return remaining > 0 ? remaining : 0;
}

/** Token TTL constant for external use */
export const accessTokenTtl = tokenTtl;
