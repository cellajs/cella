import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { config } from 'config';

import { type GetUsersParams, getUser, getUsers } from '~/modules/users/api';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';

// Keys for users queries
export const usersKeys = {
  one: ['user'] as const,
  single: (idOrSlug: string) => [...usersKeys.one, idOrSlug] as const,
  many: ['users'] as const,
  list: () => [...usersKeys.many, 'list'] as const,
  table: (filters?: GetUsersParams) => [...usersKeys.list(), filters] as const,
  sendNewsletterSelf: () => [...usersKeys.one, 'newsletter', 'self'] as const,
  leaveEntity: () => [...usersKeys.one, 'leave'] as const,
  update: () => [...usersKeys.one, 'update'] as const,
  delete: () => [...usersKeys.one, 'delete'] as const,
  deleteSelf: () => [...usersKeys.delete(), 'self'] as const,
  terminateSessions: () => [...usersKeys.one, 'terminate', 'sessions'] as const,
};

// Keys for meUser(self) query
export const meKeys = {
  all: ['me'] as const,
  update: () => [...meKeys.all, 'update'] as const,
};

// Keys for user(self) menu query
export const menuKeys = {
  all: ['menu'] as const,
};

// Query Options to get a user by id or slug
export const userQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: usersKeys.single(idOrSlug),
    queryFn: () => getUser(idOrSlug),
  });

// Query Options to get current user(self)
export const meQueryOptions = (retry = 0) =>
  queryOptions({
    queryKey: meKeys.all,
    queryFn: getAndSetMe,
    retry,
  });

// Query Options to get current user's(self) menu
export const menuQueryOptions = (retry = 0) =>
  queryOptions({
    queryKey: menuKeys.all,
    queryFn: getAndSetMenu,
    retry,
  });

// Infinite Query Options to get a paginated list of users
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
