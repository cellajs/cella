import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import type {
  DeletePasskeyData,
  DeletePasskeyResponse,
  DeleteTotpResponse,
  GetMyInvitationsResponse,
  HandleMembershipInvitationData,
  HandleMembershipInvitationResponse,
  MeAuthData,
  ToggleMfaData,
  User,
} from 'sdk';
import {
  createPasskey,
  deletePasskey,
  deleteTotp,
  getMyInvitations,
  getMyMemberships,
  handleMembershipInvitation,
  toggleMfa,
  type UpdateMeData,
  updateMe,
} from 'sdk';
import type { ApiError } from '~/lib/api';
import { getPasskeyRegistrationCredential } from '~/modules/auth/passkey-credentials';
import { toaster } from '~/modules/common/toaster/toaster';
import { getAndSetMe, getAndSetMeAuthData } from '~/modules/me/helpers';
import type { Passkey } from '~/modules/me/types';
import { userQueryKeys } from '~/modules/user/query';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import type { MutationData } from '~/query/types';

/**
 * Keys for current authenticated user(self) related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const meKeys = {
  all: ['me'] as const,
  auth: ['me', 'auth'] as const,
  invites: ['me', 'invites'] as const,
  memberships: ['me', 'memberships'] as const,
  register: {
    passkey: ['me', 'register', 'passkey'] as const,
  },
  update: {
    info: ['me', 'update', 'info'] as const,
    flags: ['me', 'update', 'flags'] as const,
  },
  delete: {
    passkey: ['me', 'delete', 'passkey'] as const,
    totp: ['me', 'delete', 'totp'] as const,
  },
  handleInvitation: ['me', 'handle-invitation'] as const,
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
    onSuccess: (updatedUser) => applyUpdatedSelf(updatedUser),
    gcTime: 1000 * 10,
  });
};

/**
 * Mutation hook for updating current user (self) MFA requirement state
 *
 * @returns The mutation hook for updating the user MFA requirement state.
 */
export const useToggleMfaMutation = () => {
  return useMutation<User, ApiError, NonNullable<ToggleMfaData['body']>>({
    mutationKey: meKeys.update.info,
    mutationFn: (body) => toggleMfa({ body }),
    onSuccess: (updatedUser, { mfaRequired: isEnabling }) => {
      applyUpdatedSelf(updatedUser);
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
    onSuccess: (updatedUser) => applyUpdatedSelf(updatedUser),
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
      return createPasskey({ body: credentialData });
    },
    onSuccess: (newPasskey) => {
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          passkeys: [newPasskey, ...oldData.passkeys],
        };
      });
      toaster(t('c:success.passkey_added'), 'success');
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
  return useMutation<DeletePasskeyResponse, ApiError, MutationData<DeletePasskeyData>>({
    mutationKey: meKeys.delete.passkey,
    mutationFn: ({ path }) => deletePasskey({ path }),
    onSuccess: (_data, { path: { id } }) => {
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          passkeys: oldData.passkeys.filter((passkey) => id !== passkey.id),
        };
      });
      toaster(t('c:success.passkey_unlinked'), 'success');
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
  return useMutation<DeleteTotpResponse, ApiError, void>({
    mutationKey: meKeys.delete.totp,
    mutationFn: () => deleteTotp(),
    onSuccess: () => {
      toaster(t('c:success.totp_removed'), 'success');
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, hasTotp: false };
      });
    },
    onError(error) {
      console.error('Error removing totp:', error);
      toaster(t('error:totp_remove_failed'), 'error');
    },
  });
};

const applyUpdatedSelf = (updatedUser: User) => {
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
    queryFn: ({ signal }) => getMyMemberships({ signal }),
    staleTime: 0,
  });

/**
 * Mutation hook to accept or reject a membership invitation.
 * Removes the settled invite from cache and refreshes the menu.
 */
export const useHandleInvitationMutation = () =>
  useMutation<HandleMembershipInvitationResponse, ApiError, MutationData<HandleMembershipInvitationData>>({
    mutationKey: meKeys.handleInvitation,
    mutationFn: ({ path }) => handleMembershipInvitation({ path }),
    onSuccess: async (settledEntity, { path: { acceptOrReject } }) => {
      // Invalidate memberships + entity lists so useMenu reactively rebuilds
      await queryClient.invalidateQueries({ queryKey: meKeys.memberships });

      queryClient.setQueryData<GetMyInvitationsResponse>(meKeys.invites, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, items: oldData.items.filter((invite) => invite.entity.id !== settledEntity.id) };
      });

      toaster(t('c:invitation_settled', { action: acceptOrReject === 'accept' ? 'accepted' : 'rejected' }), 'success');
    },
  });
