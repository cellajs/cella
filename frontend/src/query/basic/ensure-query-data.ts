import {
  type EnsureQueryDataOptions,
  type QueryClient,
  type UseInfiniteQueryOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import type { InferType } from '~/query/types';

/**
 * Ensures query data is available, falling back to cache if fetch fails.
 * With networkMode: 'offlineFirst', this provides defensive error handling
 * for edge cases where ensureQueryData might throw unexpectedly.
 *
 * @param options - Query options for a regular or infinite query.
 * @param client - Optional QueryClient instance (defaults to global queryClient).
 * @returns Cached or fetched data, or undefined if neither succeeds.
 */
export async function ensureQueryDataWithFallback<T, TQueryKey extends readonly unknown[]>(
  options: EnsureQueryDataOptions<T, Error, T, TQueryKey>,
  client: QueryClient = queryClient,
): Promise<T | undefined> {
  try {
    return await client.ensureQueryData(options);
  } catch (error) {
    // Log error for debugging before falling back to cache
    console.warn('[ensureQueryDataWithFallback] Fetch failed, falling back to cache:', error);
    // If fetch fails (e.g., offline), try to return cached data
    return client.getQueryData(options.queryKey);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export async function prefetchQuery<T extends UseQueryOptions<any, any, any, any>>(
  options: T,
  client?: QueryClient,
): Promise<InferType<T>>;
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export async function prefetchQuery<T extends UseInfiniteQueryOptions<any, any, any, any>>(
  options: T,
  client?: QueryClient,
): Promise<InferType<T>>;

/**
 * Prefetches a query and returns cached data if available.
 * Works with networkMode: 'offlineFirst' to handle offline scenarios gracefully.
 * Returns undefined if data cannot be fetched and no cache exists.
 *
 * @param options - Query options for a regular or infinite query.
 * @param client - Optional QueryClient instance (defaults to global queryClient).
 * @returns Cached data if available, fetched data if online, or undefined.
 */
export async function prefetchQuery(
  options: UseQueryOptions | UseInfiniteQueryOptions,
  client: QueryClient = queryClient,
) {
  try {
    if ('getNextPageParam' in options) return await client.ensureInfiniteQueryData(options);
    return await client.ensureQueryData(options);
  } catch (error) {
    // Log error and return undefined - prefetch should not crash the app
    console.warn('[prefetchQuery] Prefetch failed:', error);
    return undefined;
  }
}
