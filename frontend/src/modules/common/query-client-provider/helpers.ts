import { type QueryKey, type UseInfiniteQueryOptions, type UseQueryOptions, onlineManager } from '@tanstack/react-query';

import { queryClient } from '~/lib/router';
import type { InferType } from '~/modules/common/query-client-provider/types';

// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export async function prefetchQuery<T extends UseQueryOptions<any, any, any, any>>(options: T): Promise<InferType<T>>;
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export async function prefetchQuery<T extends UseInfiniteQueryOptions<any, any, any, any>>(options: T): Promise<InferType<T>>;
export async function prefetchQuery(options: UseQueryOptions | UseInfiniteQueryOptions) {
  const cachedData = queryClient.getQueryData(options.queryKey);

  // If cache exists, return cached data immediately
  if (cachedData) return cachedData;

  if (!onlineManager.isOnline()) return undefined;

  // fetch if online (avoid fetch when offline or during hydration)
  if ('getNextPageParam' in options) return queryClient.fetchInfiniteQuery(options); // Infinite query fetch
  return queryClient.fetchQuery(options); // Regular query fetch
}

export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const compareQueryKeys = (queryKey1: QueryKey, queryKey2: QueryKey): boolean => {
  if (queryKey1.length !== queryKey2.length) return false; // Different lengths, cannot be equal

  for (let i = 0; i < queryKey1.length; i++) {
    if (!deepEqual(queryKey1[i], queryKey2[i])) return false;
  }
  return true; // All elements match
};

// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the compare values
const deepEqual = (value1: any, value2: any): boolean => {
  // Check if both values are the same reference
  if (value1 === value2) return true;

  // If either value is null or not an object, they're not equal
  if (value1 === null || value2 === null || typeof value1 !== 'object' || typeof value2 !== 'object') return false;

  // Check if both values are arrays
  if (Array.isArray(value1) !== Array.isArray(value2)) return false;

  // If both are arrays, compare each element recursively
  if (Array.isArray(value1)) {
    if (value1.length !== value2.length) return false;
    for (let i = 0; i < value1.length; i++) if (!deepEqual(value1[i], value2[i])) return false;
    return true;
  }

  // Otherwise, both values are objects, so compare their keys and values
  const keys1 = Object.keys(value1);
  const keys2 = Object.keys(value2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) if (!keys2.includes(key) || !deepEqual(value1[key], value2[key])) return false;

  return true;
};
