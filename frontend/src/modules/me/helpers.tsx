import { config } from 'config';
import { t } from 'i18next';

import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { onlineManager } from '@tanstack/react-query';
import { authenticateWithPasskey, getPasskeyChallenge } from '~/modules/auth/api';
import { toaster } from '~/modules/common/toaster';
import { deletePasskey as baseRemovePasskey, createPasskey, getSelf, getSelfAuthInfo, getSelfMenu } from '~/modules/me/api';
import { useNavigationStore } from '~/store/navigation';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

/**
 * Registers a new passkey for the user.
 *
 * This function generates a challenge for passkey creation, and then creates a passkey using the WebAuthn API.
 *
 * @throws Error if passkey creation fails or if the response is unexpected.
 * @returns True if the passkey was successfully created, otherwise false.
 */
export const passkeyRegistration = async () => {
  if (!onlineManager.isOnline()) {
    toaster(t('common:action.offline.text'), 'warning');
    return false;
  }

  const user = useUserStore.getState().user;

  try {
    // Random bytes generated on each attempt.
    const { challengeBase64 } = await getPasskeyChallenge();

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
      userEmail: user.email,
      attestationObject: encodeBase64(new Uint8Array(response.attestationObject)),
      clientDataJSON: encodeBase64(new Uint8Array(response.clientDataJSON)),
    };

    const result = await createPasskey(credentialData);

    if (!result) toaster(t('error:passkey_add_failed'), 'error');

    toaster(t('common:success.passkey_added'), 'success');

    useUserStore.getState().setUserAuthInfo({ passkey: true });
    return result;
  } catch (error) {
    // On cancel throws error NotAllowedError
    console.error('Error during passkey registration:', error);
    toaster(t('error:passkey_add_failed'), 'error');
    return false;
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
    const { challengeBase64 } = await getPasskeyChallenge();

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
    else toaster(t('error:passkey_sign_in'), 'error');
  } catch (err) {
    toaster(t('error:passkey_sign_in'), 'error');
  }
};

/**
 * Deletes an existing passkey for current user.
 *
 * @throws Error if there is an issue with removing the passkey.
 * @returns True if the passkey was successfully removed, otherwise false.
 */
export const deletePasskey = async () => {
  if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

  try {
    const result = await baseRemovePasskey();
    if (!result) {
      toaster(t('common:success.passkey_removed'), 'success');

      useUserStore.getState().setUserAuthInfo({ passkey: false });
      return true;
    }
    toaster(t('error:passkey_remove_failed'), 'error');
    return false;
  } catch (error) {
    console.error('Error removing passkey:', error);
    toaster(t('error:passkey_remove_failed'), 'error');
    return false;
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
  const skipLastUser = useUIStore.getState().impersonating;
  useUserStore.getState().setUser(user, skipLastUser);
  return user;
};

/**
 * Retrieves the current user's authentication information and updates the user store.
 *
 * @returns The data object.
 */
export const getAndSetUserAuthInfo = async () => {
  const authInfo = await getSelfAuthInfo();
  useUserStore.getState().setUserAuthInfo(authInfo);
  return authInfo;
};

/**
 * Retrieves the user's navigation menu and updates the navigation store.
 *
 * @returns The menu data.
 */
export const getAndSetMenu = async () => {
  const menu = await getSelfMenu();
  useNavigationStore.setState({ menu });
  return menu;
};
