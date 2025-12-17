import type { ContextEntityType } from 'config';
import { flattenCachedToArray, useQueryCacheSelector } from './helpers';

export function useCachedEntityList<T>(entityType: ContextEntityType): T[] {
  return useQueryCacheSelector(
    (qc) => {
      const queries = qc.getQueriesData({ queryKey: [entityType] });
      // if multiple queries exist, merge them
      return queries.flatMap(([, cached]) => flattenCachedToArray<T>(cached));
    },
    [entityType],
  );
}
