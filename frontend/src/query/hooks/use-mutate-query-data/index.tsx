import type { QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/lib/router';
import { isInfiniteQueryData, isQueryData } from '~/query/helpers/mutate-query';
import {
  changeArbitraryQueryData,
  changeInfiniteQueryData,
  changeQueryData,
  isArbitraryQueryData,
} from '~/query/hooks/use-mutate-query-data/helpers';
import type { ContextEntityData, EntityData, ItemData, QueryDataActions, UseMutateQueryDataReturn } from '~/query/hooks/use-mutate-query-data/types';
import type { ContextEntity, Entity } from '~/types/common';
import type { ProductEntity } from '#/types/common';

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
  function dataMutation(items: ItemData[] | EntityData[] | ContextEntityData[], action: QueryDataActions, entity?: Entity, keyToOperateIn?: string) {
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

  // Overloaded functions for action
  function create(items: ItemData[]): void;
  function create(items: ContextEntityData[], entity: ContextEntity, keyToOperateIn?: string): void;
  function create(items: EntityData[], entity: ProductEntity, keyToOperateIn: string): void;
  function create(items: ItemData[] | EntityData[] | ContextEntityData[], entity?: ProductEntity | ContextEntity, keyToOperateIn?: string) {
    dataMutation(items, 'create', entity, keyToOperateIn);
  }

  function update(items: ItemData[]): void;
  function update(items: ContextEntityData[], entity: ContextEntity, keyToOperateIn?: string): void;
  function update(items: EntityData[], entity: ProductEntity, keyToOperateIn: string): void;
  function update(items: ItemData[] | EntityData[] | ContextEntityData[], entity?: ProductEntity | ContextEntity, keyToOperateIn?: string) {
    dataMutation(items, 'update', entity, keyToOperateIn);
  }

  function updateMembership(items: ItemData[]): void;
  function updateMembership(items: ContextEntityData[], entity: ContextEntity, keyToOperateIn?: string): void;
  function updateMembership(items: ItemData[] | ContextEntityData[], entity?: ProductEntity | ContextEntity, keyToOperateIn?: string) {
    dataMutation(items, 'updateMembership', entity, keyToOperateIn);
  }

  function remove(items: ItemData[]): void;
  function remove(items: ContextEntityData[], entity: ContextEntity, keyToOperateIn?: string): void;
  function remove(items: EntityData[], entity: ProductEntity, keyToOperateIn: string): void;
  function remove(items: ItemData[] | EntityData[] | ContextEntityData[], entity?: ProductEntity | ContextEntity, keyToOperateIn?: string) {
    dataMutation(items, 'delete', entity, keyToOperateIn);
  }

  return { create, update, updateMembership, remove };
}
