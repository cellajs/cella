import { config } from 'config';
import { t } from 'i18next';

import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { toast } from 'sonner';
import { authThroughPasskey, getChallenge, setPasskey } from '~/api/auth';
import { deletePasskey as baseRemovePasskey, getSelf, getUserMenu } from '~/api/me';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

// Register a new passkey
export const registerPasskey = async () => {
  const user = useUserStore.getState().user;

  try {
    // Random bytes generated in the server.
    // This must be generated on each attempt.
    const { challengeBase64 } = await getChallenge();

    // random ID for the authenticator
    // this does not need to match the actual user ID
    const userId = new Uint8Array(20);
    crypto.getRandomValues(userId);
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: decodeBase64(challengeBase64),
        user: {
          id: userId,
          name: user.name,
          displayName: user.firstName || user.name || 'No name provided',
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
