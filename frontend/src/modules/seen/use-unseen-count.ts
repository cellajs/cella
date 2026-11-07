import { useQuery } from '@tanstack/react-query';
import { unseenCountsQueryOptions } from '~/modules/seen/query';

/** The unseen count across channel ids in a `/me/unseen-counts` response. */
export const sumUnseenCounts = (raw: Record<string, Record<string, number>>, channelIds: string[]) => {
  let total = 0;
  for (const id of channelIds) for (const count of Object.values(raw[id] ?? {})) total += count;
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
