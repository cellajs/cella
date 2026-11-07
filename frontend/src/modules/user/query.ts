import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { batchDeleteUsers, countSystemInvitations, getUser, type ListUsersData, listUsers, type UpdateUserData, type User, updateUser } from 'sdk';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { type accountSetValues, usersSearchDefaults } from '~/modules/user/search-params-schemas';
import type { BaseUser } from '~/modules/user/types';
import { useUserStore } from '~/modules/user/user-store';
import { cacheRemove, cacheUpdate, removeDetailQueriesById } from '~/query/basic/cache-mutations';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { createCacheFinder } from '~/query/basic/find-in-list-cache';
import { orderByParam, pageQuery, tokenPaging } from '~/query/basic/infinite-query-options';
import { invalidateIfLastMutation } from '~/query/basic/invalidation-helpers';
import type { ListFilters, MutationData } from '~/query/types';

type UserFilters = ListFilters<NonNullable<ListUsersData['query']>>;
/** The list's params as the system route holds them: the account sets as a list, which the request turns into `includeProvisional`. */
type UsersListParams = Omit<UserFilters, 'includeProvisional'> & { accounts?: (typeof accountSetValues)[number][]; limit?: number };

const keys = createEntityKeys<UserFilters>('user');

export const userQueryKeys = keys;

const findUserInCache = createCacheFinder<User>('user');

export const userQueryOptions = (id: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    // include=mfa: the profile header shows the MFA setting to whoever the API returns it to
    queryFn: () => getUser({ path: { userId: id }, query: { include: 'mfa' } }),
    placeholderData: () => findUserInCache(id),
  });

export const usersListQueryOptions = (params: UsersListParams) => {
  const defaults = usersSearchDefaults;
  const { q = defaults.q, sort = defaults.sort, order = defaults.order, role, accounts = [], limit = appConfig.requestLimits.users } = params;
  const includeProvisional = accounts.includes('provisional') || undefined;
  const filters = { q, sort, order, role, includeProvisional };

  return infiniteQueryOptions({
    queryKey: keys.list.filtered(filters),
    ...tokenPaging((pageToken, signal) =>
      listUsers({ query: { q, role, includeProvisional, orderBy: orderByParam(sort, order), ...pageQuery(limit, pageToken) }, signal }),
    ),
    refetchOnMount: true,
  });
};

/** How many addresses hold an unexpired system invitation. */
export const pendingSystemInvitesQueryOptions = () =>
  queryOptions({ queryKey: ['user', 'pendingSystemInvites'] as const, queryFn: () => countSystemInvitations() });

const useUserUpdateMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<User, ApiError, MutationData<UpdateUserData>>({
    mutationKey: keys.update,
    mutationFn: ({ path, body }) => updateUser({ path, body }),
    onSuccess: (updatedUser) => {
      cacheUpdate(listKey, [updatedUser]);
      queryClient.invalidateQueries({ queryKey: keys.detail.base });
    },
    onSettled: () => invalidateIfLastMutation(queryClient, keys.all, listKey),
    gcTime: 1000 * 10,
  });
};

/** Saves a user's profile: the signed-in user's through `/me`, which also updates the user store, anyone else's as an admin. */
export const useUpdateUser = (userId: string) => {
  const isSelf = useUserStore((state) => state.user?.id === userId);
  const selfMutation = useUpdateSelfMutation();
  const adminMutation = useUserUpdateMutation();

  const mutate = (body: UpdateUserData['body'], options?: { onSuccess?: (user: User) => void }) =>
    isSelf ? selfMutation.mutate(body, options) : adminMutation.mutate({ path: { userId }, body }, options);

  return { mutate, isPending: selfMutation.isPending || adminMutation.isPending };
};

export const useUserDeleteMutation = () => {
  const queryClient = useQueryClient();
  const listKey = keys.list.base;

  return useMutation<void, ApiError, BaseUser[]>({
    mutationKey: keys.delete,
    mutationFn: async (users) => {
      const ids = users.map(({ id }) => id);
      await batchDeleteUsers({ body: { ids } });
    },
    onSuccess: (_, users) => {
      cacheRemove(listKey, users);
      const ids = users.map(({ id }) => id);
      removeDetailQueriesById(queryClient, keys.detail.base, ids);
    },
    onSettled: () => invalidateIfLastMutation(queryClient, keys.all, listKey),
  });
};
