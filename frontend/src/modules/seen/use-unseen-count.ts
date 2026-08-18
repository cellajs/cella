import { useQuery } from '@tanstack/react-query';
import type { MembershipBase } from 'sdk';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { seenGroupingChannelTypes } from '~/modules/seen/helpers';
import { unseenCountsQueryOptions } from '~/modules/seen/query';

const getMembershipChannelId = (m: MembershipBase) => m.channelId;

const sumCounts = (counts: Record<string, number> | undefined) => {
  if (!counts) return 0;
  let total = 0;
  for (const v of Object.values(counts)) total += v;
  return total;
};

/** Unseen count across one or more channel entity IDs; `select` limits re-renders to changes in that derived count. */
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

/** Total unseen count across non-archived, non-muted channel entities, for the sidebar menu button badge. */
export function useTotalUnseenCount() {
  const { data: unseenData } = useQuery(unseenCountsQueryOptions());
  const { data: membershipsData } = useQuery(myMembershipsQueryOptions());

  if (!unseenData || !membershipsData) return 0;

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
