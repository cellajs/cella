import { ApiError, gatewayStatuses } from '~/lib/api';
import { reportNetworkFailure } from '~/query/offline/connectivity';
import { hasStx, isReplayed } from '~/query/offline/mutation-variables';

/** Browser-specific failures that received no HTTP response. Every {@link ApiError} is excluded, so HTTP handlers run without network retries. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('failed to fetch') || // Chrome, Edge
    message.includes('load failed') || // Safari
    message.includes('network connection was lost') || // Safari on iOS
    message.includes('internet connection appears to be offline') || // Safari on iOS
    message.includes('networkerror') // Firefox
  );
}

/** Sized to outlast connectivity probing and reach a TanStack offline boundary, which pauses and persists the mutation before the budget settles. */
const maxNetworkRetries = 3;

/** Retries only connectivity failures, so offline-first mutations enter the persisted queue. TanStack starts `failureCount` at zero. */
export const mutationRetry = (failureCount: number, error: unknown): boolean => isNetworkError(error) && failureCount < maxNetworkRetries;

/**
 * {@link mutationRetry} for one mutation, whose variables it reads at each failure. A sync write retries a network failure
 * with no count: the server applies it once by its ids, and the failure may have lost the answer to a write it applied,
 * which settling would report as failed. A replay a gateway answers, as during a deploy, retries with no count too and
 * starts the probe, which pauses it offline while the API is unreachable. Both wait on query-core's capped backoff, stored
 * as they run; a server error of any other kind settles the mutation.
 */
export function replayRetry(variablesOf: () => unknown) {
  return (failureCount: number, error: unknown): boolean => {
    const variables = variablesOf();
    if (isNetworkError(error) && hasStx(variables)) return true;
    const gatewayAnswer = error instanceof ApiError && gatewayStatuses.has(error.status);
    if (!gatewayAnswer || !isReplayed(variables)) return mutationRetry(failureCount, error);
    void reportNetworkFailure();
    return true;
  };
}
