import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetUsersParams, getUsers } from '~/api/users';
import { usersKeys } from '~/utils/quey-key-factories';

const LIMIT = config.requestLimits.users;

export const usersQueryOptions = ({ q = '', sort: initialSort, order: initialOrder, role, limit = LIMIT }: GetUsersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = usersKeys.table({ q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async ({ pageParam: page, signal }) => await getUsers({ page, q, sort, order, role, limit, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
