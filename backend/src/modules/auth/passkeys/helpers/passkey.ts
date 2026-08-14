import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { deleteAuthCookie, getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';

// Use "localhost" (and the localhost origin) for development
const relyingPartyId = appConfig.mode === 'development' ? 'localhost' : appConfig.domain;
const expectedOrigin = appConfig.frontendUrl;

/**
 * Verifies a passkey (WebAuthn) registration response: attestation, relying-party ID, origin,
 * challenge, and user presence/verification. Returns the credential ID, public key, and signature
 * counter to store (base64url / COSE key as base64url).
 */
export const verifyPasskeyRegistration = async (attestation: RegistrationResponseJSON, challengeFromCookie: string) => {
  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response: attestation,
    expectedChallenge: challengeFromCookie,
    expectedOrigin,
    expectedRPID: relyingPartyId,
    requireUserVerification: true,
  });

  if (!verified || !registrationInfo) throw new Error('Passkey attestation verification failed');

  const { credential } = registrationInfo;
  return {
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
  };
};

type PasskeyData = { assertion: AuthenticationResponseJSON; userId: string };

/**
 * Validates a passkey assertion for `userId`: consumes the challenge cookie, loads the stored
 * credential, verifies the signature, and persists the new signature counter.
 */
export const validatePasskey = async (ctx: Context, { assertion, userId }: PasskeyData) => {
  // Retrieve the passkey challenge stored in a secure cookie
  const challengeFromCookie = await getAuthCookie(ctx, 'passkey-challenge');
  deleteAuthCookie(ctx, 'passkey-challenge');
  if (!challengeFromCookie) throw new AppError(401, 'invalid_credentials', 'warn');

  // Fetch passkey row for this user and credential ID
  const [passkeyRecord] = await db
    .select()
    .from(passkeysTable)
    .where(and(eq(passkeysTable.userId, userId), eq(passkeysTable.credentialId, assertion.id)))
    .limit(1);

  if (!passkeyRecord) throw new AppError(404, 'passkey_not_found', 'warn');

  // Verify assertion signature against stored public key, challenge, origin, and relying-party ID
  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response: assertion,
    expectedChallenge: challengeFromCookie,
    expectedOrigin,
    expectedRPID: relyingPartyId,
    credential: {
      id: passkeyRecord.credentialId,
      publicKey: new Uint8Array(Buffer.from(passkeyRecord.publicKey, 'base64url')),
      counter: passkeyRecord.counter,
    },
    requireUserVerification: true,
  });

  if (!verified) throw new AppError(401, 'invalid_token', 'warn');

  // Persist the signature counter so cloned-authenticator replays can be detected
  await db
    .update(passkeysTable)
    .set({ counter: authenticationInfo.newCounter })
    .where(and(eq(passkeysTable.userId, userId), eq(passkeysTable.credentialId, assertion.id)));
};
