import { infiniteQueryOptions, queryOptions, useMutation } from '@tanstack/react-query';
import { appConfig } from 'config';
import type { User } from '~/api.gen';
import { deleteUsers, type GetUsersData, getUser, getUsers, type UpdateUserData, updateUser } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import type { UserWithRoleAndMemberships } from '~/modules/users/types';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { baseInfiniteQueryOptions, infiniteQueryUseCachedIfCompleteOptions } from '~/query/utils/infinite-query-options';

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
 */
export const userQueryOptions = (idOrSlug: string) =>
  queryOptions({ queryKey: usersKeys.single.byIdOrSlug(idOrSlug), queryFn: () => getUser({ path: { idOrSlug } }) });

/**
 * Infinite query options to get a paginated list of users.
 */
export const usersQueryOptions = ({
  q = '',
  sort = 'createdAt',
  order = 'desc',
  role,
  limit: baseLimit = appConfig.requestLimits.users,
}: Omit<NonNullable<GetUsersData['query']>, 'limit' | 'offset'> & { limit?: number }) => {
  const limit = String(baseLimit);

  const baseQueryKey = usersKeys.table.entries({ q: '', sort: 'createdAt', order: 'desc' });
  const queryKey = usersKeys.table.entries({ q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));
      return await getUsers({ query: { q, sort, order, role, limit, offset }, signal });
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
