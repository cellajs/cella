/**
 * Cache token store for server-side entity cache access.
 *
 * Stores cache tokens received from SSE stream notifications.
 * When React Query fetches an entity (e.g., getPage), it checks this store
 * and passes the token in the X-Cache-Token header to leverage server-side caching.
 *
 * Key format: `${entityType}:${entityId}`
 * Value: The cache token string
 *
 * Tokens automatically expire (10 min TTL), but we don't track expiry client-side.
 * Invalid tokens are simply ignored by the server, resulting in a cache miss.
 */

/** Token entry with metadata */
interface CacheTokenEntry {
  token: string;
  /** Version this token is for (from tx.version) */
  version: number;
  /** Timestamp when stored (for debugging) */
  storedAt: number;
}

/** In-memory cache token store */
const tokenStore = new Map<string, CacheTokenEntry>();

/**
 * Build a key for the token store.
 */
function buildKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Store a cache token received from SSE stream.
 *
 * @param entityType - Entity type (e.g., 'page', 'attachment')
 * @param entityId - Entity ID
 * @param token - The cache token from SSE notification
 * @param version - Entity version the token is for
 */
export function storeCacheToken(entityType: string, entityId: string, token: string, version: number): void {
  const key = buildKey(entityType, entityId);
  const existing = tokenStore.get(key);

  // Only update if this is a newer version
  if (!existing || version >= existing.version) {
    tokenStore.set(key, {
      token,
      version,
      storedAt: Date.now(),
    });
  }
}

/**
 * Get a cache token for an entity if available.
 *
 * @param entityType - Entity type
 * @param entityId - Entity ID
 * @returns The cache token if available, undefined otherwise
 */
export function getCacheToken(entityType: string, entityId: string): string | undefined {
  const key = buildKey(entityType, entityId);
  return tokenStore.get(key)?.token;
}

/**
 * Get cache token entry with metadata.
 *
 * @param entityType - Entity type
 * @param entityId - Entity ID
 * @returns Token entry with version and timestamp, or undefined
 */
export function getCacheTokenEntry(entityType: string, entityId: string): CacheTokenEntry | undefined {
  const key = buildKey(entityType, entityId);
  return tokenStore.get(key);
}

/**
 * Remove a cache token (e.g., on entity deletion).
 *
 * @param entityType - Entity type
 * @param entityId - Entity ID
 */
export function removeCacheToken(entityType: string, entityId: string): void {
  const key = buildKey(entityType, entityId);
  tokenStore.delete(key);
}

/**
 * Clear all cache tokens.
 * Call on logout or when stream disconnects for extended period.
 */
export function clearCacheTokens(): void {
  tokenStore.clear();
}

/**
 * Get statistics about the token store.
 * Useful for debugging.
 */
export function getCacheTokenStats(): { size: number; entries: Array<{ key: string; version: number; age: number }> } {
  const now = Date.now();
  const entries = Array.from(tokenStore.entries()).map(([key, entry]) => ({
    key,
    version: entry.version,
    age: now - entry.storedAt,
  }));

  return {
    size: tokenStore.size,
    entries,
  };
}
