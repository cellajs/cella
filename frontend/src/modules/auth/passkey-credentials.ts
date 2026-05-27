import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { generatePasskeyChallenge } from 'sdk';
import { appConfig } from 'shared';
import type { PasskeyCredentialProps } from '~/modules/auth/types';
import { generatePasskeyName } from '~/modules/me/helpers';
import { useUserStore } from '~/modules/user/user-store';

/**
 * Check if the browser supports conditional mediation (passkey autofill).
 * Returns true if the browser can show passkey suggestions in autofill UI.
 */
export const isConditionalMediationAvailable = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    return (await PublicKeyCredential.isConditionalMediationAvailable?.()) ?? false;
  } catch {
    return false;
  }
};

/**
 * Starts a conditional mediation (passkey autofill) flow.
 * Returns an AbortController so the caller can cancel it (e.g. on unmount or navigation).
 * When a user selects a passkey from autofill, `onCredential` is called with the assertion data.
 *
 * @param onCredential - Callback when user selects a passkey
 * @param signal - AbortSignal to cancel the mediation
 * @param email - Optional email to get specific credential IDs (non-discoverable). If omitted, uses discoverable credentials only.
 */
export const startConditionalMediation = async (
  onCredential: (data: ConditionalMediationResult) => void,
  signal: AbortSignal,
  email?: string,
) => {
  const challengeQuery = email ? { type: 'authentication' as const, email } : { type: 'authentication' as const };
  const { challenge, credentialIds } = await getChallenge(challengeQuery);

  // If email provided, use specific credential IDs; otherwise use discoverable credentials
  const allowCredentials =
    email && credentialIds?.length
      ? credentialIds.map((id: string) => ({
          id: new Uint8Array(decodeBase64(id)),
          type: 'public-key' as const,
          transports: ['internal'] as AuthenticatorTransport[],
        }))
      : [];

  const credential = await navigator.credentials.get({
    mediation: 'conditional',
    signal,
    publicKey: {
      challenge,
      rpId: appConfig.mode === 'development' ? 'localhost' : appConfig.domain,
      userVerification: 'required',
      allowCredentials, // Empty = discoverable credentials, or specific IDs for email
    },
  });

  const { response, rawId } = validateCredentials(credential);
  if (!(response instanceof AuthenticatorAssertionResponse)) throw new Error('Unexpected response type');

  onCredential({
    credentialId: encodeBase64(new Uint8Array(rawId)),
    clientDataJSON: encodeBase64(new Uint8Array(response.clientDataJSON)),
    authenticatorObject: encodeBase64(new Uint8Array(response.authenticatorData)),
    signature: encodeBase64(new Uint8Array(response.signature)),
    type: 'authentication',
  });
};

export type ConditionalMediationResult = {
  credentialId: string;
  clientDataJSON: string;
  authenticatorObject: string;
  signature: string;
  type: 'authentication';
};

/**
 * Initiates the WebAuthn registration flow to create a new passkey credential. It fetches a challenge from the backend, generates a unique user ID, and prompts the user to create a passkey. The resulting attestation object and client data are encoded in Base64 and returned for submission to the backend.
 */
export const getPasskeyRegistrationCredential = async () => {
  const { challenge } = await getChallenge({ type: 'registration' });

  // Generate a unique user ID for this credential
  const userId = new Uint8Array(20);
  crypto.getRandomValues(userId);

  const isDevelopment = appConfig.mode === 'development';

  const email = useUserStore.getState().user.email;
  const generatedName = generatePasskeyName();
  const nameOnDevice = isDevelopment
    ? `${email} (${generatedName}) for ${appConfig.name}`
    : `${email} (${generatedName})`;

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
    nameOnDevice,
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
  const credential = await navigator.credentials.get({
    publicKey: { challenge, allowCredentials, userVerification: 'required' },
  });

  const { response, rawId } = validateCredentials(credential);

  // Ensure authenticator response is valid
  if (!(response instanceof AuthenticatorAssertionResponse)) throw new Error('Unexpected response type');

  // Encode all binary responses into Base64 and prepare body for BE
  return {
    credentialId: encodeBase64(new Uint8Array(rawId)),
    clientDataJSON: encodeBase64(new Uint8Array(response.clientDataJSON)),
    authenticatorObject: encodeBase64(new Uint8Array(response.authenticatorData)),
    signature: encodeBase64(new Uint8Array(response.signature)),
    ...query,
  };
};

const validateCredentials = (credential: Credential | null) => {
  // Ensure response is a PublicKeyCredential
  if (!(credential instanceof PublicKeyCredential)) throw new Error('Failed to create public key');
  return credential;
};

const getChallenge = async (body: PasskeyCredentialProps) => {
  //  Fetch a challenge from BE
  const { challengeBase64, credentialIds } = await generatePasskeyChallenge({ body });

  // Decode  challenge and wrap it in a Uint8Array (required format)
  const raw = decodeBase64(challengeBase64);
  const challenge = new Uint8Array(raw);

  return { challenge, credentialIds };
};
