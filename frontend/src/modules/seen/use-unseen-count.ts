import { useQuery } from '@tanstack/react-query';
import { unseenCountsQueryOptions } from '~/modules/me/query';

/**
 * Hook to get the total unseen count for a specific organization.
 * Aggregates across all product entity types.
 *
 * @param organizationId - Org ID to get unseen count for
 * @returns Total unseen count (0 if loading, error, or no data)
 */
export function useUnseenCount(organizationId: string | undefined) {
  const { data } = useQuery(unseenCountsQueryOptions());

  if (!organizationId || !data?.counts) return 0;

  return data.counts.filter((c) => c.organizationId === organizationId).reduce((sum, c) => sum + c.unseenCount, 0);
}

/**
 * Hook to get unseen counts broken down by entity type for a specific org.
 *
 * @param organizationId - Org ID to get unseen counts for
 * @returns Array of { entityType, unseenCount } entries
 */
export function useUnseenCountsByType(organizationId: string | undefined) {
  const { data } = useQuery(unseenCountsQueryOptions());

  if (!organizationId || !data?.counts) return [];

  return data.counts.filter((c) => c.organizationId === organizationId);
}
