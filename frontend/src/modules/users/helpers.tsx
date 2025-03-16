import type { QueryKey } from '@tanstack/react-query';

import type { LimitedUser } from '~/modules/users/types';
import { getQueryItems, getSimilarQueries } from '~/query/helpers/mutate-query';

/**
 * Searches through query data to find a user by their ID or slug.
 *
 * @param queryKey - queryKey where to find by similar.
 * @param idOrSlug - ID or slug to search for.
 * @returns User data if found, otherwise null.
 */
export const findUserFromCache = (queryKey: QueryKey, idOrSlug: string) => {
  const queries = getSimilarQueries<LimitedUser>(queryKey);
  for (const [_, prevData] of queries) {
    if (!prevData) continue;

    const data = getQueryItems(prevData);
    const user = data.find((item) => item.id === idOrSlug);
    if (user) return user;
  }
  return null;
};
