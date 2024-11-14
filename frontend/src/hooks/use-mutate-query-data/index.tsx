import type { QueryKey } from '@tanstack/react-query';
import { changeArbitraryQueryData, changeInfiniteQueryData, changeQueryData, isArbitraryQueryData } from '~/hooks/use-mutate-query-data/helpers';
import type { EntityData, ItemData, QueryDataActions, UseMutateQueryDataReturn } from '~/hooks/use-mutate-query-data/types';
import { queryClient } from '~/lib/router';
import type { ContextEntity } from '~/types/common';
import { isInfiniteQueryData, isQueryData } from '~/utils/mutate-query';

// Overload signatures
export function useMutateQueryData(
  passedQueryKey: QueryKey,
  invalidateKeyGetter: (item: ItemData) => QueryKey,
  useInvalidateOnActions: QueryDataActions[],
): UseMutateQueryDataReturn;
export function useMutateQueryData(passedQueryKey: QueryKey): UseMutateQueryDataReturn;

export function useMutateQueryData(
  passedQueryKey: QueryKey,
  invalidateKeyGetter?: (item: ItemData) => QueryKey,
  useInvalidateOnActions?: QueryDataActions[],
): UseMutateQueryDataReturn {
  // mutation function
  function dataMutation(items: ItemData[] | EntityData[], action: QueryDataActions, entity?: ContextEntity) {
    const passedQueryData = queryClient.getQueryData(passedQueryKey);
    const passedQuery: [QueryKey, unknown] = [passedQueryKey, passedQueryData];

    const similarQueries = queryClient.getQueriesData({ queryKey: passedQueryKey });
    const queriesToWorkOn = passedQueryData ? [passedQuery] : similarQueries;

    for (const [queryKey, queryData] of queriesToWorkOn) {
      // Determine type of query and apply action
      if (isQueryData(queryData)) changeQueryData(queryKey, items, action);
      if (isInfiniteQueryData(queryData)) changeInfiniteQueryData(queryKey, items, action);
      if (entity && isArbitraryQueryData(queryData)) changeArbitraryQueryData(queryKey, items as EntityData[], action, entity);
    }

    // Invalidate queries if invalidateKeyGetter is provided and the action is included in useInvalidateOnActions
    if (invalidateKeyGetter && useInvalidateOnActions?.includes(action)) {
      for (const item of items) {
        const queryKeyToInvalidate = invalidateKeyGetter(item);
        queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate });
      }
    }
  }

  // Overloaded functions for action
  function create(items: ItemData[]): void;
  function create(items: EntityData[], entity: ContextEntity): void;
  function create(items: ItemData[] | EntityData[], entity?: ContextEntity) {
    dataMutation(items, 'create', entity);
  }

  function update(items: ItemData[]): void;
  function update(items: EntityData[], entity: ContextEntity): void;
  function update(items: ItemData[] | EntityData[], entity?: ContextEntity) {
    dataMutation(items, 'update', entity);
  }

  function updateMembership(items: ItemData[]): void;
  function updateMembership(items: EntityData[], entity: ContextEntity): void;
  function updateMembership(items: ItemData[] | EntityData[], entity?: ContextEntity) {
    dataMutation(items, 'updateMembership', entity);
  }

  function remove(items: ItemData[]): void;
  function remove(items: EntityData[], entity: ContextEntity): void;
  function remove(items: ItemData[] | EntityData[], entity?: ContextEntity) {
    dataMutation(items, 'delete', entity);
  }

  return { create, update, updateMembership, remove };
}
