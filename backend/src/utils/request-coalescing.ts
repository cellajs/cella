const inFlight = new Map<string, Promise<unknown>>();

/** Shares one in-flight fetch among concurrent callers using the same key. */
export async function coalesce<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fetcher().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

export function isInFlight(key: string): boolean {
  return inFlight.has(key);
}

export function inFlightCount(): number {
  return inFlight.size;
}

/** For testing. */
export function clearInFlight(): void {
  inFlight.clear();
}
