import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import type {
  AcceptInvitationTokenResponse,
  DeletePasskeyData,
  DeletePasskeyResponse,
  DeleteTotpResponse,
  GetConnectedAppsResponse,
  GetMyInvitationsResponse,
  HandleMembershipInvitationData,
  HandleMembershipInvitationResponse,
  MeAuthData,
  RevokeConnectedAppData,
  RevokeConnectedAppResponse,
  ToggleMfaData,
  User,
} from 'sdk';
import {
  acceptInvitationToken,
  createPasskey,
  deletePasskey,
  deleteTotp,
  getConnectedApps,
  getMyInvitations,
  getMyMemberships,
  handleMembershipInvitation,
  revokeConnectedApp,
  toggleMfa,
  type UpdateMeData,
  updateMe,
} from 'sdk';
import type { ApiError } from '~/lib/api';
import { getPasskeyRegistrationCredential } from '~/modules/auth/passkey-credentials';
import { ensureStepUp, withStepUp } from '~/modules/auth/step-up';
import { StepUpDismissed } from '~/modules/auth/step-up-retry';
import { toaster } from '~/modules/common/toaster/toaster';
import { getAndSetMe, getAndSetMeAuthData } from '~/modules/me/helpers';
import type { Passkey } from '~/modules/me/types';
import { userQueryKeys } from '~/modules/user/query';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import type { MutationData } from '~/query/types';

export const meKeys = {
  all: ['me'] as const,
  auth: ['me', 'auth'] as const,
  invites: ['me', 'invites'] as const,
  connectedApps: ['me', 'connected-apps'] as const,
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
    connectedApp: ['me', 'delete', 'connected-app'] as const,
    totp: ['me', 'delete', 'totp'] as const,
  },
  handleInvitation: ['me', 'handle-invitation'] as const,
  acceptInvitationToken: ['me', 'accept-invitation-token'] as const,
};

export const meQueryOptions = () => queryOptions({ queryKey: meKeys.all, queryFn: getAndSetMe });

export const meAuthQueryOptions = () => queryOptions({ queryKey: meKeys.auth, queryFn: getAndSetMeAuthData });

export const meConnectedAppsQueryOptions = () =>
  queryOptions({ queryKey: meKeys.connectedApps, queryFn: () => getConnectedApps() });

export const meInvitationsQueryOptions = () =>
  queryOptions({ queryKey: meKeys.invites, queryFn: () => getMyInvitations() });

export const useUpdateSelfMutation = () => {
  return useMutation<User, ApiError, Omit<UpdateMeData['body'], 'role' | 'userFlags'>>({
    mutationKey: meKeys.update.info,
    mutationFn: (body) => updateMe({ body }),
    onSuccess: (updatedUser) => applyUpdatedSelf(updatedUser),
    gcTime: 1000 * 10,
  });
};

export const useToggleMfaMutation = () => {
  return useMutation<User, ApiError, NonNullable<ToggleMfaData['body']>>({
    mutationKey: meKeys.update.info,
    mutationFn: (body) => withStepUp(() => toggleMfa({ body })),
    onSuccess: (updatedUser, { mfaRequired: isEnabling }) => {
      applyUpdatedSelf(updatedUser);
      if (isEnabling) queryClient.invalidateQueries({ queryKey: meKeys.auth });
      toaster.success(t(`mfa_${updatedUser.mfaRequired ? 'enabled' : 'disabled'}`));
    },
    gcTime: 1000 * 10,
  });
};

export const useUpdateSelfFlagsMutation = () => {
  return useMutation<User, ApiError, Pick<UpdateMeData['body'], 'userFlags'>>({
    mutationKey: meKeys.update.flags,
    mutationFn: (body) => updateMe({ body }),
    onSuccess: (updatedUser) => applyUpdatedSelf(updatedUser),
    gcTime: 1000 * 10,
  });
};

export const useCreatePasskeyMutation = () => {
  return useMutation<Passkey, ApiError, void>({
    mutationKey: meKeys.register.passkey,
    mutationFn: async () => {
      // Stepped up before the ceremony, so the authenticator prompts once.
      await ensureStepUp();
      return withStepUp(async () => {
        const credentialData = await getPasskeyRegistrationCredential();
        return createPasskey({ body: credentialData });
      });
    },
    onSuccess: (newPasskey) => {
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          passkeys: [newPasskey, ...oldData.passkeys],
        };
      });
      toaster.success(t('c:success.passkey_added'));
    },
    onError(error) {
      if (error instanceof StepUpDismissed) return;
      // On cancel throws error NotAllowedError
      console.error('Error during passkey registration:', error);
      toaster.error(t('error:passkey_registration_failed'));
    },
  });
};

export const useDeletePasskeyMutation = () => {
  return useMutation<DeletePasskeyResponse, ApiError, MutationData<DeletePasskeyData>>({
    mutationKey: meKeys.delete.passkey,
    mutationFn: ({ path }) => withStepUp(() => deletePasskey({ path })),
    onSuccess: (_data, { path: { id } }) => {
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          passkeys: oldData.passkeys.filter((passkey) => id !== passkey.id),
        };
      });
      toaster.success(t('c:success.delete_resource', { resource: t('c:passkey') }));
    },
    onError(error) {
      if (error instanceof StepUpDismissed) return;
      console.error('Error deleting passkey:', error);
      toaster.error(t('error:passkey_delete_failed'));
    },
  });
};

export const useDeleteTotpMutation = () => {
  return useMutation<DeleteTotpResponse, ApiError, void>({
    mutationKey: meKeys.delete.totp,
    mutationFn: () => withStepUp(() => deleteTotp()),
    onSuccess: () => {
      toaster.success(t('c:success.delete_resource', { resource: t('c:totp') }));
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, hasTotp: false };
      });
    },
    onError(error) {
      if (error instanceof StepUpDismissed) return;
      console.error('Error deleting totp:', error);
      toaster.error(t('error:totp_delete_failed'));
    },
  });
};

const applyUpdatedSelf = (updatedUser: User) => {
  const { updateUser } = useUserStore.getState();

  queryClient.setQueryData(userQueryKeys.detail.byId(updatedUser.id), updatedUser);
  updateUser(updatedUser);
};

/** Source of truth for the current user's memberships in the frontend. */
export const myMembershipsQueryOptions = () =>
  queryOptions({
    queryKey: meKeys.memberships,
    queryFn: ({ signal }) => getMyMemberships({ signal }),
    staleTime: 0,
  });

/** Once an invitation is answered: refresh memberships so the menu rebuilds, drop the invite from cache, and say so. */
const onInvitationSettled = async (settledEntity: { id: string }, action: 'accept' | 'reject') => {
  await queryClient.invalidateQueries({ queryKey: meKeys.memberships });

  queryClient.setQueryData<GetMyInvitationsResponse>(meKeys.invites, (oldData) => {
    if (!oldData) return oldData;
    return { ...oldData, items: oldData.items.filter((invite) => invite.entity.id !== settledEntity.id) };
  });

  toaster.success(t('c:invitation_settled', { action: action === 'accept' ? 'accepted' : 'rejected' }));
};

/** Answers an invitation listed in-app, by its id. */
export const useHandleInvitationMutation = () =>
  useMutation<HandleMembershipInvitationResponse, ApiError, MutationData<HandleMembershipInvitationData>>({
    mutationKey: meKeys.handleInvitation,
    mutationFn: ({ path }) => handleMembershipInvitation({ path }),
    onSuccess: (settledEntity, { path: { acceptOrReject } }) => onInvitationSettled(settledEntity, acceptOrReject),
  });

/** Accepts the invitation behind the single-use token cookie, as the signed-in account. */
export const useAcceptInvitationTokenMutation = () =>
  useMutation<AcceptInvitationTokenResponse, ApiError, void>({
    mutationKey: meKeys.acceptInvitationToken,
    mutationFn: () => acceptInvitationToken(),
    onSuccess: (settledEntity) => onInvitationSettled(settledEntity, 'accept'),
  });

/** Revoking a consent deletes its tokens server-side; the list drops the row without a refetch. */
export const useRevokeConnectedAppMutation = () => {
  return useMutation<RevokeConnectedAppResponse, ApiError, MutationData<RevokeConnectedAppData>>({
    mutationKey: meKeys.delete.connectedApp,
    mutationFn: ({ path }) => revokeConnectedApp({ path }),
    onSuccess: (_data, { path: { id } }) => {
      queryClient.setQueryData<GetConnectedAppsResponse>(meKeys.connectedApps, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, items: oldData.items.filter((item) => item.id !== id) };
      });
      toaster.success(t('c:success.revoke_resource', { resource: t('c:connected_app') }));
    },
    onError(error) {
      console.error('Error revoking connected app:', error);
    },
  });
};
