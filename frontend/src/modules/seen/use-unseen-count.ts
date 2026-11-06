import { useQuery } from '@tanstack/react-query';
import { unseenCountsQueryOptions } from '~/modules/seen/query';

const sumCounts = (counts: Record<string, number> | undefined) => {
  if (!counts) return 0;
  let total = 0;
  for (const count of Object.values(counts)) total += count;
  return total;
};

/** The unseen count across channel ids in a `/me/unseen-counts` response. */
export const sumUnseenCounts = (raw: Record<string, Record<string, number>>, channelIds: string[]) => {
  let total = 0;
  for (const id of channelIds) total += sumCounts(raw[id]);
  return total;
};

/** Unseen count across one or more channel entity IDs; `select` limits re-renders to changes in that derived count. */
export function useUnseenCount(channelIds: string[]) {
  const { data } = useQuery({
    ...unseenCountsQueryOptions(),
    select: (raw) => sumUnseenCounts(raw, channelIds),
  });

  return data ?? 0;
}
