import { useQuery } from '@tanstack/react-query';
import { appConfig } from 'shared';
import type { MembershipBase } from '~/api.gen';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { seenGroupingContextTypes } from '~/modules/seen/helpers';
import { unseenCountsQueryOptions } from '~/modules/seen/query';

/** Get the context entity ID from a membership based on its contextType */
const getMembershipContextId = (m: MembershipBase) =>
  String(m[appConfig.entityIdColumnKeys[m.contextType] as keyof MembershipBase]);

/** Sum all product entity type counts for a single context entity */
const sumCounts = (counts: Record<string, number> | undefined) => {
  if (!counts) return 0;
  let total = 0;
  for (const v of Object.values(counts)) total += v;
  return total;
};

/**
 * Hook to get unseen count for one or more context entity IDs.
 */
export function useUnseenCount(contextEntityIds: string | string[] | undefined) {
  const { data } = useQuery(unseenCountsQueryOptions());

  if (!contextEntityIds || !data) return 0;

  const ids = Array.isArray(contextEntityIds) ? contextEntityIds : [contextEntityIds];
  let total = 0;
  for (const id of ids) total += sumCounts(data[id]);
  return total;
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
