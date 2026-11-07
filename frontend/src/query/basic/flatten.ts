import { getQueryItems, isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';

/** Rows of flat (`{ results, totalSize }`) or paged (`{ pages }`) list data; anything else, undefined included, has none. */
export const flattenInfiniteData = <T>(data: unknown): T[] => (isQueryData<T>(data) || isInfiniteQueryData<T>(data) ? getQueryItems(data) : []);
