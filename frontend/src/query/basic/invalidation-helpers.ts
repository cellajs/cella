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
 * Marks the queries under `queryKey` for a refetch, and refetches the active ones only once the settling mutation is the
 * last of `mutationKey` and has left the pending set: a refetch while a sibling is pending would replace its optimistic
 * rows, and a sibling that settles without a refetch leaves the mark for the next open or background fill.
 * @see https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query
 */
export function invalidateIfLastMutation(queryClient: QueryClient, mutationKey: QueryKey, queryKey: QueryKey): void {
  const mutationCache = queryClient.getMutationCache();
  // onSettled still counts the settling mutation, so a second pending one is a sibling.
  const [settling, sibling] = mutationCache.findAll({ mutationKey, status: 'pending' });
  queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
  if (sibling) return;
  const refetch = () => queryClient.refetchQueries({ queryKey, type: 'active' });
  if (!settling) {
    refetch();
    return;
  }

  // A list read started while the settling mutation counts as pending keeps its rows as cached (`keepPendingRows`).
  const unsubscribe = mutationCache.subscribe(({ type, mutation }) => {
    if (mutation !== settling || (type !== 'removed' && settling.state.status === 'pending')) return;
    unsubscribe();
    refetch();
  });
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
