import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { onlineManager } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import { createPasskey, getMe, getMyAuth, getMyMenu, getPasskeyChallenge } from '~/api.gen';
import { toaster } from '~/modules/common/toaster/service';
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
    //  Fetch a challenge from BE
    const { challengeBase64 } = await getPasskeyChallenge({ query: { type: 'registrate' } });

    // random ID for the authenticator
    const userId = new Uint8Array(20);
    crypto.getRandomValues(userId);

    const isDevelopment = appConfig.mode === 'development';

    const nameOnDevice = isDevelopment ? `${user.email} for ${appConfig.name}` : user.email;
    const raw = decodeBase64(challengeBase64);
    const challenge = new Uint8Array(raw); // ensures proper ArrayBuffer

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
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
    if (!result) toaster(t('error:passkey_registration_failed'), 'error');

    toaster(t('common:success.passkey_added'), 'success');

    useUserStore.getState().setMeAuthData({ hasPasskey: true });
    return result;
  } catch (error) {
    // On cancel throws error NotAllowedError
    console.error('Error during passkey registration:', error);
    toaster(t('error:passkey_registration_failed'), 'error');
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
