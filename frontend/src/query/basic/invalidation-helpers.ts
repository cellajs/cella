import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ChannelEntityType } from 'shared';
import { isQueued } from '~/query/offline/mutation-queue';
import { getEntityQueryKeys } from './entity-query-registry';

/**
 * Remove parked updates before deletion so they cannot replay afterward.
 * Retain active updates in the scope queue so the delete remains serialized behind them.
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
 * Returns whether sibling mutations should defer invalidation until the last settlement.
 * @see https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query
 */
function shouldSkipInvalidation(queryClient: QueryClient, mutationKey: QueryKey): boolean {
  // onSettled still counts the current mutation as "mutating": >1 means siblings are pending and
  // will handle invalidation; ===1 means this is the last one.
  return queryClient.isMutating({ mutationKey }) > 1;
}

/** Invalidate only after the final mutation in a grouped scope settles. */
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
