import type { QueryKey } from '@tanstack/react-query';

import type { LimitedUser } from '~/modules/users/types';
import { getQueryItems } from '~/query/helpers/mutate-query';
import type { InfiniteQueryData, QueryData } from '~/query/types';

/**
 * Searches through the query data to find a user by their ID or slug.
 *
 * @param queries - An array of tuples, each containing a query key and associated data.
 * @param idOrSlug - The ID or slug to search for.
 * @returns User data if found, otherwise null.
 */
export const findUserFromQueries = (queries: [QueryKey, InfiniteQueryData<LimitedUser> | QueryData<LimitedUser> | undefined][], idOrSlug: string) => {
  for (const [_, prevData] of queries) {
    if (!prevData) continue;

    const data = getQueryItems(prevData);
    const user = data.find((item) => item.id === idOrSlug);
    if (user) return user;
  }
  return null;
};
