import { type FetchInfiniteQueryOptions, type FetchQueryOptions, onlineManager } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';

/**
 * Function to fetch data with offline support. If online, it will attempt to fetch data and perform a background revalidation.
 * If offline, it will attempt to return cached data. If there is an error during the fetch,
 * it will fall back to cached data if available.
 *
 * @param options - Fetch query options that define the query behavior, including the query key and parameters.
 * @param refetchIfOnline - Optional, flag to control refetching online (default: `true`).
 * @returns Returns query data or undefined.
 */
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export const hybridFetch = async <T>(options: FetchQueryOptions<any, any, any, any>, refetchIfOnline = true): Promise<T | undefined> => {
  const { queryKey } = options;
  const cachedData = queryClient.getQueryData<T>(queryKey);

  // If offline, return cached data if available
  if (!onlineManager.isOnline()) return cachedData ?? undefined;

  try {
    // Cancel queries (avoid CancelledError) and invalidate queries to trigger re-fetch if online
    if (refetchIfOnline) {
      queryClient.cancelQueries({ queryKey, exact: true }).then(() => queryClient.invalidateQueries({ queryKey, exact: true }));
    }
    return queryClient.fetchQuery(options);
  } catch (error) {
    return cachedData ?? undefined; // Fallback to cached data if available
  }
};

/**
 * Function to fetch infinite data. If online, fetches the query even if there is cached. If offline or an error occurs, it tries to get the cached data.
 *
 * @param options - Fetch infinite query options that define the query behavior and parameters,
 * including the query key and other settings.
 * @param refetchIfOnline - Optional, flag to control refetching online (default: `true`).
 * @returns Returns query data or undefined.
 */
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export const hybridFetchInfinite = async (options: FetchInfiniteQueryOptions<any, any, any, any, any>, refetchIfOnline = true) => {
  const { queryKey } = options;
  const cachedData = queryClient.getQueryData(queryKey);

  // If offline, return cached data if available
  if (!onlineManager.isOnline()) return cachedData ?? undefined;

  try {
    // Cancel queries (avoid CancelledError) and invalidate queries to trigger re-fetch if online
    if (refetchIfOnline) {
      queryClient.cancelQueries({ queryKey, exact: true }).then(() => queryClient.invalidateQueries({ queryKey, exact: true }));
    }
    return queryClient.fetchInfiniteQuery(options);
  } catch (error) {
    return cachedData ?? undefined; // Fallback to cached data if available
  }
};
