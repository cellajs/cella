import { infiniteQueryOptions, keepPreviousData, queryOptions, useMutation } from '@tanstack/react-query';
import { appConfig } from 'config';
import type { User } from '~/api.gen';
import { deleteUsers, type GetUsersData, getUser, getUsers, type UpdateUserData, updateUser } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import type { UserWithRoleAndMemberships } from '~/modules/users/types';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { baseInfiniteQueryOptions, infiniteQueryUseCachedIfCompleteOptions } from '~/query/utils/infinite-query-options';
import { listQueryOptions } from '~/query/utils/options';

/**
 * Keys for user related queries. These keys help to uniquely identify different query. For managing query caching and invalidation.
 */
const keys = {
  all: ['users'],
  table: {
    base: ['users', 'table'],
    entries: (filters?: Omit<GetUsersData['query'], 'limit' | 'offset'>) => [...keys.table.base, filters],
  },
  single: {
    base: ['user'],
    byIdOrSlug: (idOrSlug: string) => [...keys.single.base, idOrSlug],
  },
  update: ['users', 'update'],
  delete: ['users', 'delete'],
};

export const usersKeys = keys;

/**
 * Query options for fetching a user by ID or slug.
 *
 * @param idOrSlug - The ID or slug of the user to fetch.
 * @returns Query options.
 */
export const userQueryOptions = (idOrSlug: string) =>
  queryOptions({ queryKey: usersKeys.single.byIdOrSlug(idOrSlug), queryFn: () => getUser({ path: { idOrSlug } }) });

/**
 *
 */
export const searchUsersQueryOptions = (query: Pick<NonNullable<GetUsersData['query']>, 'q' | 'targetEntityId' | 'targetEntityType'>) => {
  const searchQuery = query.q ?? '';

  const queryKey = ['users', 'search', searchQuery];

  return queryOptions({
    queryKey,
    queryFn: () => getUsers({ query }),
    staleTime: 0,
    initialData: { items: [], total: 0 },
    enabled: searchQuery.trim().length > 0, // to avoid issues with spaces
    placeholderData: keepPreviousData,
  });
};

/**
 * Infinite query options to get a paginated list of users.
 *
 * @param param.q - Optional search query to filter users by (default is an empty string).
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default is configured in `appConfig.requestLimits.users`).
 * @returns Infinite query options.
 */
export const usersQueryOptions = ({
  q = '',
  sort = 'createdAt',
  order = 'desc',
  role,
  limit: baseLimit = appConfig.requestLimits.users,
}: Omit<NonNullable<GetUsersData['query']>, 'limit' | 'offset' | 'mode'> & { limit?: number }) => {
  const limit = String(baseLimit);

  const baseQueryKey = usersKeys.table.entries({ q: '', sort: 'createdAt', order: 'desc' });
  const queryKey = usersKeys.table.entries({ q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));
      return await getUsers({ query: { q, sort, order, role, limit, offset, mode: 'all' }, signal });
    },
    ...baseInfiniteQueryOptions,
    ...infiniteQueryUseCachedIfCompleteOptions<UserWithRoleAndMemberships>(baseQueryKey, {
      q,
      sort,
      order,
      searchIn: ['email', 'name'],
      limit: baseLimit,
      additionalFilter: role ? (u) => u.role === role : undefined,
    }),
  });
};

export const usersListQueryOptions = ({
  q = '',
  sort = 'createdAt',
  order = 'desc',
  role,
  limit = appConfig.requestLimits.users,
}: Omit<NonNullable<GetUsersData['query']>, 'limit' | 'offset' | 'mode'> & { limit?: number }) => {
  const queryKey = usersKeys.table.entries({ q, sort, order, role });
  const baseQueryKey = usersKeys.table.entries({ q: '', sort: 'createdAt', order: 'desc' });

  return listQueryOptions({
    queryKey,
    queryFn: async ({ offset, limit }, signal) => {
      return await getUsers({
        query: { q, sort, order, role, limit: String(limit), offset: String(offset), mode: 'all' },
        signal,
      });
    },
    limit,
    cachedQuery: {
      queryKey: baseQueryKey,
      filterOptions: {
        q,
        sort,
        order,
        searchIn: ['email', 'name'],
        limit,
        additionalFilter: role ? (u) => u.role === role : undefined,
      },
    },
  });
};

/**
 * Mutation hook for updating user
 *
 * @returns The mutation hook for updating the user.
 */
export const useUpdateUserMutation = () => {
  return useMutation<User, ApiError, UpdateUserData['body'] & { idOrSlug: string }>({
    mutationKey: usersKeys.update,
    mutationFn: ({ idOrSlug, ...body }) => updateUser({ path: { idOrSlug }, body }),
    onSuccess: (updatedUser) => {
      const mutateCache = useMutateQueryData(usersKeys.table.base, () => usersKeys.single.base, ['update']);

      mutateCache.update([updatedUser]);
    },
    gcTime: 1000 * 10,
  });
};

/**
 * Custom hook to delete users.
 * This hook provides the functionality to delete one or more users.
 *
 * @returns The mutation hook for deleting users.
 */
export const useUserDeleteMutation = () => {
  return useMutation<void, ApiError, User[]>({
    mutationKey: usersKeys.delete,
    mutationFn: async (users) => {
      const ids = users.map(({ id }) => id);
      await deleteUsers({ body: { ids } });
    },
    onSuccess: (_, users) => {
      const mutateCache = useMutateQueryData(usersKeys.table.base, () => usersKeys.single.base, ['remove']);

      mutateCache.remove(users);
    },
  });
};
