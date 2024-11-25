import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetUsersParams, getUsers } from '~/api/users';
import { getPaginatedOffset } from '~/utils/mutate-query';

const LIMIT = config.requestLimits.users;

export const usersQueryOptions = ({ q = '', sort: initialSort, order: initialOrder, role, limit = LIMIT }: GetUsersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = ['users', 'list', q, sort, order, role];
  const offset = getPaginatedOffset(queryKey);

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async ({ pageParam: page, signal }) => await getUsers({ page, q, sort, order, role, limit, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
