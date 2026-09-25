import { getRandomValues } from 'node:crypto';
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { and, eq, lt, or } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { type PasskeyChallengePurpose, passkeyChallengesTable } from '#/modules/auth/passkeys/passkey-challenges-db';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { hashToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { getIsoDate } from '#/utils/iso-date';
import { createDate, TimeSpan } from '#/utils/time-span';

const relyingPartyId = appConfig.mode === 'development' ? 'localhost' : appConfig.domain;
const expectedOrigin = appConfig.frontendUrl;

/** How long a challenge can be answered; its cookie and its row expire together. */
const challengeLifetime = new TimeSpan(5, 'm');

/** A response that does not verify is a failed sign-in: a 401 the sign-in limiter counts, never a server error. */
const verificationFailed = (error?: unknown) =>
  new AppError(401, 'passkey_verification_failed', 'warn', error instanceof Error ? { originalError: error } : {});

interface IssuePasskeyChallengeOpts {
  purpose: PasskeyChallengePurpose;
  /** For an mfa challenge: the account whose passkey must answer it. */
  userId?: string;
}

/**
 * Hands this browser a new challenge for `purpose`: its row stores the hash, the challenge itself travels in a signed
 * cookie and in the response. The challenge the browser held before is dropped, and so are expired ones.
 * @returns The challenge, 32 random bytes as base64url: the value the WebAuthn options take as they are.
 */
export const issuePasskeyChallenge = async (ctx: Context<Env>, { purpose, userId }: IssuePasskeyChallengeOpts) => {
  const expired = lt(passkeyChallengesTable.expiresAt, getIsoDate());
  const previous = await getAuthCookie(ctx, 'passkey-challenge');
  await db
    .delete(passkeyChallengesTable)
    .where(previous ? or(eq(passkeyChallengesTable.challengeHash, hashToken(previous)), expired) : expired);

  const challenge = Buffer.from(getRandomValues(new Uint8Array(32))).toString('base64url');
  await db.insert(passkeyChallengesTable).values({
    challengeHash: hashToken(challenge),
    purpose,
    userId: userId ?? null,
    expiresAt: createDate(challengeLifetime),
  });
  await setAuthCookie(ctx, 'passkey-challenge', challenge, challengeLifetime);

  return challenge;
};

/**
 * Takes the challenge this browser holds out of play before its response is checked: the cookie and the row go, so it
 * answers nothing a second time, whatever this check concludes.
 * @returns The challenge, to verify the response against.
 * @throws AppError 401 `passkey_verification_failed` for a challenge that was never issued, is answered or expired,
 *   was issued for another purpose, or for another account than `userId`.
 */
const consumeChallenge = async (ctx: Context<Env>, purpose: PasskeyChallengePurpose, userId?: string) => {
  const challenge = await getAuthCookie(ctx, 'passkey-challenge');
  deleteAuthCookie(ctx, 'passkey-challenge');
  if (!challenge) throw verificationFailed();

  const [issued] = await db
    .delete(passkeyChallengesTable)
    .where(eq(passkeyChallengesTable.challengeHash, hashToken(challenge)))
    .returning({
      purpose: passkeyChallengesTable.purpose,
      userId: passkeyChallengesTable.userId,
      expiresAt: passkeyChallengesTable.expiresAt,
    });
  if (!issued || issued.purpose !== purpose || isExpiredDate(issued.expiresAt)) throw verificationFailed();
  if (issued.userId && issued.userId !== userId) throw verificationFailed();

  return challenge;
};

/**
 * Verifies a passkey (WebAuthn) registration response against the registration challenge this browser holds:
 * attestation, relying party, origin, challenge and user verification.
 * @returns The credential to store: its id, COSE public key (base64url) and signature counter.
 * @throws AppError 401 `passkey_verification_failed` without a live registration challenge, 400
 *   `passkey_registration_failed` for a response that does not verify.
 */
export const verifyPasskeyRegistration = async (ctx: Context<Env>, attestation: RegistrationResponseJSON) => {
  const challenge = await consumeChallenge(ctx, 'registration');

  const registrationFailed = (error?: unknown) =>
    new AppError(400, 'passkey_registration_failed', 'warn', error instanceof Error ? { originalError: error } : {});

  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response: attestation,
    expectedChallenge: challenge,
    expectedOrigin,
    expectedRPID: relyingPartyId,
    requireUserVerification: true,
  }).catch((error: unknown) => {
    throw registrationFailed(error);
  });

  if (!verified || !registrationInfo) throw registrationFailed();

  const { credential } = registrationInfo;
  return {
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
  };
};

interface VerifyPasskeyAssertionOpts {
  assertion: AuthenticationResponseJSON;
  purpose: Exclude<PasskeyChallengePurpose, 'registration'>;
  /** The account the passkey must belong to. Omitted for a sign-in, where the passkey names its account. */
  userId?: string;
}

/**
 * Verifies a passkey (WebAuthn) authentication response against the challenge of `purpose` this browser holds, which is
 * spent first: signature, relying party, origin, user verification and signature counter. The new counter is stored
 * only while the stored one is still lower (or both are 0, for an authenticator without a counter), so of two copies
 * of one authenticator answering at once, one fails.
 * @returns The id of the account the passkey belongs to.
 * @throws AppError 401 `passkey_verification_failed`, or 404 `passkey_not_found` for a credential that is not
 *   registered (to the account `userId` names).
 */
export const verifyPasskeyAssertion = async (
  ctx: Context<Env>,
  { assertion, purpose, userId }: VerifyPasskeyAssertionOpts,
): Promise<string> => {
  const challenge = await consumeChallenge(ctx, purpose, userId);

  const [passkey] = await db
    .select()
    .from(passkeysTable)
    .where(and(eq(passkeysTable.credentialId, assertion.id), userId ? eq(passkeysTable.userId, userId) : undefined))
    .limit(1);
  if (!passkey) throw new AppError(404, 'passkey_not_found', 'warn');

  // The library throws for most mismatches (challenge, origin, relying party, flags, counter) and answers false for a
  // bad signature.
  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response: assertion,
    expectedChallenge: challenge,
    expectedOrigin,
    expectedRPID: relyingPartyId,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
      counter: passkey.counter,
    },
    requireUserVerification: true,
  }).catch((error: unknown) => {
    throw verificationFailed(error);
  });
  if (!verified) throw verificationFailed();

  const { newCounter } = authenticationInfo;
  const [stored] = await db
    .update(passkeysTable)
    .set({ counter: newCounter })
    .where(
      and(
        eq(passkeysTable.id, passkey.id),
        newCounter > 0 ? lt(passkeysTable.counter, newCounter) : eq(passkeysTable.counter, 0),
      ),
    )
    .returning({ id: passkeysTable.id });
  if (!stored) throw verificationFailed();

  return passkey.userId;
};
