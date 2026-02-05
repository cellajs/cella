import { queryClient } from '~/query/query-client';

/**
 * Fetches data via React Query (for retries/error handling) and caches it under id.
 * Uses a unique throwaway query key with gcTime: 0 so no stale slug-based entries remain.
 */
export async function fetchSlugCacheId<T extends { id: string }>(
  fetcher: () => Promise<T>,
  cacheKey: (id: string) => readonly unknown[],
): Promise<T> {
  // Generate unique key to prevent cache collisions between different entity fetches
  const uniqueKey = `slug-fetch-${Date.now()}-${Math.random()}`;
  const data = await queryClient.fetchQuery({
    queryKey: [uniqueKey],
    queryFn: fetcher,
    gcTime: 0,
  });
  queryClient.setQueryData(cacheKey(data.id), data);
  return data;
}
