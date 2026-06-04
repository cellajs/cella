/**
 * Cache token signing utilities for defense-in-depth security.
 *
 * Cache tokens are signed with a user-specific secret derived from:
 * - Server's COOKIE_SECRET (stable across restarts)
 * - User's session token (unique per session)
 *
 * This ensures:
 * - Tokens are useless if leaked (require matching session)
 * - Cache is still shared (same base token for all users)
 * - Session invalidation implicitly invalidates token usage
 *
 * Format: `{baseToken}.{signature}` where signature is 10 hex chars (40 bits)
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '#/env';

/** Signature length in characters (10 chars = 40 bits, sufficient for defense-in-depth) */
const SIGNATURE_LENGTH = 10;

/** Delimiter between base token and signature */
const DELIMITER = '.';

/**
 * Derive a signing key from server secret and session token.
 * Uses HMAC-SHA256 to create a session-specific signing key.
 */
function deriveSigningKey(sessionToken: string): Buffer {
  return createHmac('sha256', env.COOKIE_SECRET).update(sessionToken).digest();
}

/**
 * Sign a base cache token with the user's session-derived key.
 * Returns format: `{baseToken}.{signature}`
 *
 * @param baseToken - The cache token from CDC (nanoid)
 * @param sessionToken - The user's hashed session token
 * @returns Signed token in format `baseToken.signature`
 */
export function signCacheToken(baseToken: string, sessionToken: string): string {
  const signingKey = deriveSigningKey(sessionToken);
  const signature = createHmac('sha256', signingKey).update(baseToken).digest('hex').slice(0, SIGNATURE_LENGTH);
  return `${baseToken}${DELIMITER}${signature}`;
}

/**
 * Validate and extract the base token from a signed cache token.
 * Returns the base token if valid, null if invalid.
 *
 * @param signedToken - The signed token from X-Cache-Token header
 * @param sessionToken - The user's hashed session token
 * @returns Base token if signature valid, null otherwise
 */
export function validateSignedCacheToken(signedToken: string, sessionToken: string): string | null {
  const delimiterIndex = signedToken.lastIndexOf(DELIMITER);
  if (delimiterIndex === -1) return null;

  const baseToken = signedToken.slice(0, delimiterIndex);
  const providedSignature = signedToken.slice(delimiterIndex + 1);

  if (providedSignature.length !== SIGNATURE_LENGTH) return null;

  const signingKey = deriveSigningKey(sessionToken);
  const expectedSignature = createHmac('sha256', signingKey).update(baseToken).digest('hex').slice(0, SIGNATURE_LENGTH);

  // Use timing-safe comparison to prevent timing attacks
  try {
    const sigBuffer = Buffer.from(providedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (timingSafeEqual(sigBuffer, expectedBuffer)) {
      return baseToken;
    }
  } catch {
    // Invalid hex or buffer mismatch
    return null;
  }

  return null;
}
