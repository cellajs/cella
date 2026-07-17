import { queryOptions } from '@tanstack/react-query';
import { getUnseenCounts } from 'sdk';
import { isSeenTracked, seenKeys } from '~/modules/seen/helpers';
import { noteUnseenReconciled } from '~/modules/seen/unseen-sync';
import { queryClient } from '~/query/query-client';

/** Refetch the server's exact unseen counts for a tracked entity type. */
export function invalidateUnseenCounts(entityType: string): void {
  if (!isSeenTracked(entityType)) return;
  queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
}

/**
 * The current user's unseen entity counts per channel (menu badges). This exact recount — on
 * focus, reconnect, and after catchup — is the baseline; between recounts, unseen-delta.ts and
 * unseen-sync.ts keep it live. Each response replaces all local deltas (`noteUnseenReconciled`).
 */
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
