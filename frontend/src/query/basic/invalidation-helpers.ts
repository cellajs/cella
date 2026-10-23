import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ChannelEntityType } from 'shared';
import { getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { isQueued } from '~/query/offline/mutation-queue';
import { queuedUpdateOf } from '~/query/offline/mutation-variables';

/** Removes parked updates before deletion so they cannot replay afterward; active updates stay queued so the delete remains serialized behind them. */
export function removePendingMutations(queryClient: QueryClient, updateKey: QueryKey, ids: string[]): void {
  const idSet = new Set(ids);
  const mutationCache = queryClient.getMutationCache();
  for (const mutation of mutationCache.findAll({ mutationKey: updateKey, predicate: isQueued })) {
    const id = queuedUpdateOf(mutation.state.variables)?.id;
    if (id && idSet.has(id)) mutationCache.remove(mutation);
  }
}

/**
 * Invalidate only after the final mutation in a grouped scope settles.
 * @see https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query
 */
export function invalidateIfLastMutation(queryClient: QueryClient, mutationKey: QueryKey, queryKey: QueryKey): void {
  // onSettled still counts the settling mutation, so above one a sibling is pending and invalidates when it settles.
  if (queryClient.isMutating({ mutationKey }) <= 1) queryClient.invalidateQueries({ queryKey });
}

/** Invalidate an entity's detail + list (and parent-org detail if nested) after a membership change, to resync counts. */
export function invalidateOnMembershipChange(
  queryClient: QueryClient,
  entityType: ChannelEntityType,
  entityId: string,
  organizationId?: string,
): void {
  const keys = getEntityQueryKeys(entityType);
  queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId) });
  queryClient.invalidateQueries({ queryKey: keys.list.base });

  if (organizationId && organizationId !== entityId) {
    const orgKeys = getEntityQueryKeys('organization');
    queryClient.invalidateQueries({ queryKey: orgKeys.detail.byId(organizationId) });
  }
}
