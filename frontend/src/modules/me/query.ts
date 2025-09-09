import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { queryOptions, useMutation } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import type { User } from '~/api.gen';
import { getMyInvites, getPasskeyChallenge, registratePasskey, type UpdateMeData, unlinkPasskey, unlinkTotp, updateMe } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/service';
import { generatePasskeyName, getAndSetMe, getAndSetMeAuthData, getAndSetMenu } from '~/modules/me/helpers';
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
 * Mutation hook for registrate current user (self) passkey
 *
 * @returns The mutation hook for registrate passkey.
 */
export const useRegistratePasskeyMutation = () => {
  return useMutation<Passkey, ApiError, void>({
    mutationKey: meKeys.delete.passkey(),
    mutationFn: async () => {
      // Fetch a challenge from BE
      const { challengeBase64 } = await getPasskeyChallenge({ query: { type: 'registration' } });

      // Generate a unique user ID for this credential
      const userId = new Uint8Array(20);
      crypto.getRandomValues(userId);

      const isDevelopment = appConfig.mode === 'development';

      const generatedName = generatePasskeyName(useUserStore.getState().user.email);
      const nameOnDevice = isDevelopment ? `${generatedName} for ${appConfig.name}` : generatedName;
      const raw = decodeBase64(challengeBase64);
      const challenge = new Uint8Array(raw); // proper ArrayBuffer

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          user: {
            id: userId,
            name: nameOnDevice,
            displayName: nameOnDevice,
          },
          rp: {
            id: isDevelopment ? 'localhost' : appConfig.domain,
            name: appConfig.name,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          attestation: 'none',
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'required',
            userVerification: 'required',
          },
        },
      });

      if (!(credential instanceof PublicKeyCredential)) throw new Error('Failed to create public key');
      const response = credential.response;
      if (!(response instanceof AuthenticatorAttestationResponse)) throw new Error('Unexpected response type');

      const credentialData = {
        attestationObject: encodeBase64(new Uint8Array(response.attestationObject)),
        clientDataJSON: encodeBase64(new Uint8Array(response.clientDataJSON)),
        nameOnDevice,
      };

      return await registratePasskey({ body: credentialData });
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
 * Mutation hook for unlink current user (self) passkey
 *
 * @returns The mutation hook for unlink passkey.
 */
export const useUnlinkPasskeyMutation = () => {
  return useMutation<boolean, ApiError, string>({
    mutationKey: meKeys.delete.passkey(),
    mutationFn: (id: string) => unlinkPasskey({ path: { id } }),
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
