import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import type { ToggleMfaData, User } from '~/api.gen';
import { createPasskey, deletePasskey, deleteTotp, getMyInvitations, toggleMfa, type UpdateMeData, updateMe } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { getPasskeyRegistrationCredential } from '~/modules/auth/passkey-credentials';
import { toaster } from '~/modules/common/toaster/service';
import { getAndSetMe, getAndSetMeAuthData, getAndSetMenu } from '~/modules/me/helpers';
import type { MeAuthData, Passkey } from '~/modules/me/types';
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
  registrate: {
    passkey: () => [...meKeys.all, 'registrate', 'passkey'] as const,
  } as const,
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
export const meInvitesQueryOptions = () => queryOptions({ queryKey: meKeys.invites(), queryFn: () => getMyInvitations() });

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
 * Mutation hook for updating current user (self) MFA requirment state
 *
 * @returns The mutation hook for updating the user MFA requirment state.
 */
export const useToggleMfaMutation = () => {
  return useMutation<User, ApiError, ToggleMfaData['body']>({
    mutationKey: meKeys.update.info(),
    mutationFn: (body) => toggleMfa({ body }),
    onSuccess: (updatedUser) => {
      updateOnSuccesses(updatedUser);
      toaster(t(`mfa_${updatedUser.mfaRequired ? 'enabled' : 'disabled'}`), 'success');
    },
    gcTime: 1000 * 10,
  });
};

/**
 * Mutation hook for updating current user (self) flags
 *
 * @returns The mutation hook for updating the user flags.
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
 * Mutation hook to register a new passkey for current user (self)
 *
 * @returns The mutation hook for registering passkey.
 */
export const useCreatePasskeyMutation = () => {
  return useMutation<Passkey, ApiError, void>({
    mutationKey: meKeys.registrate.passkey(),
    mutationFn: async () => {
      const credentialData = await getPasskeyRegistrationCredential();
      return await createPasskey({ body: credentialData });
    },
    onSuccess: (newPasskey) => {
      queryClient.setQueryData<MeAuthData>(meKeys.auth(), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          passkeys: [newPasskey, ...oldData.passkeys],
        };
      });
      useUserStore.getState().setMeAuthData({ hasPasskey: true });
      toaster(t('common:success.passkey_added'), 'success');
    },
    onError(error) {
      // On cancel throws error NotAllowedError
      console.error('Error during passkey registration:', error);
      toaster(t('error:passkey_registration_failed'), 'error');
    },
  });
};

/**
 * Mutation hook to delete a passkey by ID for current user (self)
 *
 * @returns The mutation hook for deleting passkey.
 */
export const useDeletePasskeyMutation = () => {
  return useMutation<boolean, ApiError, string>({
    mutationKey: meKeys.delete.passkey(),
    mutationFn: (id: string) => deletePasskey({ path: { id } }),
    onSuccess: (stillHasPasskey, id) => {
      queryClient.setQueryData<MeAuthData>(meKeys.auth(), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          passkeys: oldData.passkeys.filter((passkey) => id !== passkey.id),
        };
      });
      toaster(t('common:success.passkey_unlinked'), 'success');
      useUserStore.getState().setMeAuthData({ hasPasskey: stillHasPasskey });
    },
    onError(error) {
      console.error('Error removing passkey:', error);
      toaster(t('error:passkey_unlink_failed'), 'error');
    },
  });
};

/**
 * Mutation hook for unlink current user (self) totp
 *
 * @returns The mutation hook for unlink totp.
 */
export const useDeleteTotpMutation = () => {
  return useMutation<boolean, ApiError, void>({
    mutationKey: meKeys.delete.totp(),
    mutationFn: () => deleteTotp(),
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
