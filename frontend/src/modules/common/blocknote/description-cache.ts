import type { QueryKey } from '@tanstack/react-query';
import type { ProductEntityType } from 'shared';
import { cacheUpdate } from '~/query/basic/cache-mutations';
import { findInCache } from '~/query/basic/find-in-list-cache';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';

/** Card and list views render from the query cache, not the Y.Doc, so a collab session patches them here until the relay update arrives via SSE. */
export const patchDescriptionCaches = (
  entityType: ProductEntityType,
  id: string,
  keys: { detailKey: QueryKey; listKey: QueryKey },
  patch: Record<string, unknown>,
) => {
  queryClient.setQueryData<ItemData>(keys.detailKey, (old) => (old ? { ...old, ...patch } : undefined));
  const cached = findInCache<ItemData>(entityType, id);
  if (cached) cacheUpdate(keys.listKey, [{ ...cached, ...patch }]);
};
