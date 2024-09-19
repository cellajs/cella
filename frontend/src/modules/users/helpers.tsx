import { config } from 'config';
import { t } from 'i18next';

import { toast } from 'sonner';
import { getChallenge, setPasskey } from '~/api/auth';
import { deletePasskey as baseRemovePasskey, getSelf, getUserMenu } from '~/api/me';
import { arrayBufferToBase64Url, base64UrlDecode } from '~/lib/utils';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

// Register a new passkey
export const registerPasskey = async () => {
  const user = useUserStore.getState().user;

  try {
    const { challengeBase64 } = await getChallenge();

    const credential = await navigator.credentials.create({
      publicKey: {
        rp: {
          id: config.mode === 'development' ? 'localhost' : config.domain,
          name: config.name,
        },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.name,
          displayName: user.firstName || user.name || 'No name provided',
        },
        challenge: base64UrlDecode(challengeBase64),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: { userVerification: 'required' },
        attestation: 'none',
      },
    });

    if (!(credential instanceof PublicKeyCredential)) throw new Error('Failed to create credential');

    const response = credential.response;
    if (!(response instanceof AuthenticatorAttestationResponse)) throw new Error('Unexpected response type');

    const credentialData = {
      email: user.email,
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
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
