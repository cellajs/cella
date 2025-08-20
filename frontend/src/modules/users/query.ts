import { infiniteQueryOptions, queryOptions, useMutation } from '@tanstack/react-query';
import { appConfig } from 'config';
import { deleteUsers, type GetUsersData, getUser, getUsers, type UpdateUserData, updateUser } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import type { User } from '~/modules/users/types';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';

/**
 * Keys for user related queries. These keys help to uniquely identify different query. For managing query caching and invalidation.
 */
export const usersKeys = {
  all: ['users'] as const,
  table: {
    base: () => [...usersKeys.all, 'table'] as const,
    entries: (filters?: Omit<GetUsersData['query'], 'limit' | 'offset'>) => [...usersKeys.table.base(), filters] as const,
  },
  single: {
    base: ['user'] as const,
    byIdOrSlug: (idOrSlug: string) => [...usersKeys.single.base, idOrSlug] as const,
  },
  update: () => [...usersKeys.all, 'update'] as const,
  delete: () => [...usersKeys.all, 'delete'] as const,
};

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
export const searchUsersQueryOptions = ({
  limit: _limit,
  ...queryParams
}: Pick<NonNullable<GetUsersData['query']>, 'q' | 'targetEntityId' | 'targetEntityType'> & { limit?: number }) => {
  const limit = String(_limit || 20);
  const offset = '0';

  const queryKey = [...usersKeys.all, 'search', queryParams];

  return queryOptions({ queryKey, queryFn: () => getUsers({ query: { ...queryParams, offset, limit } }) });
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
  sort: _sort,
  order: _order,
  role,
  limit: _limit,
}: Omit<NonNullable<GetUsersData['query']>, 'limit' | 'offset' | 'mode'> & { limit?: number }) => {
  const sort = _sort || 'createdAt';
  const order = _order || 'desc';
  const limit = String(_limit || appConfig.requestLimits.users);

  const queryKey = usersKeys.table.entries({ q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: { page: 0, offset: 0 },
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));
      return await getUsers({ query: { q, sort, order, role, limit, offset, mode: 'all' }, signal });
    },
    getNextPageParam: (_lastPage, allPages) => {
      const page = allPages.length;
      const offset = allPages.reduce((acc, page) => acc + page.items.length, 0);
      return { page, offset };
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
    mutationKey: usersKeys.update(),
    mutationFn: ({ idOrSlug, ...body }) => updateUser({ path: { idOrSlug }, body }),
    onSuccess: (updatedUser) => {
      const mutateCache = useMutateQueryData(usersKeys.table.base(), () => usersKeys.single.base, ['update']);

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
    mutationKey: usersKeys.delete(),
    mutationFn: async (users) => {
      const ids = users.map(({ id }) => id);
      await deleteUsers({ body: { ids } });
    },
    onSuccess: (_, users) => {
      const mutateCache = useMutateQueryData(usersKeys.table.base(), () => usersKeys.single.base, ['remove']);

      mutateCache.remove(users);
    },
  });
};
