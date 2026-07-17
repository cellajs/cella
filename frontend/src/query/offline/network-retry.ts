import { ApiError } from '~/lib/api';

/**
 * True when `error` is a network-level failure: the fetch never received an HTTP
 * response because the connection was down. Browsers phrase this differently:
 * Chrome/Edge "Failed to fetch", Safari "Load failed", Firefox "NetworkError".
 *
 * A server that responded (any HTTP status, including 5xx) surfaces as an
 * {@link ApiError} and is explicitly excluded. Those errors must fail fast so their
 * handlers (4xx quarantine, 5xx toast) run without being retried.
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
 * Network-error retries allowed before a connectivity failure settles as an error.
 *
 * The retries let the retryer reach a
 * retry *boundary* while offline, which is the only moment TanStack Query pauses a
 * mutation (and thus enqueues it for offline replay). Sized to outlast the
 * connectivity probe: on a "connected but no internet" outage, onlineManager stays
 * online until `checkConnectivity()` concludes (~1.5s of probe retries). With
 * exponential backoff the boundaries fall around ~1s / ~3s / ~7s, so by the second
 * boundary onlineManager has flipped offline, so the mutation pauses without
 * erroring. In a genuine offline state (browser 'offline' event) onlineManager is
 * already offline, so the first boundary pauses after a single attempt.
 */
const MAX_NETWORK_RETRIES = 3;

/**
 * Mutation `retry` predicate. Retries only connectivity failures, up to
 * {@link MAX_NETWORK_RETRIES}. Paired with `networkMode: 'offlineFirst'`, this is
 * what lets a mutation that failed offline enter the persisted paused-mutation
 * queue so it is not lost.
 *
 * `failureCount` is the number of failures so far (0 on the first failure), matching
 * TanStack's numeric `retry` semantics: `failureCount < 3` == `retry: 3`.
 *
 * @see query-client.ts
 */
export function mutationRetry(failureCount: number, error: unknown): boolean {
  return isNetworkError(error) && failureCount < MAX_NETWORK_RETRIES;
}
