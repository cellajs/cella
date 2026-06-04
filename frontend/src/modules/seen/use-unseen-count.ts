import { useQuery } from '@tanstack/react-query';
import type { MembershipBase } from 'sdk';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { seenGroupingContextTypes } from '~/modules/seen/helpers';
import { unseenCountsQueryOptions } from '~/modules/seen/query';

/** Get the context entity ID from a membership */
const getMembershipContextId = (m: MembershipBase) => m.contextId;

/** Sum all product entity type counts for a single context entity */
const sumCounts = (counts: Record<string, number> | undefined) => {
  if (!counts) return 0;
  let total = 0;
  for (const v of Object.values(counts)) total += v;
  return total;
};

/**
 * Hook to get unseen count for one or more context entity IDs.
 * Uses `select` so the component only re-renders when its derived count actually changes.
 */
export function useUnseenCount(contextEntityIds: string | string[] | undefined) {
  const ids = !contextEntityIds ? [] : Array.isArray(contextEntityIds) ? contextEntityIds : [contextEntityIds];

  const { data } = useQuery({
    ...unseenCountsQueryOptions(),
    select: (raw) => {
      if (ids.length === 0) return 0;
      let total = 0;
      for (const id of ids) total += sumCounts(raw[id]);
      return total;
    },
  });

  return data ?? 0;
}

/**
 * Hook to get the total unseen count across all non-archived, non-muted context entities.
 * Used for the sidebar menu button badge.
 */
export function useTotalUnseenCount() {
  const { data: unseenData } = useQuery(unseenCountsQueryOptions());
  const { data: membershipsData } = useQuery(myMembershipsQueryOptions());

  if (!unseenData || !membershipsData) return 0;

  // Collect IDs of active memberships whose context type groups seen counts
  const activeIds = new Set<string>();
  for (const m of membershipsData.items) {
    if (!seenGroupingContextTypes.has(m.contextType) || m.muted || m.archived) continue;
    const id = getMembershipContextId(m);
    if (id) activeIds.add(id);
  }

  let total = 0;
  for (const [id, counts] of Object.entries(unseenData)) {
    if (activeIds.has(id)) total += sumCounts(counts);
  }
  return total;
}
