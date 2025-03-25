import { infiniteQueryOptions, queryOptions, useMutation } from '@tanstack/react-query';
import { config } from 'config';
import type { ApiError } from '~/lib/api';

import { type GetUsersParams, type UpdateUserParams, deleteUsers, getUser, getUsers, updateUser } from '~/modules/users/api';
import type { User } from '~/modules/users/types';
import { getOffset } from '~/query/helpers';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';

/**
 * Keys for user related queries. These keys help to uniquely identify different query. For managing query caching and invalidation.
 */
export const usersKeys = {
  all: ['users'] as const,
  table: {
    base: () => [...usersKeys.all, 'table'] as const,
    entries: (filters?: GetUsersParams) => [...usersKeys.table.base(), filters] as const,
  },
  single: {
    base: () => [...usersKeys.all, 'single'] as const,
    byIdOrSlug: (idOrSlug: string) => [...usersKeys.single.base(), idOrSlug] as const,
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
  queryOptions({ queryKey: usersKeys.single.byIdOrSlug(idOrSlug), queryFn: () => getUser(idOrSlug) });

/**
 * Infinite query options to get a paginated list of users.
 *
 * @param param.q - Optional search query to filter users by (default is an empty string).
 * @param param.sort - Field to sort by (default is 'createdAt').
 * @param param.order - Order of sorting (default is 'desc').
 * @param param.limit - Number of items per page (default is configured in `config.requestLimits.users`).
 * @returns Infinite query options.
 */
export const usersQueryOptions = ({ q = '', sort: initialSort, order: initialOrder, role, limit = config.requestLimits.users }: GetUsersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = usersKeys.table.entries({ q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam: page, signal }) => {
      const offset = getOffset(queryKey); // Calculate before fetching ensuring correct offset
      return await getUsers({ page, q, sort, order, role, limit, offset }, signal);
    },
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

/**
 * Mutation hook for updating user
 *
 * @returns The mutation hook for updating the user.
 */
export const useUpdateUserMutation = () => {
  return useMutation<User, ApiError, UpdateUserParams & { idOrSlug: string }>({
    mutationKey: usersKeys.update(),
    mutationFn: updateUser,
    onSuccess: (updatedUser) => {
      const mutateCache = useMutateQueryData(usersKeys.table.base(), () => usersKeys.single.base(), ['update']);

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
    mutationFn: (users) => deleteUsers(users.map(({ id }) => id)),
    onSuccess: (_, users) => {
      const mutateCache = useMutateQueryData(usersKeys.table.base(), () => usersKeys.single.base(), ['remove']);

      mutateCache.remove(users);
    },
  });
};
