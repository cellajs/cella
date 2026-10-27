import { useInfiniteQuery } from '@tanstack/react-query';
import type { ChannelEntityType } from 'shared';
import { getChannelListQueries } from '~/lib/entity-modules';
import type { ChannelListParams } from '~/query/types';

/**
 * The list query of each entity type in `entityTypes` whose module declares one, in that order. It runs one hook per
 * entry: `entityTypes` is a module constant and the registry is complete before first render, so the count holds.
 */
export function useChannelListQueries(entityTypes: readonly ChannelEntityType[], params: ChannelListParams, enabled = true) {
  const listQueries = getChannelListQueries();
  return entityTypes.flatMap((entityType) => {
    const listQuery = listQueries[entityType];
    return listQuery ? [{ entityType, query: useInfiniteQuery({ ...listQuery(params), enabled }) }] : [];
  });
}
