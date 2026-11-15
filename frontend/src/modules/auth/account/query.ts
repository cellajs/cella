import { WebAuthnError } from '@simplewebauthn/browser';
import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import type {
  CreateTotpData,
  CreateTotpResponses,
  DeletePasskeyData,
  DeletePasskeyResponse,
  DeleteTotpResponse,
  RemoveUserPasskeysResponse,
  RevokeMySessionsResponse,
  RevokeUserSessionsResponse,
  ToggleMfaData,
  User,
} from 'sdk';
import {
  createPasskey,
  createTotp,
  deletePasskey,
  deleteTotp,
  generateTotpKey,
  getMyAuth,
  removeUserPasskeys,
  removeUserTotp,
  revokeMySessions,
  revokeUserSessions,
  toggleMfa,
} from 'sdk';
import { ApiError } from '~/lib/api';
import type { Passkey } from '~/modules/auth/account/types';
import { getPasskeyRegistrationCredential } from '~/modules/auth/passkey-credentials';
import { ensureStepUp, withStepUp } from '~/modules/auth/step-up';
import { StepUpDismissedError } from '~/modules/auth/step-up-retry';
import { toaster } from '~/modules/common/toaster/toaster';
import { applyUpdatedSelf } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';
import type { MutationData } from '~/query/types';

const accountKeys = {
  auth: ['auth', 'account'] as const,
  totpKey: ['auth', 'account', 'totp-key'] as const,
  mfa: ['auth', 'account', 'mfa'] as const,
  register: { passkey: ['auth', 'account', 'register', 'passkey'] as const, totp: ['auth', 'account', 'register', 'totp'] as const },
  recovery: ['auth', 'account', 'recovery'] as const,
  delete: {
    passkey: ['auth', 'account', 'delete', 'passkey'] as const,
    totp: ['auth', 'account', 'delete', 'totp'] as const,
    sessions: ['auth', 'account', 'delete', 'sessions'] as const,
  },
};

// A mount past the stale time refetches: a session or passkey added elsewhere must show.
export const meAuthQueryOptions = () => queryOptions({ queryKey: accountKeys.auth, queryFn: () => getMyAuth(), refetchOnMount: true });

/** A new authenticator key with its QR code. Once confirmed it is the second factor: never persisted, and gone with the setup. */
export const totpKeyQueryOptions = () =>
  queryOptions({
    queryKey: accountKeys.totpKey,
    queryFn: () => withStepUp(() => generateTotpKey()),
    // Only the setup's refresh asks again: a key requested after the step-up window opens the re-auth dialog.
    staleTime: 'static',
    gcTime: 0,
    meta: { persist: false },
  });

export const useToggleMfaMutation = () =>
  useMutation<User, ApiError, NonNullable<ToggleMfaData['body']>>({
    mutationKey: accountKeys.mfa,
    mutationFn: (body) => withStepUp(() => toggleMfa({ body })),
    onSuccess: (updatedUser, { mfaRequired: isEnabling }) => {
      applyUpdatedSelf(updatedUser);
      if (isEnabling) queryClient.invalidateQueries({ queryKey: accountKeys.auth });
      toaster.success(t(updatedUser.mfaRequired ? 'c:mfa_enabled' : 'c:mfa_disabled'));
    },
    gcTime: 1000 * 10,
  });

export const useCreatePasskeyMutation = () =>
  useMutation<Passkey, ApiError | Error, void>({
    mutationKey: accountKeys.register.passkey,
    mutationFn: async () => {
      // Stepped up before the ceremony, so the authenticator prompts once.
      await ensureStepUp('enroll');
      return withStepUp(async () => {
        const credentialData = await getPasskeyRegistrationCredential();
        return createPasskey({ body: credentialData });
      });
    },
    onSuccess: (newPasskey) => {
      queryClient.setQueryData(meAuthQueryOptions().queryKey, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, passkeys: [newPasskey, ...oldData.passkeys] };
      });
      toaster.success(t('c:success.add_resource', { resource: t('c:passkey') }));
    },
    onError(error) {
      // The global handler toasts the server's refusals; a failure in the browser, a cancelled prompt included, gets this toast.
      if (error instanceof StepUpDismissedError || error instanceof ApiError) return;
      if (error instanceof WebAuthnError && error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
        return toaster.info(t('error:passkey_already_registered'));
      }
      console.error('Error during passkey registration:', error);
      toaster.error(t('error:passkey_registration_failed'));
    },
  });

export const useDeletePasskeyMutation = () =>
  useMutation<DeletePasskeyResponse, ApiError, MutationData<DeletePasskeyData>>({
    mutationKey: accountKeys.delete.passkey,
    mutationFn: ({ path }) => withStepUp(() => deletePasskey({ path })),
    onSuccess: (_data, { path: { passkeyId } }) => {
      queryClient.setQueryData(meAuthQueryOptions().queryKey, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, passkeys: oldData.passkeys.filter((passkey) => passkeyId !== passkey.id) };
      });
      toaster.success(t('c:success.delete_resource', { resource: t('c:passkey') }));
    },
  });

/** Confirms the authenticator key with its first code; the key leaves the cache with it. */
export const useCreateTotpMutation = () =>
  useMutation<CreateTotpResponses[201], ApiError, CreateTotpData['body']>({
    mutationKey: accountKeys.register.totp,
    mutationFn: (body) => withStepUp(() => createTotp({ body })),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: accountKeys.totpKey });
      queryClient.setQueryData(meAuthQueryOptions().queryKey, (oldData) => {
        if (!oldData) return oldData;
        // The setup confirmed the key with a code, which counts as its first use
        const now = new Date().toISOString();
        return { ...oldData, totp: { createdAt: now, lastUsedAt: now } };
      });
      toaster.success(t('c:success.add_resource', { resource: t('c:totp') }));
    },
  });

export const useDeleteTotpMutation = () =>
  useMutation<DeleteTotpResponse, ApiError, void>({
    mutationKey: accountKeys.delete.totp,
    mutationFn: () => withStepUp(() => deleteTotp()),
    onSuccess: () => {
      toaster.success(t('c:success.delete_resource', { resource: t('c:totp') }));
      queryClient.setQueryData(meAuthQueryOptions().queryKey, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, totp: null };
      });
    },
  });

/** Revokes sessions by id, stepping up when another session is among them; each cached session takes its revoked row and moves to history. */
export const useRevokeSessionsMutation = () =>
  useMutation<RevokeMySessionsResponse['results'], ApiError, string[]>({
    mutationKey: accountKeys.delete.sessions,
    mutationFn: async (ids) => {
      const { results } = await withStepUp(() => revokeMySessions({ body: { ids } }));
      return results;
    },
    onSuccess: (revoked) => {
      const revokedById = new Map(revoked.map((session) => [session.id, session]));
      queryClient.setQueryData(meAuthQueryOptions().queryKey, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, sessions: oldData.sessions.map((session) => ({ ...session, ...revokedById.get(session.id) })) };
      });
      toaster.success(t('c:success.sessions_signed_out', { count: revoked.length }));
    },
  });

/** The factor an administrator removes from another account: every passkey, or the authenticator app. */
export type RecoverableFactor = 'passkey' | 'totp';

/** A system administrator ends every session of another user, with a step-up; the person is mailed. */
export const useRevokeUserSessionsMutation = (userId: string) =>
  useMutation<RevokeUserSessionsResponse, ApiError, void>({
    mutationKey: [...accountKeys.recovery, userId, 'sessions'],
    mutationFn: () => withStepUp(() => revokeUserSessions({ path: { userId } })),
    onSuccess: ({ revoked }) => toaster.success(t('c:success.sessions_signed_out', { count: revoked })),
  });

/** A system administrator removes a lost factor from another account, with a step-up; MFA turns off when a required method is gone. */
export const useRemoveUserFactorMutation = (userId: string, factor: RecoverableFactor) =>
  useMutation<RemoveUserPasskeysResponse, ApiError, void>({
    mutationKey: [...accountKeys.recovery, userId, factor],
    mutationFn: () => withStepUp(() => (factor === 'passkey' ? removeUserPasskeys({ path: { userId } }) : removeUserTotp({ path: { userId } }))),
    onSuccess: ({ mfaDisabled }) => {
      const resource = t(factor === 'passkey' ? 'c:passkeys' : 'c:totp');
      toaster.success(t(mfaDisabled ? 'c:success.factor_removed_mfa_off' : 'c:success.delete_resource', { resource }));
    },
  });
