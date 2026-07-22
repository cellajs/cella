import { ApiError } from '~/lib/api';

/**
 * Detect browser-specific failures that received no HTTP response.
 * Exclude every {@link ApiError} so HTTP handlers run without network retries.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('failed to fetch') || // Chrome, Edge
    message.includes('load failed') || // Safari
    message.includes('networkerror') // Firefox
  );
}

/**
 * Retry count sized to outlast connectivity probing and reach a TanStack offline boundary.
 * Offline detection pauses and persists the mutation before the retry budget settles.
 */
const MAX_NETWORK_RETRIES = 3;

/**
 * Retries only connectivity failures so offline-first mutations can enter the persisted queue.
 * TanStack starts `failureCount` at zero, matching its numeric retry semantics.
 * @see query-client.ts
 */
export function mutationRetry(failureCount: number, error: unknown): boolean {
  return isNetworkError(error) && failureCount < MAX_NETWORK_RETRIES;
}
