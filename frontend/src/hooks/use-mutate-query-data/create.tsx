import type { QueryKey } from '@tanstack/react-query';

import {
  changeArbitraryQueryData,
  changeInfiniteQueryData,
  changeQueryData,
  isArbitraryQueryData,
  isInfiniteQueryData,
  isQueryData,
} from '~/hooks/use-mutate-query-data/helpers';
import type { EntityData, ItemData } from '~/hooks/use-mutate-query-data/types';
import { queryClient } from '~/lib/router';
import type { Entity } from '~/types/common';

export const useMutateCreateData = (passedQueryKey: QueryKey, invalidateKeyGetter?: (item: ItemData) => QueryKey) => {
  return (items: ItemData[] | EntityData[], entity?: Entity) => {
    const passedQueryData = queryClient.getQueryData(passedQueryKey);

    const passedQuery: [QueryKey, unknown] = [passedQueryKey, passedQueryData];

    // get similar queries
    const similarQueries = queryClient.getQueriesData({ queryKey: passedQueryKey });
    // queries to update
    const queriesToWorkOn = passedQueryData ? [passedQuery] : similarQueries;

    // update  query data
    for (const [queryKey, queryData] of queriesToWorkOn) {
      // determine type of query
      if (isQueryData(queryData)) changeQueryData(queryKey, items, 'create');

      if (isInfiniteQueryData(queryData)) changeInfiniteQueryData(queryKey, items, 'create');

      if (entity && isArbitraryQueryData(queryData)) changeArbitraryQueryData(queryKey, items as EntityData[], 'create', entity);
    }

    if (invalidateKeyGetter) {
      // invalidate queries
      for (const item of items) {
        const queryKeyToInvalidate = invalidateKeyGetter(item);
        queryClient.invalidateQueries({ queryKey: queryKeyToInvalidate });
      }
    }
  };
};
