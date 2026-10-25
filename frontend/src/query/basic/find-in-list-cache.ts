import type { QueryKey } from '@tanstack/react-query';
import type { EntityType } from 'shared';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { queryClient } from '~/query/query-client';

/** Checks the detail cache first, then list caches. The matcher is an id or a predicate. */
export function findInCache<T extends { id: string }>(entityType: string, matcher: string | ((item: T) => boolean)): T | undefined {
  if (typeof matcher === 'string') {
    const detailKey: QueryKey = [entityType, 'detail', matcher];
    const detail = queryClient.getQueryData<T>(detailKey);
    if (detail) return detail;
  }

  const queryKey = [entityType, 'list'];
  const queries = queryClient.getQueryCache().findAll({ queryKey });
  const predicate = typeof matcher === 'string' ? (item: T) => item.id === matcher : matcher;

  for (const query of queries) {
    const items = flattenInfiniteData<T>(query.state.data);
    const found = items.find(predicate);
    if (found) return found;
  }

  return undefined;
}

export function createCacheFinder<T extends { id: string }>(entityType: EntityType) {
  return (matcher: string | ((item: T) => boolean)): T | undefined => findInCache<T>(entityType, matcher);
}
