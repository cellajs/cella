import { queryOptions } from '@tanstack/react-query';
import { getUnseenCounts } from 'sdk';
import { isSeenTracked, seenKeys } from '~/modules/seen/helpers';
import { noteUnseenReconciled } from '~/modules/seen/unseen-sync';
import { queryClient } from '~/query/query-client';

export function invalidateUnseenCounts(entityType: string): void {
  if (!isSeenTracked(entityType)) return;
  queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
}

/** Exact unseen counts per channel for menu badges; each response replaces all local deltas (`noteUnseenReconciled`). */
export const unseenCountsQueryOptions = () =>
  queryOptions({
    queryKey: seenKeys.unseenCounts,
    queryFn: async () => {
      const counts = await getUnseenCounts();
      noteUnseenReconciled();
      return counts;
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
