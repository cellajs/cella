import { useQuery } from '@tanstack/react-query';
import type { MembershipBase } from 'sdk';
import { hierarchy } from 'shared';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { seenGroupingChannelTypes } from '~/modules/seen/helpers';
import { unseenCountsQueryOptions } from '~/modules/seen/query';

/** Whether an ancestor below the organization is archived; the organization row's archived flag only files that row under its section's toggle. */
const hasArchivedAncestor = (membership: MembershipBase, archivedChannelIds: Set<string>) =>
  hierarchy.resolveNonNullAncestors(membership.channelType, membership).some(({ type, id }) => type !== 'organization' && archivedChannelIds.has(id));

const sumCounts = (counts: Record<string, number> | undefined) => {
  if (!counts) return 0;
  let total = 0;
  for (const count of Object.values(counts)) total += count;
  return total;
};

/** Unseen count across one or more channel entity IDs; `select` limits re-renders to changes in that derived count. */
export function useUnseenCount(channelIds: string[]) {
  const { data } = useQuery({
    ...unseenCountsQueryOptions(),
    select: (raw) => {
      let total = 0;
      for (const id of channelIds) total += sumCounts(raw[id]);
      return total;
    },
  });

  return data ?? 0;
}

/**
 * Unseen counts by organization id across its non-archived, non-muted channel entities, whichever menu section lists them.
 * The rail, the organization switcher and the menu button badge all read these, so their counts add up.
 */
export function useOrganizationUnseenCounts() {
  const { data: unseenData } = useQuery(unseenCountsQueryOptions());
  const { data: membershipsData } = useQuery(myMembershipsQueryOptions());

  const counts = new Map<string, number>();
  if (!unseenData || !membershipsData) return counts;

  // A sub-channel under an archived channel belongs to that channel's archived toggle, though its own row stays unarchived.
  const archivedChannelIds = new Set<string>();
  for (const membership of membershipsData.items) {
    if (membership.archived) archivedChannelIds.add(membership.channelId);
  }

  for (const membership of membershipsData.items) {
    if (!seenGroupingChannelTypes.has(membership.channelType) || membership.muted || membership.archived) continue;
    if (hasArchivedAncestor(membership, archivedChannelIds)) continue;
    const count = sumCounts(unseenData[membership.channelId]);
    if (count) counts.set(membership.organizationId, (counts.get(membership.organizationId) ?? 0) + count);
  }
  return counts;
}

/** Total unseen count across non-archived, non-muted channel entities, for the menu button badge. */
export function useTotalUnseenCount() {
  let total = 0;
  for (const count of useOrganizationUnseenCounts().values()) total += count;
  return total;
}
