import { queryOptions } from '@tanstack/react-query';
import { getUnseenCounts } from 'sdk';

export const seenKeys = {
  unseenCounts: ['me', 'unseen', 'counts'],
};

/**
 * Query options for fetching the current user's unseen entity counts per org.
 * Used by menu badges to show how many new entities the user hasn't viewed.
 */
export const unseenCountsQueryOptions = () =>
  queryOptions({
    queryKey: seenKeys.unseenCounts,
    queryFn: () => getUnseenCounts(),
    staleTime: 60 * 1000, // 1 minute, refetch on SSE entity.created or menu open
  });
