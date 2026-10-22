import {
  type AuthenticationResponseJSON,
  browserSupportsWebAuthnAutofill,
  bufferToBase64URLString,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
} from '@simplewebauthn/browser';
import { generatePasskeyChallenge, getStepUpPasskeyChallenge } from 'sdk';
import { appConfig } from 'shared';
import type { PasskeyChallengeBody, PasskeyVerifyType } from '~/modules/auth/types';
import { getCurrentUser } from '~/modules/user/user-store';

const isDevelopment = appConfig.mode === 'development';
const relyingPartyId = isDevelopment ? 'localhost' : appConfig.domain;

/** WebAuthn request options for a challenge, limited to the listed passkeys when there are any. */
const requestOptions = (challenge: string, credentialIds: string[] = []): PublicKeyCredentialRequestOptionsJSON => ({
  challenge,
  rpId: relyingPartyId,
  userVerification: 'required',
  allowCredentials: credentialIds.map((id) => ({ id, type: 'public-key', transports: ['internal'] })),
});

/** True when the browser can show passkey suggestions in its autofill UI (conditional mediation). */
export const isConditionalMediationAvailable = (): Promise<boolean> => browserSupportsWebAuthnAutofill();

/** Cancellable passkey autofill over discoverable passkeys: the passkey the user picks names the account. */
export const startConditionalMediation = async (onCredential: (data: ConditionalMediationResult) => void, signal: AbortSignal) => {
  const { challenge } = await getChallenge({ type: 'authentication' });

  // The ceremony is managed by @simplewebauthn's singleton abort service; forward external aborts
  signal.addEventListener('abort', () => WebAuthnAbortService.cancelCeremony(), { once: true });

  const assertion = await startAuthentication({
    optionsJSON: requestOptions(challenge),
    useBrowserAutofill: true,
    verifyBrowserAutofillInput: false,
  });

  onCredential({ assertion, type: 'authentication' });
};

export type ConditionalMediationResult = { assertion: AuthenticationResponseJSON; type: 'authentication' };

/** Runs WebAuthn registration and returns the attestation as base64url JSON for the backend. */
export const getPasskeyRegistrationCredential = async () => {
  const { challenge } = await getChallenge({ type: 'registration' });

  const userHandle = bufferToBase64URLString(crypto.getRandomValues(new Uint8Array(20)).buffer);

  const email = getCurrentUser().email;
  const generatedName = generatePasskeyName();
  const nameOnDevice = isDevelopment ? `${email} (${generatedName}) for ${appConfig.name}` : `${email} (${generatedName})`;

  const attestation = await startRegistration({
    optionsJSON: {
      challenge,
      user: { id: userHandle, name: nameOnDevice, displayName: nameOnDevice },
      rp: { id: relyingPartyId, name: appConfig.name },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      attestation: 'none',
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
    },
  });

  return { attestation, nameOnDevice };
};

/**
 * Returns the passkey verify credential (assertion plus the challenge type). Only an MFA challenge lists the account's
 * passkeys; otherwise the browser offers its discoverable ones.
 */
export const getPasskeyVerifyCredential = async ({ type }: { type: PasskeyVerifyType }) => {
  const { challenge, credentialIds } = await getChallenge({ type });

  const assertion = await startAuthentication({ optionsJSON: requestOptions(challenge, credentialIds) });

  return { assertion, type };
};

/** A passkey assertion for a step-up of the signed-in session: its challenge is bound to the account. */
export const getPasskeyStepUpCredential = async () => {
  const { challenge, credentialIds } = await getStepUpPasskeyChallenge();

  return startAuthentication({ optionsJSON: requestOptions(challenge, credentialIds) });
};

// Fetch a base64url challenge from BE; it doubles as the WebAuthn JSON options value
const getChallenge = (body: PasskeyChallengeBody) => generatePasskeyChallenge({ body });

const generatePasskeyName = () => {
  const nouns = [
    'Phoenix',
    'Dragon',
    'Griffin',
    'Unicorn',
    'Wizard',
    'Elf',
    'Sorcerer',
    'Knight',
    'Titan',
    'Valkyrie',
    'Fenix',
    'Samurai',
    'Ninja',
    'Guardian',
    'Sentinel',
  ];
  const adjectives = [
    'Mighty',
    'Brave',
    'Swift',
    'Golden',
    'Silent',
    'Fiery',
    'Lucky',
    'Clever',
    'Shadow',
    'Bright',
    'Fierce',
    'Noble',
    'Wise',
    'Bold',
    'Gallant',
    'Valiant',
    'Radiant',
    'Stellar',
    'Luminous',
    'Ethereal',
  ];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}${noun}`;
};
