const inFlight = new Map<string, Promise<unknown>>();

/**
 * Shares one in-flight fetch among concurrent callers using the same key.
 * @param key Request identity.
 * @param fetcher Work executed by the first caller.
 * @returns The shared result.
 */
export async function coalesce<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  // If already fetching, wait for that promise
  const existing = inFlight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  // First request executes the fetcher.
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
