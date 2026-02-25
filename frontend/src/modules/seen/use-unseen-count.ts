import { useQuery } from '@tanstack/react-query';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { unseenCountsQueryOptions } from '~/modules/seen/query';

/** Sum all product entity type counts for a single context entity */
const sumCounts = (counts: Record<string, number> | undefined) => {
  if (!counts) return 0;
  let total = 0;
  for (const v of Object.values(counts)) total += v;
  return total;
};

/**
 * Entity-agnostic hook to get unseen count for one or more context entity IDs.
 * Works for organizations, projects, or any context entity.
 *
 * @param contextEntityIds - Single ID, array of IDs, or undefined
 * @returns Total unseen count across all provided context entities and their product entity types
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
 *
 * @returns Total unseen count excluding archived and muted entities
 */
export function useTotalUnseenCount() {
  const { data: unseenData } = useQuery(unseenCountsQueryOptions());
  const { data: membershipsData } = useQuery(myMembershipsQueryOptions());

  if (!unseenData || !membershipsData?.items) return 0;

  // Build set of context entity IDs that are not archived and not muted
  const activeIds = new Set(membershipsData.items.filter((m) => !m.archived && !m.muted).map((m) => m.organizationId));

  let total = 0;
  for (const [id, counts] of Object.entries(unseenData)) {
    if (activeIds.has(id)) total += sumCounts(counts);
  }
  return total;
}
