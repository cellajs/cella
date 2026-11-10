import {
  type AuthenticationResponseJSON,
  browserSupportsWebAuthnAutofill,
  bufferToBase64URLString,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
} from '@simplewebauthn/browser';
import { generatePasskeyChallenge, generateStepUpPasskeyChallenge } from 'sdk';
import { appConfig } from 'shared';
import { passkeyAlgorithms } from 'shared/passkeys';
import type { PasskeyChallengeBody, PasskeyCredential, PasskeyVerifyKind } from '~/modules/auth/types';
import { getCurrentUser } from '~/modules/user/user-store';

// The host the app is served on, as the backend verifies it: a passkey never crosses hosts.
const relyingPartyId = () => new URL(appConfig.frontendUrl).hostname;

/** The passkeys a challenge names, as WebAuthn descriptors: a passkey without transports lets the browser try every one. */
const descriptors = (credentials: PasskeyCredential[] = []) =>
  credentials.map(({ id, transports }) => ({ id, type: 'public-key' as const, transports }));

/** WebAuthn request options for a challenge, limited to the listed passkeys when there are any. */
const requestOptions = (challenge: string, credentials?: PasskeyCredential[]): PublicKeyCredentialRequestOptionsJSON => ({
  challenge,
  rpId: relyingPartyId(),
  userVerification: 'required',
  allowCredentials: descriptors(credentials),
});

/** True when the browser can show passkey suggestions in its autofill UI (conditional mediation). */
export const isConditionalMediationAvailable = (): Promise<boolean> => browserSupportsWebAuthnAutofill();

/** Cancellable passkey autofill over discoverable passkeys: the passkey the user picks names the account. */
export const startConditionalMediation = async (onCredential: (data: ConditionalMediationResult) => void, signal: AbortSignal) => {
  const { challenge } = await getChallenge({ kind: 'authentication' });

  // The ceremony is managed by @simplewebauthn's singleton abort service; forward external aborts
  signal.addEventListener('abort', () => WebAuthnAbortService.cancelCeremony(), { once: true });

  const assertion = await startAuthentication({
    optionsJSON: requestOptions(challenge),
    useBrowserAutofill: true,
    verifyBrowserAutofillInput: false,
  });

  onCredential({ assertion, kind: 'authentication' });
};

export type ConditionalMediationResult = { assertion: AuthenticationResponseJSON; kind: 'authentication' };

/** Runs WebAuthn registration and returns the attestation as base64url JSON for the backend. */
export const getPasskeyRegistrationCredential = async () => {
  // The user's passkeys, so an authenticator that holds one already refuses to register a second.
  const { challenge, credentials } = await getChallenge({ kind: 'registration' });

  const userHandle = bufferToBase64URLString(crypto.getRandomValues(new Uint8Array(20)).buffer);

  const { email, name } = getCurrentUser();
  const generatedName = generatePasskeyName();
  const devSuffix = appConfig.mode === 'development' ? ` for ${appConfig.name}` : '';
  const nameOnDevice = `${email ?? name} (${generatedName})${devSuffix}`;

  const attestation = await startRegistration({
    optionsJSON: {
      challenge,
      user: { id: userHandle, name: nameOnDevice, displayName: nameOnDevice },
      rp: { id: relyingPartyId(), name: appConfig.name },
      pubKeyCredParams: passkeyAlgorithms.map((alg) => ({ type: 'public-key', alg })),
      excludeCredentials: descriptors(credentials),
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
    },
  });

  return { attestation, nameOnDevice };
};

/** Assertion plus challenge kind. Only an MFA challenge lists the account's passkeys; otherwise the browser offers its discoverable ones. */
export const getPasskeyVerifyCredential = async ({ kind }: { kind: PasskeyVerifyKind }) => {
  const { challenge, credentials } = await getChallenge({ kind });

  const assertion = await startAuthentication({ optionsJSON: requestOptions(challenge, credentials) });

  return { assertion, kind };
};

/** A passkey assertion for a step-up of the signed-in session: its challenge is bound to the account. */
export const getPasskeyStepUpCredential = async () => {
  const { challenge, credentials } = await generateStepUpPasskeyChallenge();

  return startAuthentication({ optionsJSON: requestOptions(challenge, credentials) });
};

/** A base64url challenge from the backend, which the WebAuthn options JSON takes as is. */
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
