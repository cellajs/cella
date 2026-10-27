import { getQueryItems, isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';

/** Rows of flat (`{ items, total }`) or paged (`{ pages }`) list data; anything else, undefined included, has none. */
export function flattenInfiniteData<T>(data: unknown): T[] {
  return isQueryData<T>(data) || isInfiniteQueryData<T>(data) ? getQueryItems(data) : [];
}
