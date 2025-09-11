import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { appConfig } from 'config';
import { getPasskeyChallenge } from '~/api.gen';
import type { PasskeyCredentialProps } from '~/modules/auth/types';
import { generatePasskeyName } from '~/modules/me/helpers';
import { useUserStore } from '~/store/user';

export const getPasskeyRegistrationCredential = async () => {
  const { challenge } = await getChallenge({ type: 'registration' });

  // Generate a unique user ID for this credential
  const userId = new Uint8Array(20);
  crypto.getRandomValues(userId);

  const isDevelopment = appConfig.mode === 'development';

  const email = useUserStore.getState().user.email;
  const generatedName = generatePasskeyName();
  const nameOnDevice = isDevelopment ? `${email} (${generatedName}) for ${appConfig.name}` : `${email} (${generatedName})`;

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

  const { response } = validateCredentials(credential);
  if (!(response instanceof AuthenticatorAttestationResponse)) throw new Error('Unexpected response type');

  return {
    attestationObject: encodeBase64(new Uint8Array(response.attestationObject)),
    clientDataJSON: encodeBase64(new Uint8Array(response.clientDataJSON)),
    nameOnDevice: generatedName,
  };
};

export const getPasskeyVerifyCredential = async (
  query: Omit<PasskeyCredentialProps, 'type'> & {
    type: Exclude<PasskeyCredentialProps['type'], 'registration'>;
  },
) => {
  const { challenge, credentialIds } = await getChallenge(query);

  // Prepare allowCredentials for passkey request
  const allowCredentials = credentialIds.map((id: string) => ({
    id: new Uint8Array(decodeBase64(id)),
    type: 'public-key' as const,
    transports: ['internal'] as AuthenticatorTransport[],
  }));

  // Prompt user to authenticate with a passkey
  const credential = await navigator.credentials.get({ publicKey: { challenge, allowCredentials, userVerification: 'required' } });

  const { response, rawId } = validateCredentials(credential);

  // Ensure authenticator response is valid
  if (!(response instanceof AuthenticatorAssertionResponse)) throw new Error('Unexpected response type');

  // Encode all binary responses into Base64 and prepare body for BE
  return {
    credentialId: encodeBase64(new Uint8Array(rawId)),
    clientDataJSON: encodeBase64(new Uint8Array(response.clientDataJSON)),
    authenticatorData: encodeBase64(new Uint8Array(response.authenticatorData)),
    signature: encodeBase64(new Uint8Array(response.signature)),
    ...query,
  };
};

const validateCredentials = (credential: Credential | null) => {
  // Ensure response is a PublicKeyCredential
  if (!(credential instanceof PublicKeyCredential)) throw new Error('Failed to create public key');
  return credential;
};

const getChallenge = async (query: PasskeyCredentialProps) => {
  //  Fetch a challenge from BE
  const { challengeBase64, credentialIds } = await getPasskeyChallenge({ query });

  // Decode  challenge and wrap it in a Uint8Array (required format)
  const raw = decodeBase64(challengeBase64);
  const challenge = new Uint8Array(raw);

  return { challenge, credentialIds };
};
