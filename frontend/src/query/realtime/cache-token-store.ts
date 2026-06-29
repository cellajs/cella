const tokenStore = new Map<string, string>();

function buildKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Store a cache token received from SSE stream notifications. The token is later sent
 * in the `X-Cache-Token` header on entity fetches to leverage server-side caching.
 * Tokens expire server-side (10 min TTL); invalid tokens result in a cache miss.
 */
export function storeCacheToken(entityType: string, entityId: string, token: string): void {
  const key = buildKey(entityType, entityId);
  tokenStore.set(key, token);
}

/**
 * Get a cache token for an entity if available, for use in the `X-Cache-Token` header.
 */
export function getCacheToken(entityType: string, entityId: string): string | undefined {
  const key = buildKey(entityType, entityId);
  return tokenStore.get(key);
}

/**
 * Remove a cache token, e.g. on entity deletion.
 */
export function removeCacheToken(entityType: string, entityId: string): void {
  const key = buildKey(entityType, entityId);
  tokenStore.delete(key);
}
