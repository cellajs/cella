import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { onlineManager } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import { createPasskey, getMe, getMyAuth, getMyMenu, getPasskeyChallenge, signInWithPasskey } from '~/api.gen';
import { toaster } from '~/modules/common/toaster';
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

    const isDevelopment = appConfig.mode === 'development';

    const nameOnDevice = isDevelopment ? `${user.email} for ${appConfig.name}` : user.email;
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: decodeBase64(challengeBase64),
        user: {
          id: userId,
          name: nameOnDevice,
          displayName: user.name || user.email,
        },
        rp: {
          id: isDevelopment ? 'localhost' : appConfig.domain,
          name: appConfig.name,
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
      attestationObject: encodeBase64(new Uint8Array(response.attestationObject)),
      clientDataJSON: encodeBase64(new Uint8Array(response.clientDataJSON)),
    };

    const result = await createPasskey({ body: credentialData });
    if (!result) toaster(t('error:passkey_add_failed'), 'error');

    toaster(t('common:success.passkey_added'), 'success');

    useUserStore.getState().setMeAuthData({ passkey: true });
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

    // TODO can we use a mutation hook for this? if not, we should handle errors better, send to Sentry.
    const success = await signInWithPasskey({ body: credentialData });
    if (success) callback?.();
    else toaster(t('error:passkey_sign_in'), 'error');
  } catch (err) {
    toaster(t('error:passkey_sign_in'), 'error');
  }
};

/**
 * Retrieves the current user's information and updates the user store.
 * If the user is impersonating, it does not update the last user.
 *
 * @returns The user data object.
 */
export const getAndSetMe = async () => {
  const user = await getMe();
  const skipLastUser = useUIStore.getState().impersonating;
  useUserStore.getState().setUser(user, skipLastUser);
  return user;
};

/**
 * Retrieves the current user's authentication information and updates the user store.
 *
 * @returns The data object.
 */
export const getAndSetMeAuthData = async () => {
  const authInfo = await getMyAuth();
  useUserStore.getState().setMeAuthData(authInfo);
  return authInfo;
};

/**
 * Retrieves the user's navigation menu and updates the navigation store.
 *
 * @returns The menu data.
 */
export const getAndSetMenu = async () => {
  const menu = await getMyMenu();
  useNavigationStore.setState({ menu });
  return menu;
};
