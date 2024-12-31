import { config } from 'config';
import { t } from 'i18next';

import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { type QueryKey, onlineManager } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createToast } from '~/lib/toasts';
import { authThroughPasskey, getChallenge, setPasskey } from '~/modules/auth/api';
import { deletePasskey as baseRemovePasskey, getSelf, getUserMenu } from '~/modules/users/api';
import { getQueryItems } from '~/query/helpers/mutate-query';
import type { InfiniteQueryData, QueryData } from '~/query/types';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import type { LimitedUser } from '~/types/common';

// Register a new passkey
export const registerPasskey = async () => {
  if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

  const user = useUserStore.getState().user;

  try {
    // Random bytes generated in the server.
    // This must be generated on each attempt.
    const { challengeBase64 } = await getChallenge();

    // random ID for the authenticator
    // this does not need to match the actual user ID
    const userId = new Uint8Array(20);
    crypto.getRandomValues(userId);

    const userName = user.firstName || user.name;
    const passkeyNameOnDevice = config.mode === 'development' ? `${userName} for ${config.name}` : userName;
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: decodeBase64(challengeBase64),
        user: {
          id: userId,
          name: passkeyNameOnDevice,
          displayName: userName,
        },
        rp: {
          id: config.mode === 'development' ? 'localhost' : config.domain,
          name: config.name,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        attestation: 'none', // none for passkeys
        authenticatorSelection: {
          userVerification: 'required',
        },
      },
    });

    if (!(credential instanceof PublicKeyCredential)) throw new Error('Failed to create public key');
    const response = credential.response;
    if (!(response instanceof AuthenticatorAttestationResponse)) throw new Error('Unexpected response type');

    const credentialData = {
      userEmail: user.email,
      attestationObject: encodeBase64(new Uint8Array(response.attestationObject)),
      clientDataJSON: encodeBase64(new Uint8Array(response.clientDataJSON)),
    };

    const result = await setPasskey(credentialData);

    if (result) {
      toast.success(t('common:success.passkey_added'));
      useUserStore.getState().setUser({ ...user, passkey: true });
    } else toast.error(t('common:error.passkey_add_failed'));
  } catch (error) {
    // On cancel throws error NotAllowedError
    console.error('Error during passkey registration:', error);
    toast.error(t('common:error.passkey_add_failed'));
  }
};

// Sigh in by the passkey
export const passkeyAuth = async (userEmail: string, callback?: () => void) => {
  try {
    // Random bytes generated in the server.
    // This must be generated on each attempt.
    const { challengeBase64 } = await getChallenge();

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: decodeBase64(challengeBase64),
        userVerification: 'required',
      },
    });

    if (!(credential instanceof PublicKeyCredential)) throw new Error('Failed to create public key');
    const { response } = credential;
    if (!(response instanceof AuthenticatorAssertionResponse)) throw new Error('Unexpected response type');

    const credentialData = {
      clientDataJSON: encodeBase64(new Uint8Array(response.clientDataJSON)),
      authenticatorData: encodeBase64(new Uint8Array(response.authenticatorData)),
      signature: encodeBase64(new Uint8Array(response.signature)),
      userEmail,
    };

    const success = await authThroughPasskey(credentialData);
    if (success) callback?.();
    else toast.error(t('common:error.passkey_sign_in'));
  } catch (err) {
    toast.error(t('common:error.passkey_sign_in'));
  }
};

// Delete an existing passkey
export const deletePasskey = async () => {
  if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

  try {
    const result = await baseRemovePasskey();
    if (result) {
      toast.success(t('common:success.passkey_removed'));
      useUserStore.getState().setUser({ ...useUserStore.getState().user, passkey: false });
    } else toast.error(t('common:error.passkey_remove_failed'));
  } catch (error) {
    console.error('Error removing passkey:', error);
    toast.error(t('common:error.passkey_remove_failed'));
  }
};

export const getAndSetMe = async () => {
  const user = await getSelf();
  const currentSession = user.sessions.find((s) => s.isCurrent);
  // if impersonation session don't change the last user
  if (currentSession?.type === 'impersonation') useUserStore.getState().setUserWithoutSetLastUser(user);
  else useUserStore.getState().setUser(user);

  return user;
};

export const getAndSetMenu = async () => {
  const menu = await getUserMenu();
  useNavigationStore.setState({ menu });
  return menu;
};

export const findUserFromQueries = (queries: [QueryKey, InfiniteQueryData<LimitedUser> | QueryData<LimitedUser> | undefined][], idOrSlug: string) => {
  for (const [_, prevData] of queries) {
    if (!prevData) continue;

    const data = getQueryItems(prevData);
    const user = data.find((item) => item.id === idOrSlug);
    if (user) return user;
  }
  return null;
};
