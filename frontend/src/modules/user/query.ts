import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User } from 'sdk';
import { deleteUsers, type GetUsersData, getUser, getUsers, type UpdateUserData, updateUser } from 'sdk';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import { usersSearchDefaults } from '~/modules/user/search-params-schemas';
import type { BaseUser } from '~/modules/user/types';
import { cacheRemove, cacheUpdate } from '~/query/basic/cache-mutations';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { createCacheFinder } from '~/query/basic/find-in-list-cache';
import { baseInfiniteQueryOptions } from '~/query/basic/infinite-query-options';
import { invalidateIfLastMutation } from '~/query/basic/invalidation-helpers';
import type { MutationData } from '~/query/types';

type UserFilters = Omit<GetUsersData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<UserFilters>('user');

export const userQueryKeys = keys;

/** Find a user in cache by id. */
const findUserInCache = createCacheFinder<User>('user');

/**
 * Query options for fetching a user by ID.
 */
export const userQueryOptions = (id: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: async () => getUser({ path: { relatableUserId: id } }),
    placeholderData: () => findUserInCache(id),
  });

/**
 * Infinite query options to get a paginated list of users.
 */
export const usersListQueryOptions = ({
  q = usersSearchDefaults.q,
  sort = usersSearchDefaults.sort,
  order = usersSearchDefaults.order,
  role,
  limit: baseLimit = appConfig.requestLimits.users,
}: Omit<NonNullable<GetUsersData['query']>, 'limit' | 'offset'> & { limit?: number }) => {
  const limit = String(baseLimit);

  const queryKey = keys.list.filtered({ q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));
      return await getUsers({ query: { q, sort, order, role, limit, offset }, signal });
    },
    ...baseInfiniteQueryOptions,
    refetchOnMount: true,
  });
};

/**
 * Mutation hook for updating a user.
 */
export const useUserUpdateMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<User, ApiError, MutationData<UpdateUserData>>({
    mutationKey: keys.update,
    mutationFn: ({ path, body }) => updateUser({ path, body }),
    onSuccess: (updatedUser) => {
      cacheUpdate(listKey, [updatedUser]);
      queryClient.invalidateQueries({ queryKey: keys.detail.base });
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, listKey);
    },
    gcTime: 1000 * 10,
  });
};

/**
 * Mutation hook for deleting users.
 */
export const useUserDeleteMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<void, ApiError, BaseUser[]>({
    mutationKey: keys.delete,
    mutationFn: async (users) => {
      const ids = users.map(({ id }) => id);
      await deleteUsers({ body: { ids } });
    },
    onSuccess: (_, users) => {
      cacheRemove(listKey, users);
      for (const user of users) queryClient.removeQueries({ queryKey: keys.detail.byId(user.id) });
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, listKey);
    },
  });
};
