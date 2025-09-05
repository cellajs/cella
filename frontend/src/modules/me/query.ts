import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import type { User } from '~/api.gen';
import { getMyInvites, type UpdateMeData, unlinkPasskey, unlinkTotp, updateMe } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/service';
import { getAndSetMe, getAndSetMeAuthData, getAndSetMenu } from '~/modules/me/helpers';
import { usersKeys } from '~/modules/users/query';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';

/**
 * Keys for current authenticated user(self) related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const meKeys = {
  all: ['me'] as const,
  menu: () => [...meKeys.all, 'menu'] as const,
  auth: () => [...meKeys.all, 'auth'] as const,
  invites: () => [...meKeys.all, 'invites'] as const,
  update: {
    info: () => [...meKeys.all, 'update', 'info'] as const,
    flags: () => [...meKeys.all, 'update', 'flags'] as const,
  } as const,
  delete: {
    passkey: () => [...meKeys.all, 'delete', 'passkey'] as const,
    totp: () => [...meKeys.all, 'delete', 'totp'] as const,
  } as const,
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
 * Query options for fetching the current authenticated user's invites.
 *
 * @returns Query options.
 */
export const meInvitesQueryOptions = () => queryOptions({ queryKey: meKeys.invites(), queryFn: () => getMyInvites() });

/**
 * Mutation hook for updating current user (self) info
 *
 * @returns The mutation hook for updating the user info.
 */
export const useUpdateSelfMutation = () => {
  return useMutation<User, ApiError, Omit<UpdateMeData['body'], 'role' | 'userFlags'>>({
    mutationKey: meKeys.update.info(),
    mutationFn: (body) => updateMe({ body }),
    onSuccess: (updatedUser) => updateOnSuccesses(updatedUser),
    gcTime: 1000 * 10,
  });
};

/**
 * Mutation hook for updating current user (self) flags
 *
 * @returns The mutation hook for updating the user flasg.
 */
export const useUpdateSelfFlagsMutation = () => {
  return useMutation<User, ApiError, Pick<NonNullable<UpdateMeData['body']>, 'userFlags'>>({
    mutationKey: meKeys.update.flags(),
    mutationFn: (body) => updateMe({ body }),
    onSuccess: (updatedUser) => updateOnSuccesses(updatedUser),
    gcTime: 1000 * 10,
  });
};

/**
 * Mutation hook for unlink current user (self) passkey
 *
 * @returns The mutation hook for unlink passkey.
 */
export const useUnlinkPasskeyMutation = () => {
  return useMutation<boolean, ApiError, void>({
    mutationKey: meKeys.delete.passkey(),
    mutationFn: () => unlinkPasskey(),
    onSuccess: () => {
      toaster(t('common:success.passkey_removed'), 'success');
      useUserStore.getState().setMeAuthData({ hasPasskey: false });
    },
    onError(error) {
      console.error('Error removing passkey:', error);
      toaster(t('error:passkey_remove_failed'), 'error');
    },
  });
};

/**
 * Mutation hook for unlink current user (self) totp
 *
 * @returns The mutation hook for unlink totp.
 */
export const useUnlinkTotpMutation = () => {
  return useMutation<boolean, ApiError, void>({
    mutationKey: meKeys.delete.totp(),
    mutationFn: () => unlinkTotp(),
    onSuccess: () => {
      toaster(t('common:success.totp_removed'), 'success');
      useUserStore.getState().setMeAuthData({ hasTotp: false });
    },
    onError(error) {
      console.error('Error removing totp:', error);
      toaster(t('error:totp_remove_failed'), 'error');
    },
  });
};

const updateOnSuccesses = (updatedUser: User) => {
  const { updateUser } = useUserStore.getState();

  queryClient.setQueryData(usersKeys.single.byIdOrSlug(updatedUser.slug), updatedUser);
  updateUser(updatedUser);
};
