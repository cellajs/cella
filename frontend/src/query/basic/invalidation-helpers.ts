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
import type { ContextEntityType } from 'config';
import { getEntityQueryKeys } from './entity-query-registry';

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

/**
 * Invalidate context entity queries when membership changes.
 * Call this after invite/update/delete membership mutations to sync entity counts.
 *
 * Invalidates:
 * - Entity detail + list queries for the affected entity
 * - Parent organization detail if organizationId differs from entityId
 *
 * @param queryClient - React Query client
 * @param entityType - Type of the context entity (e.g., 'organization')
 * @param entityId - ID of the affected entity
 * @param organizationId - Parent organization ID (if entity is nested under an org)
 */
export function invalidateOnMembershipChange(
  queryClient: QueryClient,
  entityType: ContextEntityType,
  entityId: string,
  organizationId?: string,
): void {
  const keys = getEntityQueryKeys(entityType);
  if (keys) {
    queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId), refetchType: 'active' });
    queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
  }

  // If entity belongs to a different parent org, invalidate that too
  if (organizationId && organizationId !== entityId) {
    const orgKeys = getEntityQueryKeys('organization');
    if (orgKeys) {
      queryClient.invalidateQueries({ queryKey: orgKeys.detail.byId(organizationId), refetchType: 'active' });
    }
  }
}
