import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ChannelEntityType } from 'shared';
import { isQueued } from '~/query/offline/mutation-queue';
import { getEntityQueryKeys } from './entity-query-registry';

/**
 * Remove QUEUED (offline-parked) update mutations for entities about to be deleted, so a stale
 * offline edit does not replay after the delete. Active (in-flight) updates are left in the mutation
 * cache: removing one does not cancel its request but does drop it from the scope queue, which would
 * let the delete start alongside it and defeat same-scope serialization. Those stay queued and the
 * delete serializes behind them.
 */
export function removePendingMutations(queryClient: QueryClient, updateKey: QueryKey, ids: string[]): void {
  const idSet = new Set(ids);
  const mutationCache = queryClient.getMutationCache();
  for (const mutation of mutationCache.findAll({ mutationKey: updateKey })) {
    if (!isQueued(mutation)) continue;
    const vars = mutation.state.variables as { id?: string } | undefined;
    if (vars?.id && idSet.has(vars.id)) {
      mutationCache.remove(mutation);
    }
  }
}

/**
 * True if invalidation should be skipped because sibling mutations are still running; call in
 * onSettled before invalidating to avoid over-invalidation during concurrent optimistic updates.
 *
 * @see https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query
 * @example
 * ```ts
 * onSettled: () => {
 *   if (shouldSkipInvalidation(queryClient, keys.update)) return;
 *   queryClient.invalidateQueries({ queryKey: keys.list.base });
 * }
 * ```
 */
function shouldSkipInvalidation(queryClient: QueryClient, mutationKey: QueryKey): boolean {
  // onSettled still counts the current mutation as "mutating": >1 means siblings are pending and
  // will handle invalidation; ===1 means this is the last one.
  return queryClient.isMutating({ mutationKey }) > 1;
}

/**
 * Invalidate only if this is the last mutation in the group (wraps shouldSkipInvalidation).
 *
 * @example
 * ```ts
 * onSettled: () => invalidateIfLastMutation(queryClient, keys.update, keys.list.base),
 * ```
 */
export function invalidateIfLastMutation(queryClient: QueryClient, mutationKey: QueryKey, queryKey: QueryKey): void {
  if (!shouldSkipInvalidation(queryClient, mutationKey)) {
    queryClient.invalidateQueries({ queryKey });
  }
}

/** Invalidate an entity's detail + list (and parent-org detail if nested) after a membership change, to resync counts. */
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
