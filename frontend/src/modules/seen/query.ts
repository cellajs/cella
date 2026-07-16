import { queryOptions } from '@tanstack/react-query';
import { getUnseenCounts } from 'sdk';
import { appConfig } from 'shared';
import { queryClient } from '~/query/query-client';

export const seenKeys = {
  unseenCounts: ['me', 'unseen', 'counts'],
};

/** Refetch the server's predicate-exact unseen counts for a tracked entity type. */
export function invalidateUnseenCounts(entityType: string): void {
  if (!(appConfig.seenTrackedEntityTypes as readonly string[]).includes(entityType)) return;
  queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
}

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
