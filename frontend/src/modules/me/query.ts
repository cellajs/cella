import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { deletePasskey, type UpdateUserData, updateMe } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { getAndSetMe, getAndSetMeAuthData, getAndSetMenu } from '~/modules/me/helpers';
import { usersKeys } from '~/modules/users/query';
import type { User } from '~/modules/users/types';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';
import { toaster } from '../common/toaster';

/**
 * Keys for current authenticated user(self) related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const meKeys = {
  all: ['me'] as const,
  menu: () => [...meKeys.all, 'menu'] as const,
  auth: () => [...meKeys.all, 'auth'] as const,
  update: () => [...meKeys.all, 'update'] as const,
};

/**
 * Query options for fetching the current authenticated user's data.
 *
 * @returns Query options.
 */
export const meQueryOptions = () => queryOptions({ queryKey: meKeys.all, queryFn: getAndSetMe });

/**
 * Query options for fetching the authentication information of the current authenticated user.
 *
 * @returns Query options.
 */
export const meAuthQueryOptions = () => queryOptions({ queryKey: meKeys.auth(), queryFn: getAndSetMeAuthData });

/**
 * Query options for fetching the current authenticated user's menu.
 *
 * @returns Query options.
 */
export const menuQueryOptions = () => queryOptions({ queryKey: meKeys.menu(), queryFn: getAndSetMenu });

/**
 * Mutation hook for updating current user (self)
 *
 * @returns The mutation hook for updating the user.
 */
export const useUpdateSelfMutation = () => {
  return useMutation<User, ApiError, Omit<UpdateUserData['body'], 'role'>>({
    mutationKey: meKeys.update(),
    mutationFn: (body) => updateMe({ body }),
    onSuccess: (updatedUser) => {
      const updateUser = useUserStore.getState().updateUser;

      queryClient.setQueryData(usersKeys.single.byIdOrSlug(updatedUser.slug), updatedUser);
      updateUser(updatedUser);
    },
    gcTime: 1000 * 10,
  });
};

/**
 * Mutation hook for deleting current user (self) passkey
 *
 * @returns The mutation hook for deleting passkey.
 */
export const useDeletePasskeyMutation = () => {
  return useMutation<boolean, ApiError, void>({
    mutationKey: [...meKeys.all, 'delete', 'passkey'],
    mutationFn: () => deletePasskey(),
    onSuccess: () => {
      toaster(t('common:success.passkey_removed'), 'success');
      useUserStore.getState().setMeAuthData({ passkey: false });
    },
    onError(error) {
      console.error('Error removing passkey:', error);
      toaster(t('error:passkey_remove_failed'), 'error');
    },
  });
};
