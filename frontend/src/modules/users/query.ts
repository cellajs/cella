import { infiniteQueryOptions, queryOptions, useMutation } from '@tanstack/react-query';
import { config } from 'config';
import type { ApiError } from '~/lib/api';
import type { User } from '~/modules/users/types';
import { deleteUsers, getUser, getUsers, GetUsersData, updateUser, UpdateUserData } from '~/openapi-client';
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
  queryOptions({ queryKey: usersKeys.single.byIdOrSlug(idOrSlug), queryFn: async () => {
    const response = await getUser({path: { idOrSlug }, throwOnError: true });
    return response.data
  } });

/**
 * Infinite query options to get a paginated list of users.
 *
 * @param param.q - Optional search query to filter users by (default is an empty string).
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default is configured in `config.requestLimits.users`).
 * @returns Infinite query options.
 */
export const usersQueryOptions = ({ q = '', sort: _sort, order: _order, role, limit: _limit }: Omit<GetUsersData['query'], 'limit' | 'offset'> & { limit?: number}) => {
  const sort = _sort || 'createdAt';
  const order = _order || 'desc';
  const limit = String(_limit || config.requestLimits.users);

  const queryKey = usersKeys.table.entries({ q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: { page: 0, offset: 0 },
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || page * Number(limit));
      const response = await getUsers({ query: { q, sort, order, role, limit, offset }, signal, throwOnError: true });
      return response.data;
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
    mutationFn: async ({ idOrSlug, ...body }) => {
      const response = await updateUser({path: { idOrSlug }, body, throwOnError: true });
      return response.data;
    },
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
      await deleteUsers({ body: { ids }, throwOnError: true });
    },
    onSuccess: (_, users) => {
      const mutateCache = useMutateQueryData(usersKeys.table.base(), () => usersKeys.single.base, ['remove']);

      mutateCache.remove(users);
    },
  });
};
