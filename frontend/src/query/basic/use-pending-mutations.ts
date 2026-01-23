import { useSyncExternalStore } from 'react';
import { queryClient } from '~/query/query-client';

/**
 * Subscribe to mutation cache changes and return pending mutations count.
 * Uses React's useSyncExternalStore for efficient subscription.
 */
export function usePendingMutationsCount(): number {
  const mutationCache = queryClient.getMutationCache();

  return useSyncExternalStore(
    // Subscribe to mutation cache changes
    (callback) => mutationCache.subscribe(callback),
    // Get current snapshot
    () => mutationCache.findAll({ status: 'pending' }).length,
    // Server snapshot (SSR fallback)
    () => 0,
  );
}

/**
 * Check if there are any pending mutations (offline queue has items).
 */
export function usePendingMutations(): boolean {
  return usePendingMutationsCount() > 0;
}

/**
 * Get pending mutations count outside of React (for imperative use).
 */
export function getPendingMutationsCount(): number {
  return queryClient.getMutationCache().findAll({ status: 'pending' }).length;
}
