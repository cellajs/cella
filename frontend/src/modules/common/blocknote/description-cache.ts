import type { QueryKey } from '@tanstack/react-query';
import type { ProductEntityType } from 'shared';
import { cacheUpdate } from '~/query/basic/cache-mutations';
import { findInCache } from '~/query/basic/find-in-list-cache';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';

/**
 * Optimistically apply a description patch to an entity's detail and org list caches.
 * Used while a collab session owns persistence: card/list views render from the query
 * cache, not the Y.Doc, so they need the patch immediately; the relay's persisted update
 * arrives via SSE with authoritative values.
 */
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
