import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetUsersParams, getUsers } from '~/api/users';

const LIMIT = config.requestLimits.users;

export const usersQueryOptions = ({
  q = '',
  sort: initialSort,
  order: initialOrder,
  role,
  limit = LIMIT,
  rowsLength = 0,
}: GetUsersParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';
  const offset = q.length > 0 ? 0 : rowsLength;

  return infiniteQueryOptions({
    queryKey: ['users', 'list', q, sort, order, role],
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async ({ pageParam: page, signal }) => await getUsers({ page, q, sort, order, role, limit, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
