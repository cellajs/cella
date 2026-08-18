import {
  type AuthenticationResponseJSON,
  browserSupportsWebAuthnAutofill,
  bufferToBase64URLString,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
} from '@simplewebauthn/browser';
import { generatePasskeyChallenge } from 'sdk';
import { appConfig } from 'shared';
import type { PasskeyCredentialProps } from '~/modules/auth/types';
import { generatePasskeyName } from '~/modules/me/helpers';
import { getCurrentUser } from '~/modules/user/user-store';

const relyingPartyId = appConfig.mode === 'development' ? 'localhost' : appConfig.domain;

/** True when the browser can show passkey suggestions in its autofill UI (conditional mediation). */
export const isConditionalMediationAvailable = (): Promise<boolean> => browserSupportsWebAuthnAutofill();

/** Cancellable passkey autofill: an email selects explicit credential IDs, omission uses discoverable credentials. */
export const startConditionalMediation = async (
  onCredential: (data: ConditionalMediationResult) => void,
  signal: AbortSignal,
  email?: string,
) => {
  const challengeQuery = email ? { type: 'authentication' as const, email } : { type: 'authentication' as const };
  const { challenge, credentialIds } = await getChallenge(challengeQuery);

  const optionsJSON: PublicKeyCredentialRequestOptionsJSON = {
    challenge,
    rpId: relyingPartyId,
    userVerification: 'required',
    allowCredentials: email && credentialIds?.length ? credentialIds.map(toAllowCredential) : [],
  };

  // The ceremony is managed by @simplewebauthn's singleton abort service; forward external aborts
  signal.addEventListener('abort', () => WebAuthnAbortService.cancelCeremony(), { once: true });

  const assertion = await startAuthentication({
    optionsJSON,
    useBrowserAutofill: true,
    verifyBrowserAutofillInput: false,
  });

  onCredential({ assertion, type: 'authentication' });
};

export type ConditionalMediationResult = {
  assertion: AuthenticationResponseJSON;
  type: 'authentication';
};

/** Runs WebAuthn registration and returns the attestation as base64url JSON for the backend. */
export const getPasskeyRegistrationCredential = async () => {
  const { challenge } = await getChallenge({ type: 'registration' });

  const userHandle = bufferToBase64URLString(crypto.getRandomValues(new Uint8Array(20)).buffer);

  const isDevelopment = appConfig.mode === 'development';

  const email = getCurrentUser().email;
  const generatedName = generatePasskeyName();
  const nameOnDevice = isDevelopment
    ? `${email} (${generatedName}) for ${appConfig.name}`
    : `${email} (${generatedName})`;

  const attestation = await startRegistration({
    optionsJSON: {
      challenge,
      user: {
        id: userHandle,
        name: nameOnDevice,
        displayName: nameOnDevice,
      },
      rp: {
        id: relyingPartyId,
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

  return { attestation, nameOnDevice };
};

/** Returns the passkey verify credential (assertion plus the challenge query context). */
export const getPasskeyVerifyCredential = async (
  query: Omit<PasskeyCredentialProps, 'type'> & {
    type: Exclude<PasskeyCredentialProps['type'], 'registration'>;
  },
) => {
  const { challenge, credentialIds } = await getChallenge(query);

  const assertion = await startAuthentication({
    optionsJSON: {
      challenge,
      rpId: relyingPartyId,
      userVerification: 'required',
      allowCredentials: credentialIds.map(toAllowCredential),
    },
  });

  return { assertion, ...query };
};

const toAllowCredential = (id: string) => ({
  id,
  type: 'public-key' as const,
  transports: ['internal' as const],
});

const getChallenge = async (body: PasskeyCredentialProps) => {
  // Fetch a base64url challenge from BE; it doubles as the WebAuthn JSON options value
  const { challenge, credentialIds } = await generatePasskeyChallenge({ body });

  return { challenge, credentialIds };
};
