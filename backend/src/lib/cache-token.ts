/**
 * Cache token utilities for server-side entity cache.
 * Lightweight HMAC-signed tokens for cache access authorization.
 *
 * These tokens are included in SSE stream notifications and allow clients
 * to access cached entity data without re-verifying membership on each request.
 * The first client to fetch with the token populates the cache; subsequent
 * clients get a cache hit.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '#/env';

/** Cache token payload */
export interface CacheTokenPayload {
  /** User ID */
  userId: string;
  /** Organization IDs the user has access to */
  organizationIds: string[];
  /** Entity type being accessed */
  entityType: string;
  /** Entity ID being accessed */
  entityId: string;
  /** Entity version (ensures token is tied to specific version) */
  version: number;
  /** Expiration timestamp (ms) */
  expiresAt: number;
}

/** Token TTL: 10 minutes (matches entity cache TTL) - exported for external use */
export const cacheTokenTtl = 10 * 60 * 1000;

/** Get the secret for signing tokens */
function getSecret(): string {
  return env.ARGON_SECRET || 'dev-cache-token-secret-change-in-production';
}

/**
 * Generate an HMAC-signed cache token.
 * Token authorizes access to a specific entity version in the server-side cache.
 *
 * @param userId - The user's ID
 * @param organizationIds - IDs of organizations the user is a member of
 * @param entityType - Type of entity being accessed
 * @param entityId - ID of entity being accessed
 * @param version - Version of entity being accessed
 * @returns Base64URL encoded token string
 */
export function generateCacheToken(
  userId: string,
  organizationIds: string[],
  entityType: string,
  entityId: string,
  version: number,
): string {
  const payload: CacheTokenPayload = {
    userId,
    organizationIds,
    entityType,
    entityId,
    version,
    expiresAt: Date.now() + cacheTokenTtl,
  };

  const data = JSON.stringify(payload);
  const signature = createHmac('sha256', getSecret()).update(data).digest('base64url');

  return `${Buffer.from(data).toString('base64url')}.${signature}`;
}

/**
 * Verify and decode a cache token.
 * Returns null if invalid, expired, or tampered.
 *
 * @param token - The token string to verify
 * @returns The payload if valid, null otherwise
 */
export function verifyCacheToken(token: string): CacheTokenPayload | null {
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

    const payload: CacheTokenPayload = JSON.parse(data);

    // Check expiration
    if (Date.now() > payload.expiresAt) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Check if a cache token grants access to a specific entity.
 *
 * @param token - The cache token
 * @param entityType - Entity type to check
 * @param entityId - Entity ID to check
 * @param version - Entity version to check (optional, if not provided only checks type/id)
 * @returns True if token grants access
 */
export function tokenGrantsAccess(token: string, entityType: string, entityId: string, version?: number): boolean {
  const payload = verifyCacheToken(token);
  if (!payload) return false;

  // Check entity matches
  if (payload.entityType !== entityType) return false;
  if (payload.entityId !== entityId) return false;

  // If version specified, check it matches
  if (version !== undefined && payload.version !== version) return false;

  return true;
}

/**
 * Check if a cache token grants access to entities within an organization.
 *
 * @param token - The cache token
 * @param organizationId - Organization ID to check
 * @returns True if token grants access to the org
 */
export function tokenHasOrgAccess(token: string, organizationId: string): boolean {
  const payload = verifyCacheToken(token);
  if (!payload) return false;
  return payload.organizationIds.includes(organizationId);
}

/**
 * Extract token suffix for cache key (last 12 chars, from signature).
 * Used for building unique cache keys without exposing full token.
 */
export function getCacheTokenSuffix(token: string): string {
  return token.slice(-12);
}
