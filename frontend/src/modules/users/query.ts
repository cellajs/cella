import { infiniteQueryOptions, queryOptions, useMutation } from '@tanstack/react-query';
import { config } from 'config';
import type { ApiError } from '~/lib/api';
import { queryClient } from '~/query/query-client';

import { type GetUsersParams, type UpdateUserParams, getUser, getUsers, updateUser } from '~/modules/users/api';
import type { User } from '~/modules/users/types';

/**
 * Keys for user related queries. These keys help to uniquely identify different query. For managing query caching and invalidation.
 */
export const usersKeys = {
  one: ['user'] as const,
  single: (idOrSlug: string) => [...usersKeys.one, idOrSlug] as const,
  many: ['users'] as const,
  list: () => [...usersKeys.many, 'list'] as const,
  table: (filters?: GetUsersParams) => [...usersKeys.list(), filters] as const,
  update: () => [...usersKeys.one, 'update'] as const,
  delete: () => [...usersKeys.one, 'delete'] as const,
};

/**
 * Query options for fetching a user by ID or slug.
 *
 * @param idOrSlug - The ID or slug of the user to fetch.
 * @returns Query options.
 */
export const userQueryOptions = (idOrSlug: string) => queryOptions({ queryKey: usersKeys.single(idOrSlug), queryFn: () => getUser(idOrSlug) });

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

  const queryKey = usersKeys.table({ q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam: page, signal }) => await getUsers({ page, q, sort, order, role, limit, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

/**
 * Mutation hook for updating user
 * @returns The mutation hook for updating the user.
 */
export const useUpdateUserMutation = () => {
  return useMutation<User, ApiError, UpdateUserParams & { idOrSlug: string }>({
    mutationKey: usersKeys.update(),
    mutationFn: updateUser,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(usersKeys.single(updatedUser.slug), updatedUser);
    },
    gcTime: 1000 * 10,
  });
};
