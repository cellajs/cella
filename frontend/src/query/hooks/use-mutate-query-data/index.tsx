import type { QueryKey } from '@tanstack/react-query';
import type { ContextEntityType, EntityType, ProductEntityType } from 'config';
import { isInfiniteQueryData, isQueryData } from '~/query/helpers/mutate-query';
import {
  changeArbitraryQueryData,
  changeInfiniteQueryData,
  changeQueryData,
  isArbitraryQueryData,
} from '~/query/hooks/use-mutate-query-data/helpers';
import type {
  ContextEntityTypeData,
  EntityData,
  ItemData,
  QueryDataActions,
  UseMutateQueryDataReturn,
} from '~/query/hooks/use-mutate-query-data/types';
import { queryClient } from '~/query/query-client';

// Overload signatures
export function useMutateQueryData(
  passedQueryKey: QueryKey,
  invalidateKeyGetter: (item: ItemData) => QueryKey,
  useInvalidateOnActions: QueryDataActions[],
): UseMutateQueryDataReturn;
export function useMutateQueryData(passedQueryKey: QueryKey): UseMutateQueryDataReturn;

/**
 * Custom hook for mutating query data in the cache (create, update, updateMembership, and remove actions).
 *
 * This hook provides functions to perform mutations on data associated with a query.
 * The create, update, updateMembership, and remove actions actions modify the cache
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
    items: ItemData[] | EntityData[] | ContextEntityTypeData[],
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
      if (entity && isArbitraryQueryData(queryData)) changeArbitraryQueryData(queryKey, items as EntityData[], action, entity, keyToOperateIn);
    }

    // Invalidate queries if invalidateKeyGetter is provided and the action is included in useInvalidateOnActions
    if (invalidateKeyGetter && useInvalidateOnActions?.includes(action)) {
      for (const item of items) {
        const queryKeyToInvalidate = invalidateKeyGetter(item);
        queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate });
      }
    }
  }

  // Overload functions for action
  function create(items: ItemData[]): void;
  function create(items: ContextEntityTypeData[], entityType: ContextEntityType, keyToOperateIn?: string): void;
  function create(items: EntityData[], entityType: ProductEntityType, keyToOperateIn: string): void;
  function create(
    items: ItemData[] | EntityData[] | ContextEntityTypeData[],
    entity?: ProductEntityType | ContextEntityType,
    keyToOperateIn?: string,
  ) {
    dataMutation(items, 'create', entity, keyToOperateIn);
  }

  function update(items: ItemData[]): void;
  function update(items: ContextEntityTypeData[], entityType: ContextEntityType, keyToOperateIn?: string): void;
  function update(items: EntityData[], entityType: ProductEntityType, keyToOperateIn: string): void;
  function update(
    items: ItemData[] | EntityData[] | ContextEntityTypeData[],
    entity?: ProductEntityType | ContextEntityType,
    keyToOperateIn?: string,
  ) {
    dataMutation(items, 'update', entity, keyToOperateIn);
  }

  function updateMembership(items: ItemData[]): void;
  function updateMembership(items: ContextEntityTypeData[], entityType: ContextEntityType, keyToOperateIn?: string): void;
  function updateMembership(items: ItemData[] | ContextEntityTypeData[], entity?: ProductEntityType | ContextEntityType, keyToOperateIn?: string) {
    dataMutation(items, 'updateMembership', entity, keyToOperateIn);
  }

  function remove(items: ItemData[]): void;
  function remove(items: ContextEntityTypeData[], entityType: ContextEntityType, keyToOperateIn?: string): void;
  function remove(items: EntityData[], entityType: ProductEntityType, keyToOperateIn: string): void;
  function remove(
    items: ItemData[] | EntityData[] | ContextEntityTypeData[],
    entity?: ProductEntityType | ContextEntityType,
    keyToOperateIn?: string,
  ) {
    dataMutation(items, 'remove', entity, keyToOperateIn);
  }

  return { create, update, updateMembership, remove };
}
