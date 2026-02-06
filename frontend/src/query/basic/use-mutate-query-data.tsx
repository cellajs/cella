import type { QueryKey } from '@tanstack/react-query';
import type { ContextEntityType, EntityType, ProductEntityType } from 'shared';
import type { ContextEntityBase } from '~/api.gen';
import {
  changeArbitraryQueryData,
  changeInfiniteQueryData,
  changeQueryData,
  isArbitraryQueryData,
} from '~/query/basic/helpers';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { EntityIdAndType, ItemData, QueryDataActions, UseMutateQueryDataReturn } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';

// Overload signatures
export function useMutateQueryData(
  passedQueryKey: QueryKey,
  invalidateKeyGetter: (item: ItemData) => QueryKey,
  useInvalidateOnActions: QueryDataActions[],
): UseMutateQueryDataReturn;
export function useMutateQueryData(passedQueryKey: QueryKey): UseMutateQueryDataReturn;

/**
 * Custom hook for mutating query data in the cache (create, update, and remove actions).
 *
 * This hook provides functions to perform mutations on data associated with a query.
 * The create, update, and remove actions modify the cache
 * and can invalidate other queries based on the provided `invalidateKeyGetter`.
 *
 * @param passedQueryKey - Key of the query whose data will be mutated
 * @param invalidateKeyGetter - A function that returns a query key to invalidate when an action occurs
 * @param useInvalidateOnActions - Optional, Array of actions for which queries should be invalidated
 *
 */
export function useMutateQueryData(
  passedQueryKey: QueryKey,
  invalidateKeyGetter?: (item: ItemData) => QueryKey,
  useInvalidateOnActions?: QueryDataActions[],
): UseMutateQueryDataReturn {
  // mutation function
  function dataMutation(
    items: ItemData[] | EntityIdAndType[] | ContextEntityBase[],
    action: QueryDataActions,
    entity?: EntityType,
    keyToOperateIn?: string,
  ) {
    const passedQueryData = queryClient.getQueryData(passedQueryKey);
    const passedQuery: [QueryKey, unknown] = [passedQueryKey, passedQueryData];

    const similarQueries = queryClient.getQueriesData({ queryKey: passedQueryKey });
    const queriesToWorkOn = passedQueryData ? [passedQuery] : similarQueries;

    for (const [queryKey, queryData] of queriesToWorkOn) {
      // Determine type of query and apply action
      if (isQueryData(queryData)) changeQueryData(queryKey, items, action);
      if (isInfiniteQueryData(queryData)) changeInfiniteQueryData(queryKey, items, action);
      if (entity && isArbitraryQueryData(queryData))
        changeArbitraryQueryData(queryKey, items as EntityIdAndType[], action, entity, keyToOperateIn);
    }

    // Handle detail queries if invalidateKeyGetter is provided and the action is included in useInvalidateOnActions
    if (invalidateKeyGetter && useInvalidateOnActions?.includes(action)) {
      for (const item of items) {
        const queryKey = invalidateKeyGetter(item);
        // For remove action, remove the query from cache to prevent refetch of deleted entities
        // For other actions, invalidate to trigger a refetch
        if (action === 'remove') {
          queryClient.removeQueries({ queryKey });
        } else {
          queryClient.invalidateQueries({ queryKey });
        }
      }
    }
  }

  // Overload functions for action
  function create(items: ItemData[]): void;
  function create(items: ContextEntityBase[], entityType: ContextEntityType, keyToOperateIn?: string): void;
  function create(items: EntityIdAndType[], entityType: ProductEntityType, keyToOperateIn: string): void;
  function create(
    items: ItemData[] | EntityIdAndType[] | ContextEntityBase[],
    entity?: ProductEntityType | ContextEntityType,
    keyToOperateIn?: string,
  ) {
    dataMutation(items, 'create', entity, keyToOperateIn);
  }

  function update(items: ItemData[]): void;
  function update(items: ContextEntityBase[], entityType: ContextEntityType, keyToOperateIn?: string): void;
  function update(items: EntityIdAndType[], entityType: ProductEntityType, keyToOperateIn: string): void;
  function update(
    items: ItemData[] | EntityIdAndType[] | ContextEntityBase[],
    entity?: ProductEntityType | ContextEntityType,
    keyToOperateIn?: string,
  ) {
    dataMutation(items, 'update', entity, keyToOperateIn);
  }

  function remove(items: ItemData[]): void;
  function remove(items: ContextEntityBase[], entityType: ContextEntityType, keyToOperateIn?: string): void;
  function remove(items: EntityIdAndType[], entityType: ProductEntityType, keyToOperateIn: string): void;
  function remove(
    items: ItemData[] | EntityIdAndType[] | ContextEntityBase[],
    entity?: ProductEntityType | ContextEntityType,
    keyToOperateIn?: string,
  ) {
    dataMutation(items, 'remove', entity, keyToOperateIn);
  }

  return { create, update, remove };
}
