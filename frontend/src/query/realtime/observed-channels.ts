import { hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';

/**
 * Reports whether an active list query carries the notified channel ID.
 * Prefetched queries have no observers and do not count as viewed.
 */
export function isObservedChannel(channelId: string): boolean {
  return queryClient
    .getQueryCache()
    .findAll({ type: 'active' })
    .some((query) => {
      const [entityType, kind] = query.queryKey;
      if (typeof entityType !== 'string' || kind !== 'list' || !hasEntityQueryKeys(entityType)) return false;
      return keyCarriesChannelId(query.queryKey, channelId);
    });
}

/** True when any segment past [entity, 'list'] is the id itself (scope key) or a filter object holding it. */
function keyCarriesChannelId(queryKey: readonly unknown[], channelId: string): boolean {
  for (let i = 2; i < queryKey.length; i++) {
    const segment = queryKey[i];
    if (segment === channelId) return true;
    if (segment && typeof segment === 'object' && Object.values(segment).includes(channelId)) return true;
  }
  return false;
}
