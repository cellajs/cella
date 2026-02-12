import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { appConfig } from 'shared';
import type { User } from '~/api.gen';
import { deleteUsers, type GetUsersData, getUser, getUsers, type UpdateUserData, updateUser } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import {
  baseInfiniteQueryOptions,
  createEntityKeys,
  findInListCache,
  invalidateIfLastMutation,
  useMutateQueryData,
} from '~/query/basic';

type UserFilters = Omit<GetUsersData['query'], 'limit' | 'offset'>;

const keys = createEntityKeys<UserFilters>('user');

export const userQueryKeys = keys;

/** Find a user in the list cache by id. */
export const findUserInListCache = (entityId: string) =>
  findInListCache<User>(keys.list.base, (user) => user.id === entityId);

/**
 * Query options for fetching a user by ID within an organization context.
 * NOTE: Slug is only used on page load. All subsequent queries must use ID.
 */
export const userQueryOptions = (id: string, tenantId: string, orgId: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: async () => getUser({ path: { userId: id, tenantId, orgId } }),
    placeholderData: () => findUserInListCache(id),
  });

/**
 * Infinite query options to get a paginated list of users.
 */
export const usersListQueryOptions = ({
  q = '',
  sort = 'createdAt',
  order = 'desc',
  role,
  limit: baseLimit = appConfig.requestLimits.users,
}: Omit<NonNullable<GetUsersData['query']>, 'limit' | 'offset'> & { limit?: number }) => {
  const limit = String(baseLimit);

  const queryKey = keys.list.filtered({ q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));
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
  const mutateCache = useMutateQueryData(keys.list.base, () => keys.detail.base, ['update']);

  return useMutation<User, ApiError, UpdateUserData['body'] & { id: string }>({
    mutationKey: keys.update,
    mutationFn: ({ id, ...body }) => updateUser({ path: { id }, body }),
    onSuccess: (updatedUser) => {
      mutateCache.update([updatedUser]);
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, keys.list.base);
    },
    gcTime: 1000 * 10,
  });
};

/**
 * Mutation hook for deleting users.
 */
export const useUserDeleteMutation = () => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base, (user) => keys.detail.byId(user.id), ['remove']);

  return useMutation<void, ApiError, User[]>({
    mutationKey: keys.delete,
    mutationFn: async (users) => {
      const ids = users.map(({ id }) => id);
      await deleteUsers({ body: { ids } });
    },
    onSuccess: (_, users) => {
      mutateCache.remove(users);
    },
    onSettled: () => {
      invalidateIfLastMutation(queryClient, keys.all, keys.list.base);
    },
  });
};
