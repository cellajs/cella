import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import type {
  AcceptInvitationResponse,
  AcceptInvitationTokenResponse,
  DeleteConnectedAppData,
  DeleteConnectedAppResponse,
  DeleteMeResponse,
  UpdateMeData,
  User,
} from 'sdk';
import {
  acceptInvitation,
  acceptInvitationToken,
  confirmInvitationAddress,
  declineInvitation,
  deleteConnectedApp,
  deleteMe,
  listConnectedApps,
  listMyInvitations,
  listMyMemberships,
  updateMe,
} from 'sdk';
import type { ApiError } from '~/lib/api';
import { withStepUp } from '~/modules/auth/step-up';
import { toaster } from '~/modules/common/toaster/toaster';
import { getAndSetMe } from '~/modules/me/helpers';
import { userQueryKeys } from '~/modules/user/query';
import { userStore } from '~/modules/user/user-store';
import { getEntityQueryKeys, syncChunkSize } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { queryClient } from '~/query/query-client';
import type { MutationData } from '~/query/types';

export const meKeys = {
  all: ['me'] as const,
  invites: ['me', 'invites'] as const,
  connectedApps: ['me', 'connected-apps'] as const,
  memberships: ['me', 'memberships'] as const,
  update: { info: ['me', 'update', 'info'] as const },
  delete: {
    connectedApp: ['me', 'delete', 'connected-app'] as const,
    self: ['me', 'delete', 'self'] as const,
  },
  handleInvitation: ['me', 'handle-invitation'] as const,
  acceptInvitationToken: ['me', 'accept-invitation-token'] as const,
  confirmInvitationAddress: ['me', 'confirm-invitation-address'] as const,
};

/** Never persisted: the guards read it as `static`, so a stored entry would pass a session revoked between visits and skip the store write. */
export const meQueryOptions = () => queryOptions({ queryKey: meKeys.all, queryFn: getAndSetMe, meta: { persist: false } });

/** The signed-in user's profile from the cache whatever its age, fetched once when none is cached; the fetch sets the user store. */
export const readMe = () => queryClient.query({ ...meQueryOptions(), staleTime: 'static' });

export const meConnectedAppsQueryOptions = () =>
  queryOptions({
    queryKey: meKeys.connectedApps,
    queryFn: () => fetchAllPages((page) => listConnectedApps({ query: page }), syncChunkSize),
  });

export const meInvitationsQueryOptions = () =>
  queryOptions({ queryKey: meKeys.invites, queryFn: () => fetchAllPages((page) => listMyInvitations({ query: page }), syncChunkSize) });

export const useUpdateSelfMutation = () =>
  useMutation<User, ApiError, UpdateMeData['body']>({
    mutationKey: meKeys.update.info,
    mutationFn: (body) => updateMe({ body }),
    onSuccess: (updatedUser) => applyUpdatedSelf(updatedUser),
    gcTime: 1000 * 10,
  });

/** Deletes the signed-in account; the caller signs out. */
export const useDeleteSelfMutation = () =>
  useMutation<DeleteMeResponse, ApiError, void>({
    mutationKey: meKeys.delete.self,
    mutationFn: () => withStepUp(() => deleteMe()),
  });

/** Writes a changed profile where the app reads itself: the user's detail entry and the user store. */
export const applyUpdatedSelf = (updatedUser: User) => {
  queryClient.setQueryData(userQueryKeys.detail.byId(updatedUser.id), updatedUser);
  userStore.getState().updateUser(updatedUser);
};

/**
 * The frontend's source of truth for the user's memberships, read without an abort signal: catchup awaits it, so an unmount
 * must not cancel it. It goes stale only when marked: signals and catchup keep it current, and nearly every page mounts a reader.
 */
export const myMembershipsQueryOptions = () =>
  queryOptions({
    queryKey: meKeys.memberships,
    queryFn: () => fetchAllPages((page) => listMyMemberships({ query: page }), syncChunkSize),
    staleTime: Number.POSITIVE_INFINITY,
  });

/**
 * Once an invitation is answered: refresh memberships so the menu rebuilds, and after an accept the organization list,
 * drop the invite from cache, and say so. The answer names the organization, also for an invitation to a channel below
 * it, so the invite is found by its own id; a token answer carries none, and the list reloads.
 */
const applySettledInvitation = async (invitationId: string | null, action: 'accept' | 'decline') => {
  // An accept can add an organization, and home's create prompt reads that list
  if (action === 'accept') queryClient.invalidateQueries({ queryKey: getEntityQueryKeys('organization').list.base });
  await queryClient.invalidateQueries({ queryKey: meKeys.memberships });

  if (invitationId) {
    queryClient.setQueryData(meInvitationsQueryOptions().queryKey, (oldData) => {
      if (!oldData) return oldData;
      const results = oldData.results.filter((invite) => invite.invitation.id !== invitationId);
      return { ...oldData, results, totalSize: oldData.totalSize - (oldData.results.length - results.length) };
    });
  } else {
    queryClient.invalidateQueries({ queryKey: meKeys.invites });
  }

  toaster.success(t(action === 'accept' ? 'c:success.accept_invitation' : 'c:success.decline_invitation'));
};

/** Answers an invitation listed in-app, by its id. */
export const useHandleInvitationMutation = () =>
  useMutation<AcceptInvitationResponse, ApiError, { invitationId: string; action: 'accept' | 'decline' }>({
    mutationKey: meKeys.handleInvitation,
    mutationFn: ({ invitationId, action }) => (action === 'accept' ? acceptInvitation : declineInvitation)({ path: { invitationId } }),
    onSuccess: (_organization, { invitationId, action }) => applySettledInvitation(invitationId, action),
  });

/** Accepts the token cookie's invitation as the signed-in account; refusing an address it lacks stays quiet: the accept step offers it a link. */
export const useAcceptInvitationTokenMutation = () =>
  useMutation<AcceptInvitationTokenResponse, ApiError, void>({
    mutationKey: meKeys.acceptInvitationToken,
    mutationFn: () => acceptInvitationToken(),
    onSuccess: () => applySettledInvitation(null, 'accept'),
    meta: { suppressGlobalErrorToast: (error: ApiError) => error.type === 'invitation_address_unproven' },
  });

/** Mails the invited address a link bound to the signed-in account; opening it there adds the address and lets it join. */
export const useConfirmInvitationAddressMutation = () =>
  useMutation<void, ApiError, void>({
    mutationKey: meKeys.confirmInvitationAddress,
    mutationFn: async () => {
      await confirmInvitationAddress();
    },
  });

/** Revoking a consent deletes its tokens server-side; the list drops the row without a refetch. */
export const useRevokeConnectedAppMutation = () =>
  useMutation<DeleteConnectedAppResponse, ApiError, MutationData<DeleteConnectedAppData>>({
    mutationKey: meKeys.delete.connectedApp,
    mutationFn: ({ path }) => deleteConnectedApp({ path }),
    onSuccess: (_data, { path: { connectedAppId } }) => {
      queryClient.setQueryData(meConnectedAppsQueryOptions().queryKey, (oldData) => {
        if (!oldData) return oldData;
        const results = oldData.results.filter((item) => item.id !== connectedAppId);
        return { ...oldData, results, totalSize: oldData.totalSize - (oldData.results.length - results.length) };
      });
      toaster.success(t('c:success.revoke_resource', { resource: t('c:connected_app') }));
    },
    onError: (error) => console.error('Error revoking connected app:', error),
  });
