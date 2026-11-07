import { getRandomValues } from 'node:crypto';
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import { passkeyAlgorithms } from 'shared/passkeys';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import type { PasskeyChallengePurpose } from '#/modules/auth/passkeys/passkey-challenges-db';
import {
  deletePasskeyChallenge,
  deleteStalePasskeyChallenges,
  findPasskeyByCredentialId,
  findPasskeyCredentialsByUser,
  insertPasskeyChallenge,
  updatePasskeyCounter,
} from '#/modules/auth/passkeys/passkeys-queries';
import {
  type PasskeyTransport,
  passkeyTransportSchema,
  type WebAuthnAssertion,
  type WebAuthnAttestation,
} from '#/modules/auth/passkeys/passkeys-schema';
import { hashToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { isoDateIn } from '#/utils/iso-date';
import { TimeSpan } from '#/utils/time-span';

// The host the app is served on: a passkey registered on one host never answers on another, staging's on production's included.
const relyingPartyId = new URL(appConfig.frontendUrl).hostname;
const expectedOrigin = appConfig.frontendUrl;

/** Challenges and passkeys are read and written on the base pool, whatever the route's context holds. */
const dbCtx = { var: { db: baseDb } };

/**
 * How long a challenge can be answered; its cookie and its row expire together. Ten minutes, the upper end of the
 * ceremony timeouts WebAuthn recommends (§13.4.3), so an autofill ceremony left open a while still answers in time.
 */
const challengeLifetime = new TimeSpan(10, 'm');

/** WebAuthn §7.1 step 25: a registration with a longer credential id fails. */
const maxCredentialIdBytes = 1023;

/** A response that does not verify is a failed sign-in: a 401 the sign-in limiter counts, never a server error. */
const verificationFailed = (error?: unknown) =>
  new AppError(401, 'passkey_verification_failed', 'warn', error instanceof Error ? { originalError: error } : {});

/** A registration response that does not verify is the request's fault: a 400, never a server error. */
const registrationFailed = (error?: unknown) =>
  new AppError(400, 'passkey_registration_failed', 'warn', error instanceof Error ? { originalError: error } : {});

interface IssuePasskeyChallengeOpts {
  purpose: PasskeyChallengePurpose;
  /**
   * The account whose passkey must answer the challenge, and whose passkeys it names: offered for an mfa or step-up
   * challenge, excluded for a registration.
   */
  userId?: string;
}

const isPasskeyTransport = (transport: string): transport is PasskeyTransport => passkeyTransportSchema.safeParse(transport).success;

/**
 * Hands this browser a new challenge for `purpose`: its row stores the hash, the challenge itself travels in a signed
 * cookie and in the response. The challenge the browser held before is dropped, and so are expired ones.
 * @returns The challenge response: the challenge, 32 random bytes as base64url (the value the WebAuthn options take as
 *   they are), and `userId`'s passkeys with the transports their registration reported, none without one.
 */
export const issuePasskeyChallenge = async (ctx: Context<Env>, { purpose, userId }: IssuePasskeyChallengeOpts) => {
  const previous = getAuthCookie(ctx, 'passkey-challenge');
  await deleteStalePasskeyChallenges(dbCtx, { previousHash: previous ? hashToken(previous) : undefined });

  const challenge = Buffer.from(getRandomValues(new Uint8Array(32))).toString('base64url');
  await insertPasskeyChallenge(dbCtx, {
    values: { challengeHash: hashToken(challenge), purpose, userId: userId ?? null, expiresAt: isoDateIn(challengeLifetime) },
  });
  setAuthCookie(ctx, 'passkey-challenge', challenge, challengeLifetime);

  const passkeys = userId ? await findPasskeyCredentialsByUser(dbCtx, { userId }) : [];
  const credentials = passkeys.map(({ credentialId, transports }) => {
    const known = transports?.filter(isPasskeyTransport) ?? [];
    return known.length ? { id: credentialId, transports: known } : { id: credentialId };
  });
  return { challenge, credentials };
};

/**
 * Takes the challenge this browser holds out of play before its response is checked: the cookie and the row go, so it
 * answers nothing a second time, whatever this check concludes.
 * @throws AppError 401 `passkey_verification_failed` for a challenge that was never issued, is answered or expired,
 *   was issued for another purpose, or for another account than `userId`.
 */
const consumeChallenge = async (ctx: Context<Env>, purpose: PasskeyChallengePurpose, userId?: string) => {
  const challenge = getAuthCookie(ctx, 'passkey-challenge');
  deleteAuthCookie(ctx, 'passkey-challenge');
  if (!challenge) throw verificationFailed();

  const issued = await deletePasskeyChallenge(dbCtx, { challengeHash: hashToken(challenge) });
  if (!issued || issued.purpose !== purpose || isExpiredDate(issued.expiresAt)) throw verificationFailed();
  if (issued.userId && issued.userId !== userId) throw verificationFailed();

  return challenge;
};

/**
 * Verifies a passkey (WebAuthn) registration response against the registration challenge this browser holds for
 * `userId`: attestation, relying party, origin, challenge, user verification, algorithm and credential id length.
 * @returns The credential to store: its id, COSE public key (base64url), signature counter and the transports the
 *   browser reported, null for none.
 * @throws AppError 401 `passkey_verification_failed` without a live registration challenge, 400
 *   `passkey_registration_failed` for a response that does not verify.
 */
export const verifyPasskeyRegistration = async (ctx: Context<Env>, attestation: WebAuthnAttestation, userId: string) => {
  const challenge = await consumeChallenge(ctx, 'registration', userId);

  const { verified, registrationInfo } = await verifyRegistrationResponse({
    // The request schema types `clientExtensionResults` as unknown, the library as extension outputs it never reads.
    response: attestation as RegistrationResponseJSON,
    expectedChallenge: challenge,
    expectedOrigin,
    expectedRPID: relyingPartyId,
    requireUserVerification: true,
    supportedAlgorithmIDs: [...passkeyAlgorithms],
  }).catch((error: unknown) => {
    throw registrationFailed(error);
  });

  if (!verified || !registrationInfo) throw registrationFailed();

  const { credential } = registrationInfo;
  if (Buffer.from(credential.id, 'base64url').byteLength > maxCredentialIdBytes) throw registrationFailed();

  return {
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports?.length ? credential.transports : null,
  };
};

interface VerifyPasskeyAssertionOpts {
  assertion: WebAuthnAssertion;
  purpose: Exclude<PasskeyChallengePurpose, 'registration'>;
  /** The account the passkey must belong to. Omitted for a sign-in, where the passkey names its account. */
  userId?: string;
}

/**
 * Verifies a passkey (WebAuthn) authentication response against the challenge of `purpose` this browser holds, which is
 * spent first: signature, relying party, origin, user verification and signature counter, which only moves forward.
 * @returns The id of the account the passkey belongs to.
 * @throws AppError 401 `passkey_verification_failed`, or 404 `passkey_not_found` for a credential that is not
 *   registered (to the account `userId` names).
 */
export const verifyPasskeyAssertion = async (ctx: Context<Env>, { assertion, purpose, userId }: VerifyPasskeyAssertionOpts): Promise<string> => {
  const challenge = await consumeChallenge(ctx, purpose, userId);

  const passkey = await findPasskeyByCredentialId(dbCtx, { credentialId: assertion.id, userId });
  if (!passkey) throw new AppError(404, 'passkey_not_found', 'warn');

  // The library throws for most mismatches (challenge, origin, relying party, flags, counter) and answers false for a
  // bad signature.
  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    // The same gap as the registration's: `clientExtensionResults`.
    response: assertion as AuthenticationResponseJSON,
    expectedChallenge: challenge,
    expectedOrigin,
    expectedRPID: relyingPartyId,
    credential: { id: passkey.credentialId, publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')), counter: passkey.counter },
    requireUserVerification: true,
  }).catch((error: unknown) => {
    throw verificationFailed(error);
  });
  if (!verified) throw verificationFailed();

  if (!(await updatePasskeyCounter(dbCtx, { id: passkey.id, counter: authenticationInfo.newCounter }))) throw verificationFailed();

  return passkey.userId;
};
