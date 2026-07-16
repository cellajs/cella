import { queryOptions } from '@tanstack/react-query';
import { getUnseenCounts } from 'sdk';
import { appConfig } from 'shared';
import { noteUnseenReconciled } from '~/modules/seen/seen-store';
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
 * Used by menu badges. Live maintenance is the unseen ledger (deltas from synced rows +
 * view-marks); this exact recount is the baseline + reconcile — on focus, reconnect, and
 * after catchup — and it wins wholesale (the ledger re-anchors on every response).
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
