import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import type {
  AcceptInvitationTokenResponse,
  CreateTotpData,
  CreateTotpResponses,
  DeleteMeResponse,
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
  RevokeMySessionsResponse,
  ToggleMfaData,
  UpdateMeData,
  User,
} from 'sdk';
import {
  acceptInvitationToken,
  createPasskey,
  createTotp,
  deleteMe,
  deletePasskey,
  deleteTotp,
  generateTotpKey,
  getConnectedApps,
  getMyAuth,
  getMyInvitations,
  getMyMemberships,
  handleMembershipInvitation,
  revokeConnectedApp,
  revokeMySessions,
  toggleMfa,
  updateMe,
} from 'sdk';
import { ApiError } from '~/lib/api';
import { getPasskeyRegistrationCredential } from '~/modules/auth/passkey-credentials';
import { ensureStepUp, withStepUp } from '~/modules/auth/step-up';
import { StepUpDismissedError } from '~/modules/auth/step-up-retry';
import { toaster } from '~/modules/common/toaster/toaster';
import { getAndSetMe } from '~/modules/me/helpers';
import type { Passkey } from '~/modules/me/types';
import { userQueryKeys } from '~/modules/user/query';
import { userStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import type { MutationData } from '~/query/types';

export const meKeys = {
  all: ['me'] as const,
  auth: ['me', 'auth'] as const,
  invites: ['me', 'invites'] as const,
  connectedApps: ['me', 'connected-apps'] as const,
  memberships: ['me', 'memberships'] as const,
  totpKey: ['me', 'totp-key'] as const,
  register: { passkey: ['me', 'register', 'passkey'] as const, totp: ['me', 'register', 'totp'] as const },
  update: { info: ['me', 'update', 'info'] as const, flags: ['me', 'update', 'flags'] as const },
  delete: {
    passkey: ['me', 'delete', 'passkey'] as const,
    connectedApp: ['me', 'delete', 'connected-app'] as const,
    totp: ['me', 'delete', 'totp'] as const,
    sessions: ['me', 'delete', 'sessions'] as const,
    self: ['me', 'delete', 'self'] as const,
  },
  handleInvitation: ['me', 'handle-invitation'] as const,
  acceptInvitationToken: ['me', 'accept-invitation-token'] as const,
};

/** Never persisted: the guards read it as `static`, so a stored entry would pass a session revoked between visits and skip the store write. */
export const meQueryOptions = () => queryOptions({ queryKey: meKeys.all, queryFn: getAndSetMe, meta: { persist: false } });

export const meAuthQueryOptions = () => queryOptions({ queryKey: meKeys.auth, queryFn: () => getMyAuth() });

export const meConnectedAppsQueryOptions = () => queryOptions({ queryKey: meKeys.connectedApps, queryFn: () => getConnectedApps() });

export const meInvitationsQueryOptions = () => queryOptions({ queryKey: meKeys.invites, queryFn: () => getMyInvitations() });

/** A new authenticator key with its QR code; once confirmed it is the second factor, so it is never persisted and leaves with the setup. */
export const totpKeyQueryOptions = () =>
  queryOptions({
    queryKey: meKeys.totpKey,
    queryFn: () => withStepUp(() => generateTotpKey()),
    // Only the setup's refresh asks again: a key requested after the step-up window opens the re-auth dialog, which mails a link.
    staleTime: 'static',
    gcTime: 0,
    meta: { persist: false },
  });

export const useUpdateSelfMutation = () =>
  useMutation<User, ApiError, Omit<UpdateMeData['body'], 'userFlags'>>({
    mutationKey: meKeys.update.info,
    mutationFn: (body) => updateMe({ body }),
    onSuccess: (updatedUser) => applyUpdatedSelf(updatedUser),
    gcTime: 1000 * 10,
  });

export const useToggleMfaMutation = () =>
  useMutation<User, ApiError, NonNullable<ToggleMfaData['body']>>({
    mutationKey: meKeys.update.info,
    mutationFn: (body) => withStepUp(() => toggleMfa({ body })),
    onSuccess: (updatedUser, { mfaRequired: isEnabling }) => {
      applyUpdatedSelf(updatedUser);
      if (isEnabling) queryClient.invalidateQueries({ queryKey: meKeys.auth });
      toaster.success(t(updatedUser.mfaRequired ? 'c:mfa_enabled' : 'c:mfa_disabled'));
    },
    gcTime: 1000 * 10,
  });

export const useUpdateSelfFlagsMutation = () =>
  useMutation<User, ApiError, Pick<UpdateMeData['body'], 'userFlags'>>({
    mutationKey: meKeys.update.flags,
    mutationFn: (body) => updateMe({ body }),
    // Applied before the request and kept on failure: guards read flags from the store, so a late flag sends a just-onboarded user back.
    onMutate: ({ userFlags }) => {
      userStore.setState((state) => {
        if (state.user) Object.assign(state.user.userFlags, userFlags);
      });
    },
    onSuccess: (updatedUser) => applyUpdatedSelf(updatedUser),
    gcTime: 1000 * 10,
  });

export const useCreatePasskeyMutation = () =>
  useMutation<Passkey, ApiError, void>({
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
        return { ...oldData, passkeys: [newPasskey, ...oldData.passkeys] };
      });
      toaster.success(t('c:success.passkey_added'));
    },
    onError(error) {
      // The global handler toasts the server's refusals; a failure in the browser, a cancelled prompt included, gets this toast.
      if (error instanceof StepUpDismissedError || error instanceof ApiError) return;
      console.error('Error during passkey registration:', error);
      toaster.error(t('error:passkey_registration_failed'));
    },
  });

export const useDeletePasskeyMutation = () =>
  useMutation<DeletePasskeyResponse, ApiError, MutationData<DeletePasskeyData>>({
    mutationKey: meKeys.delete.passkey,
    mutationFn: ({ path }) => withStepUp(() => deletePasskey({ path })),
    onSuccess: (_data, { path: { id } }) => {
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, passkeys: oldData.passkeys.filter((passkey) => id !== passkey.id) };
      });
      toaster.success(t('c:success.delete_resource', { resource: t('c:passkey') }));
    },
  });

/** Confirms the authenticator key with its first code; the key leaves the cache with it. */
export const useCreateTotpMutation = () =>
  useMutation<CreateTotpResponses[201], ApiError, CreateTotpData['body']>({
    mutationKey: meKeys.register.totp,
    mutationFn: (body) => withStepUp(() => createTotp({ body })),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: meKeys.totpKey });
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
        if (!oldData) return oldData;
        // The setup confirmed the key with a code, which counts as its first use
        const now = new Date().toISOString();
        return { ...oldData, totp: { createdAt: now, lastUsedAt: now } };
      });
      toaster.success(t('c:success.totp_added'));
    },
  });

export const useDeleteTotpMutation = () =>
  useMutation<DeleteTotpResponse, ApiError, void>({
    mutationKey: meKeys.delete.totp,
    mutationFn: () => withStepUp(() => deleteTotp()),
    onSuccess: () => {
      toaster.success(t('c:success.delete_resource', { resource: t('c:totp') }));
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, totp: null };
      });
    },
  });

/** Deletes the signed-in account; the caller signs out. */
export const useDeleteSelfMutation = () =>
  useMutation<DeleteMeResponse, ApiError, void>({
    mutationKey: meKeys.delete.self,
    mutationFn: () => withStepUp(() => deleteMe()),
  });

const applyUpdatedSelf = (updatedUser: User) => {
  const { updateUser } = userStore.getState();

  queryClient.setQueryData(userQueryKeys.detail.byId(updatedUser.id), updatedUser);
  updateUser(updatedUser);
};

/** Source of truth for the current user's memberships in the frontend. */
export const myMembershipsQueryOptions = () =>
  queryOptions({ queryKey: meKeys.memberships, queryFn: ({ signal }) => getMyMemberships({ signal }), staleTime: 0 });

/** Once an invitation is answered: refresh memberships so the menu rebuilds, drop the invite from cache, and say so. */
const applySettledInvitation = async (settledEntity: { id: string }, action: 'accept' | 'reject') => {
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
    onSuccess: (settledEntity, { path: { acceptOrReject } }) => applySettledInvitation(settledEntity, acceptOrReject),
  });

/** Accepts the invitation behind the single-use token cookie, as the signed-in account. */
export const useAcceptInvitationTokenMutation = () =>
  useMutation<AcceptInvitationTokenResponse, ApiError, void>({
    mutationKey: meKeys.acceptInvitationToken,
    mutationFn: () => acceptInvitationToken(),
    onSuccess: (settledEntity) => applySettledInvitation(settledEntity, 'accept'),
  });

/** Revoking a consent deletes its tokens server-side; the list drops the row without a refetch. */
export const useRevokeConnectedAppMutation = () =>
  useMutation<RevokeConnectedAppResponse, ApiError, MutationData<RevokeConnectedAppData>>({
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

/** Revokes sessions by id; each cached session takes the server's revoked row, so it moves to the history. */
export const useRevokeSessionsMutation = () =>
  useMutation<RevokeMySessionsResponse['data'], ApiError, string[]>({
    mutationKey: meKeys.delete.sessions,
    mutationFn: async (ids) => {
      const { data } = await revokeMySessions({ body: { ids } });
      return data;
    },
    onSuccess: (revoked) => {
      const revokedById = new Map(revoked.map((session) => [session.id, session]));
      queryClient.setQueryData<MeAuthData>(meKeys.auth, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, sessions: oldData.sessions.map((session) => ({ ...session, ...revokedById.get(session.id) })) };
      });
      toaster.success(t('c:success.revoke_resource', { resource: t(revoked.length === 1 ? 'c:session' : 'c:sessions') }));
    },
  });
