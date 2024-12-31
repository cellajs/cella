import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { config } from 'config';

import { type GetUsersParams, getUser, getUsers } from '~/modules/users/api';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';

export const usersKeys = {
  one: ['user'] as const,
  single: (idOrSlug: string) => [...usersKeys.one, idOrSlug] as const,
  many: ['users'] as const,
  list: () => [...usersKeys.many, 'list'] as const,
  table: (filters?: GetUsersParams) => [...usersKeys.list(), filters] as const,
};

export const meKeys = {
  all: ['me'] as const,
  update: () => [...meKeys.all, 'update'] as const,
};

export const menuKeys = {
  all: ['menu'] as const,
};

export const userQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: usersKeys.single(idOrSlug),
    queryFn: () => getUser(idOrSlug),
  });

export const meQueryOptions = () =>
  queryOptions({
    queryKey: meKeys.all,
    queryFn: getAndSetMe,
  });

export const menuQueryOptions = () =>
  queryOptions({
    queryKey: menuKeys.all,
    queryFn: getAndSetMenu,
  });

export const usersQueryOptions = ({ q = '', sort: initialSort, order: initialOrder, role, limit = config.requestLimits.users }: GetUsersParams) => {
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
