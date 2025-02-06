import { config } from 'config';
import { t } from 'i18next';

import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { type QueryKey, onlineManager } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authenticateWithPasskey, getChallenge, registerPasskey } from '~/modules/auth/api';
import { createToast } from '~/modules/common/toaster';
import { deletePasskey as baseRemovePasskey, getSelf, getSelfAuthInfo, getUserMenu } from '~/modules/users/api';
import type { LimitedUser } from '~/modules/users/types';
import { getQueryItems } from '~/query/helpers/mutate-query';
import type { InfiniteQueryData, QueryData } from '~/query/types';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

/**
 * Registers a new passkey for the user.
 *
 * This function generates a challenge for passkey creation, and then creates a passkey using the WebAuthn API.
 *
 * @throws Error if passkey creation fails or if the response is unexpected.
 */
export const passkeyRegistration = async () => {
  if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

  const user = useUserStore.getState().user;

  try {
    // Random bytes generated on each attempt.
    const { challengeBase64 } = await getChallenge();

    // random ID for the authenticator
    const userId = new Uint8Array(20);
    crypto.getRandomValues(userId);

    const nameOnDevice = config.mode === 'development' ? `${user.email} for ${config.name}` : user.email;
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: decodeBase64(challengeBase64),
        user: {
          id: userId,
          name: nameOnDevice,
          displayName: user.name || user.email,
        },
        rp: {
          id: config.mode === 'development' ? 'localhost' : config.domain,
          name: config.name,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        attestation: 'none', // No verification of authenticator device
        authenticatorSelection: {
          residentKey: 'required',
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

    const result = await registerPasskey(credentialData);

    if (!result) toast.error(t('error:passkey_add_failed'));

    toast.success(t('common:success.passkey_added'));
    useUserStore.getState().setUser({ ...user, passkey: true });
  } catch (error) {
    // On cancel throws error NotAllowedError
    console.error('Error during passkey registration:', error);
    toast.error(t('error:passkey_add_failed'));
  }
};

/**
 * Signs in a user using a passkey (WebAuthn).
 *
 * This function generates a challenge for passkey authentication, retrieves the user's credentials via
 * the WebAuthn API, and sends the authentication data to the server for validation.
 *
 * @param userEmail - User's email address.
 * @param callback - An optional callback function that is triggered upon successful authentication.
 *
 * @throws Error if credential creation or response is invalid.
 */
export const passkeyAuth = async (userEmail: string, callback?: () => void) => {
  try {
    // Random bytes generated on each attempt
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

    const success = await authenticateWithPasskey(credentialData);
    if (success) callback?.();
    else toast.error(t('error:passkey_sign_in'));
  } catch (err) {
    toast.error(t('error:passkey_sign_in'));
  }
};

/**
 * Deletes an existing passkey for current user.
 *
 * @throws Error if there is an issue with removing the passkey.
 */
export const deletePasskey = async () => {
  if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

  try {
    const result = await baseRemovePasskey();
    if (result) {
      toast.success(t('common:success.passkey_removed'));
      useUserStore.getState().setUser({ ...useUserStore.getState().user, passkey: false });
    } else toast.error(t('error:passkey_remove_failed'));
  } catch (error) {
    console.error('Error removing passkey:', error);
    toast.error(t('error:passkey_remove_failed'));
  }
};

/**
 * Retrieves the current user's information and updates the user store.
 * If the user is impersonating, it does not update the last user.
 *
 * @returns The user data object.
 */
export const getAndSetMe = async () => {
  const user = await getSelf();
  const authInfo = await getSelfAuthInfo();
  const currentSession = authInfo.sessions.find((s) => s.isCurrent);
  // if impersonation session don't change the last user
  if (currentSession?.type === 'impersonation') useUserStore.getState().setUserWithoutSetLastUser({ ...user, ...authInfo });
  else useUserStore.getState().setUser({ ...user, ...authInfo });

  return { ...user, ...authInfo };
};

/**
 * Retrieves the user's navigation menu and updates the navigation store.
 *
 * @returns The menu data.
 */
export const getAndSetMenu = async () => {
  const menu = await getUserMenu();
  useNavigationStore.setState({ menu });
  return menu;
};

/**
 * Searches through the query data to find a user by their ID or slug.
 *
 * @param queries - An array of tuples, each containing a query key and associated data.
 * @param idOrSlug - The ID or slug to search for.
 * @returns User data if found, otherwise null.
 */
export const findUserFromQueries = (queries: [QueryKey, InfiniteQueryData<LimitedUser> | QueryData<LimitedUser> | undefined][], idOrSlug: string) => {
  for (const [_, prevData] of queries) {
    if (!prevData) continue;

    const data = getQueryItems(prevData);
    const user = data.find((item) => item.id === idOrSlug);
    if (user) return user;
  }
  return null;
};
