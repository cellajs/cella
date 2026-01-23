/**
 * Invalidation helpers for preventing over-invalidation.
 *
 * Based on TkDodo's concurrent optimistic updates pattern:
 * When multiple mutations are in flight, only the last one should trigger invalidation.
 * This prevents unnecessary refetches that could cause UI flickering.
 *
 * @see https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query
 */

import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Check if invalidation should be skipped because other related mutations are still running.
 * Call this in onSettled before invalidating to prevent over-invalidation.
 *
 * @param queryClient - React Query client
 * @param mutationKey - Key to filter mutations (typically entity mutation key)
 * @returns true if invalidation should be skipped
 *
 * @example
 * ```ts
 * onSettled: () => {
 *   if (shouldSkipInvalidation(queryClient, keys.update)) return;
 *   queryClient.invalidateQueries({ queryKey: keys.list.base });
 * }
 * ```
 */
export function shouldSkipInvalidation(queryClient: QueryClient, mutationKey: QueryKey): boolean {
  // When onSettled runs, the current mutation is still counted as "mutating"
  // So if count === 1, this is the last mutation and we should invalidate
  // If count > 1, other mutations are pending and will handle invalidation
  return queryClient.isMutating({ mutationKey }) > 1;
}

/**
 * Invalidate queries only if this is the last mutation in the group.
 * Convenience wrapper that combines the check and invalidation.
 *
 * @param queryClient - React Query client
 * @param mutationKey - Key to filter related mutations
 * @param queryKey - Query key to invalidate
 *
 * @example
 * ```ts
 * onSettled: () => {
 *   invalidateIfLastMutation(queryClient, keys.update, keys.list.base);
 * }
 * ```
 */
export function invalidateIfLastMutation(queryClient: QueryClient, mutationKey: QueryKey, queryKey: QueryKey): void {
  if (!shouldSkipInvalidation(queryClient, mutationKey)) {
    queryClient.invalidateQueries({ queryKey });
  }
}
