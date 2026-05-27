/**
 * Request coalescing (singleflight pattern).
 * Prevents thundering herd by coalescing concurrent requests for the same key.
 */

/** In-flight requests map */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Coalesce concurrent requests for the same key.
 * First request executes the fetcher, subsequent requests wait for the same promise.
 *
 * @param key - Unique identifier for the request (e.g., 'attachment:abc:5')
 * @param fetcher - Async function to fetch the data
 * @returns The fetched data
 *
 * @example
 * ```typescript
 * // 100 concurrent requests for same entity = 1 DB query
 * const data = await coalesce(`page:${id}:${version}`, async () => {
 *   return await db.query.pagesTable.findFirst({ where: eq(id, pageId) });
 * });
 * ```
 */
export async function coalesce<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  // If already fetching, wait for that promise
  const existing = inFlight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  // First request - execute the fetcher
  const promise = fetcher().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Check if a request is currently in flight.
 */
export function isInFlight(key: string): boolean {
  return inFlight.has(key);
}

/**
 * Get count of in-flight requests.
 * Useful for debugging and metrics.
 */
export function inFlightCount(): number {
  return inFlight.size;
}

/**
 * Clear all in-flight tracking (for testing).
 */
export function clearInFlight(): void {
  inFlight.clear();
}
