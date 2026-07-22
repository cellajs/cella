import { useQuery } from '@tanstack/react-query';
import type { MembershipBase } from 'sdk';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { seenGroupingChannelTypes } from '~/modules/seen/helpers';
import { unseenCountsQueryOptions } from '~/modules/seen/query';

/** Get the channel entity ID from a membership */
const getMembershipChannelId = (m: MembershipBase) => m.channelId;

/** Sum all product entity type counts for a single channel entity */
const sumCounts = (counts: Record<string, number> | undefined) => {
  if (!counts) return 0;
  let total = 0;
  for (const v of Object.values(counts)) total += v;
  return total;
};

/**
 * Hook to get unseen count for one or more channel entity IDs.
 * Uses `select` so the component only re-renders when its derived count actually changes.
 */
export function useUnseenCount(channelIds: string | string[] | undefined) {
  const ids = !channelIds ? [] : Array.isArray(channelIds) ? channelIds : [channelIds];

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
 * Hook to get the total unseen count across all non-archived, non-muted channel entities.
 * Used for the sidebar menu button badge.
 */
export function useTotalUnseenCount() {
  const { data: unseenData } = useQuery(unseenCountsQueryOptions());
  const { data: membershipsData } = useQuery(myMembershipsQueryOptions());

  if (!unseenData || !membershipsData) return 0;

  // Collect IDs of active memberships whose channel type groups seen counts
  const activeIds = new Set<string>();
  for (const m of membershipsData.items) {
    if (!seenGroupingChannelTypes.has(m.channelType) || m.muted || m.archived) continue;
    const id = getMembershipChannelId(m);
    if (id) activeIds.add(id);
  }

  let total = 0;
  for (const [id, counts] of Object.entries(unseenData)) {
    if (activeIds.has(id)) total += sumCounts(counts);
  }
  return total;
}
