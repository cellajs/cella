import { onlineManager, type UseInfiniteQueryOptions, type UseQueryOptions } from '@tanstack/react-query';

import { queryClient } from '~/query/query-client';
import type { InferType } from '~/query/types';

// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export async function prefetchQuery<T extends UseQueryOptions<any, any, any, any>>(options: T): Promise<InferType<T>>;
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export async function prefetchQuery<T extends UseInfiniteQueryOptions<any, any, any, any>>(options: T): Promise<InferType<T>>;

/**
 * Prefetches a query and returns cached data if available.
 * If the data is not cached and the user is online, it fetches the query.
 *
 * @param options - Query options for a regular or infinite query.
 * @returns Cached data if available, or fetched data if online; otherwise undefined.
 */
export async function prefetchQuery(options: UseQueryOptions | UseInfiniteQueryOptions) {
  if (!onlineManager.isOnline()) return undefined;

  // fetch if online (avoid fetch when offline or during hydration)
  if ('getNextPageParam' in options) return queryClient.ensureInfiniteQueryData(options); // Infinite query fetch
  return queryClient.ensureQueryData(options); // Regular query fetch
}
