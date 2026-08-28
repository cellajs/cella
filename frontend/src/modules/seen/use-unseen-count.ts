import { useQuery } from '@tanstack/react-query';
import type { MembershipBase } from 'sdk';
import { appConfig, hierarchy } from 'shared';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { seenGroupingChannelTypes } from '~/modules/seen/helpers';
import { unseenCountsQueryOptions } from '~/modules/seen/query';

const getMembershipChannelId = (m: MembershipBase) => m.channelId;

/**
 * True when a non-root ancestor channel of this membership (e.g. the channel above a sub-channel) is in
 * `archivedChannelIds`. The root (org) membership row is an auto-created shell whose archived flag
 * only tucks the org row into its own section's archived toggle; it must not hide subtree badges,
 * or the total would diverge from the sum of the section toggles.
 */
const hasArchivedAncestor = (m: MembershipBase, archivedChannelIds: Set<string>) => {
  for (const ancestor of hierarchy.getOrderedAncestors(m.channelType)) {
    if (hierarchy.getParent(ancestor) === null) continue;
    const idKey = appConfig.entityIdColumnKeys[ancestor as keyof typeof appConfig.entityIdColumnKeys];
    const ancestorId = (m as unknown as Record<string, string | null | undefined>)[idKey];
    if (ancestorId && archivedChannelIds.has(ancestorId)) return true;
  }
  return false;
};

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

  // Archived anywhere in the chain excludes a channel: a sub-channel under an archived channel
  // belongs to the archived toggle, not the total (its own membership row stays unarchived).
  const archivedChannelIds = new Set<string>();
  for (const m of membershipsData.items) {
    if (m.archived) archivedChannelIds.add(m.channelId);
  }

  const activeIds = new Set<string>();
  for (const m of membershipsData.items) {
    if (!seenGroupingChannelTypes.has(m.channelType) || m.muted || m.archived) continue;
    if (hasArchivedAncestor(m, archivedChannelIds)) continue;
    const id = getMembershipChannelId(m);
    if (id) activeIds.add(id);
  }

  let total = 0;
  for (const [id, counts] of Object.entries(unseenData)) {
    if (activeIds.has(id)) total += sumCounts(counts);
  }
  return total;
}
