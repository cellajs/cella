import { queryClient } from '~/query/query-client';

/** Fetches through React Query for its retry and error handling, then caches under the id. The throwaway key with gcTime 0 leaves no stale slug-based entry. */
export async function fetchSlugCacheId<T extends { id: string }>(
  fetcher: () => Promise<T>,
  cacheKey: (id: string) => readonly unknown[],
): Promise<T> {
  // Unique per call, so concurrent entity fetches cannot collide.
  const uniqueKey = `slug-fetch-${Date.now()}-${Math.random()}`;
  const data = await queryClient.fetchQuery({
    queryKey: [uniqueKey],
    queryFn: fetcher,
    gcTime: 0,
  });
  queryClient.setQueryData(cacheKey(data.id), data);
  return data;
}
