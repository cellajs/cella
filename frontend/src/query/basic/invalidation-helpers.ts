import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ChannelEntityType } from 'shared';
import { getEntityQueryKeys } from './entity-query-registry';

/**
 * Remove pending update mutations for entities about to be deleted.
 * Prevents stale updates from firing after the entity is deleted.
 */
export function removePendingMutations(queryClient: QueryClient, updateKey: QueryKey, ids: string[]): void {
  const idSet = new Set(ids);
  const mutationCache = queryClient.getMutationCache();
  for (const mutation of mutationCache.findAll({ mutationKey: updateKey })) {
    const vars = mutation.state.variables as { id?: string } | undefined;
    if (vars?.id && idSet.has(vars.id)) {
      mutationCache.remove(mutation);
    }
  }
}

/**
 * Check if invalidation should be skipped because other related mutations are still running.
 * Call this in onSettled before invalidating to prevent over-invalidation.
 *
 * @param queryClient - React Query client
 * @param mutationKey - Key to filter mutations (typically entity mutation key)
 * @returns true if invalidation should be skipped
 *
 * @see https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query
 *
 * @example
 * ```ts
 * onSettled: () => {
 *   if (shouldSkipInvalidation(queryClient, keys.update)) return;
 *   queryClient.invalidateQueries({ queryKey: keys.list.base });
 * }
 * ```
 */
function shouldSkipInvalidation(queryClient: QueryClient, mutationKey: QueryKey): boolean {
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
 * Invalidate channel entity queries when membership changes.
 * Call this after invite/update/delete membership mutations to sync entity counts.
 *
 * Invalidates:
 * - Entity detail + list queries for the affected entity
 * - Parent organization detail if organizationId differs from entityId
 *
 * @param queryClient - React Query client
 * @param entityType - Type of the channel entity (e.g., 'organization')
 * @param entityId - ID of the affected entity
 * @param organizationId - Parent organization ID (if entity is nested under an org)
 */
export function invalidateOnMembershipChange(
  queryClient: QueryClient,
  entityType: ChannelEntityType,
  entityId: string,
  organizationId?: string,
): void {
  const keys = getEntityQueryKeys(entityType);
  queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId), refetchType: 'active' });
  queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });

  // If entity belongs to a different parent org, invalidate that too
  if (organizationId && organizationId !== entityId) {
    const orgKeys = getEntityQueryKeys('organization');
    queryClient.invalidateQueries({ queryKey: orgKeys.detail.byId(organizationId), refetchType: 'active' });
  }
}
