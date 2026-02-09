import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import type { DeletePasskeyData, DeletePasskeyResponse, ToggleMfaData, User } from '~/api.gen';
import {
  createPasskey,
  deletePasskey,
  deleteTotp,
  getMyInvitations,
  getMyMemberships,
  toggleMfa,
  type UpdateMeData,
  updateMe,
} from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { getPasskeyRegistrationCredential } from '~/modules/auth/passkey-credentials';
import { toaster } from '~/modules/common/toaster/service';
import { getAndSetMe, getAndSetMeAuthData } from '~/modules/me/helpers';
import type { MeAuthData, Passkey } from '~/modules/me/types';
import { userQueryKeys } from '~/modules/user/query';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';

/**
 * Keys for current authenticated user(self) related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const meKeys = {
  all: ['me'],
  menu: ['me', 'menu'],
  auth: ['me', 'auth'],
  invites: ['me', 'invites'],
  memberships: ['me', 'memberships'],
  register: {
    passkey: ['me', 'register', 'passkey'],
  },
  update: {
    info: ['me', 'update', 'info'],
    flags: ['me', 'update', 'flags'],
  },
  delete: {
    passkey: ['me', 'delete', 'passkey'],
    totp: ['me', 'delete', 'totp'],
  },
};

/**
 * Query options for fetching the current user's data.
 *
 * @returns Query options.
 */
export const meQueryOptions = () => queryOptions({ queryKey: meKeys.all, queryFn: getAndSetMe });

/**
 * Query options for fetching the auth information of the current user.
 *
 * @returns Query options.
 */
export const meAuthQueryOptions = () => queryOptions({ queryKey: meKeys.auth, queryFn: getAndSetMeAuthData });

/**
 * Query options for fetching the current user's invites.
 *
 * @returns Query options.
 */
export const meInvitationsQueryOptions = () =>
  queryOptions({ queryKey: meKeys.invites, queryFn: () => getMyInvitations() });

/**
 * Mutation hook for updating current user (self) info
 *
 * @returns The mutation hook for updating the user info.
 */
export const useUpdateSelfMutation = () => {
  return useMutation<User, ApiError, Omit<UpdateMeData['body'], 'role' | 'userFlags'>>({
    mutationKey: meKeys.update.info,
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
  return useMutation<User, ApiError, NonNullable<ToggleMfaData['body']>>({
    mutationKey: meKeys.update.info,
    mutationFn: (body) => toggleMfa({ body }),
    onSuccess: (updatedUser, { mfaRequired: isEnabling }) => {
      updateOnSuccesses(updatedUser);
      if (isEnabling) queryClient.invalidateQueries({ queryKey: meKeys.auth });
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
  return useMutation<User, ApiError, Pick<UpdateMeData['body'], 'userFlags'>>({
    mutationKey: meKeys.update.flags,
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
    mutationKey: meKeys.register.passkey,
    mutationFn: async () => {
      const credentialData = await getPasskeyRegistrationCredential();
      return await createPasskey({ body: credentialData });
    },
    onSuccess: (newPasskey) => {
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
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
  return useMutation<DeletePasskeyResponse, ApiError, DeletePasskeyData['path']>({
    mutationKey: meKeys.delete.passkey,
    mutationFn: ({ id }) => deletePasskey({ path: { id } }),
    onSuccess: (_data, { id }) => {
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          passkeys: oldData.passkeys.filter((passkey) => id !== passkey.id),
        };
      });
      toaster(t('common:success.passkey_unlinked'), 'success');
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
  return useMutation<DeletePasskeyResponse, ApiError, void>({
    mutationKey: meKeys.delete.totp,
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

  queryClient.setQueryData(userQueryKeys.detail.byId(updatedUser.id), updatedUser);
  updateUser(updatedUser);
};

/**
 * Query options to fetch all memberships for the current user.
 * This is the source of truth for user memberships in the frontend.
 */
export const myMembershipsQueryOptions = () =>
  queryOptions({
    queryKey: meKeys.memberships,
    queryFn: async ({ signal }) => getMyMemberships({ signal }),
  });
