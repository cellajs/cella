import { infiniteQueryOptions, queryOptions, useMutation } from '@tanstack/react-query';
import { config } from 'config';
import type { ApiError } from '~/lib/api';
import { queryClient } from '~/lib/router';

import { type GetUsersParams, type UpdateUserParams, getUser, getUsers, updateSelf, updateUser } from '~/modules/users/api';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import type { User } from '~/modules/users/types';
import { useUserStore } from '~/store/user';

/**
 * Keys for user related queries. These keys help to uniquely identify different query. For managing query caching and invalidation.
 */
export const usersKeys = {
  one: ['user'] as const,
  single: (idOrSlug: string) => [...usersKeys.one, idOrSlug] as const,
  many: ['users'] as const,
  list: () => [...usersKeys.many, 'list'] as const,
  table: (filters?: GetUsersParams) => [...usersKeys.list(), filters] as const,
  leaveEntity: () => [...usersKeys.one, 'leave'] as const,
  update: () => [...usersKeys.one, 'update'] as const,
  delete: () => [...usersKeys.one, 'delete'] as const,
};

/**
 * Keys for current authenticated user(self) related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const meKeys = {
  all: ['me'] as const,
  update: () => [...meKeys.all, 'update'] as const,
};

/**
 * Query options for fetching a user by ID or slug.
 *
 * @param idOrSlug - The ID or slug of the user to fetch.
 * @returns Query options.
 */
export const userQueryOptions = (idOrSlug: string) => queryOptions({ queryKey: usersKeys.single(idOrSlug), queryFn: () => getUser(idOrSlug) });

/**
 * Query options for fetching the current authenticated user's data.
 *
 * @param retry - The number of retry attempts on failure.
 * @returns Query options.
 */
export const meQueryOptions = (retry = 0) => queryOptions({ queryKey: meKeys.all, queryFn: getAndSetMe, retry });

/**
 * Query options for fetching the current authenticated user's menu.
 *
 * @param retry - The number of retry attempts on failure.
 * @returns Query options.
 */
export const menuQueryOptions = (retry = 0) => queryOptions({ queryKey: ['menu'], queryFn: getAndSetMenu, retry });

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
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async ({ pageParam: page, signal }) => await getUsers({ page, q, sort, order, role, limit, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

/**
 * Mutation hook for updating user
 *
 * @param idOrSlug - Optional ID or slug of the user to update. If not provided, it will update the current authenticated user (self).
 * @returns The mutation hook for updating the user.
 */
export const useUpdateUserMutation = (idOrSlug?: string) => {
  const { user: currentUser } = useUserStore();
  const isSelf = currentUser.id === idOrSlug;

  return useMutation<User, ApiError, (UpdateUserParams & { idOrSlug: string }) | Omit<UpdateUserParams, 'role'>>({
    mutationKey: idOrSlug && !isSelf ? usersKeys.update() : meKeys.update(),
    mutationFn: (params) => (idOrSlug && !isSelf ? updateUser({ idOrSlug, ...params }) : updateSelf(params)),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(usersKeys.single(updatedUser.slug), updatedUser);
    },
    gcTime: 1000 * 10,
  });
};
