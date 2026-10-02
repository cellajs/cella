import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import { verifyPasskeyAssertion } from '#/modules/auth/passkeys/operations/passkey-challenges';
import { issueCookieToken, readBoundToken, spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import { verifyTotp } from '#/modules/auth/totps/operations/verify-totp';
import type { UserModel } from '#/modules/user/user-db';
import { findUserById } from '#/modules/user/user-queries';

/** Starts an MFA challenge: issues a `confirm-mfa` token in its cookie and returns the `/auth/mfa` path, or null when MFA is off. */
export const initiateMfa = async (ctx: Context<Env>, user: UserModel) => {
  if (!user.mfaRequired) return null;

  await issueCookieToken(ctx, { type: 'confirm-mfa', userId: user.id, email: user.email, createdBy: user.id });

  return '/auth/mfa';
};

/** The user of the MFA challenge this browser holds, which stays open. Throws if missing, not found, or expired. */
export const validateConfirmMfaToken = async (ctx: Context<Env>): Promise<UserModel> => {
  const tokenRecord = await readBoundToken(ctx, 'confirm-mfa');

  if (!tokenRecord.userId) throw new AppError(400, 'invalid_request', 'error');

  const user = await findUserById({ var: { db: baseDb } }, { id: tokenRecord.userId });
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });

  return user;
};

/**
 * Ends the MFA challenge this browser holds once its second factor has verified: the challenge is spent, row and cookie.
 * Of two concurrent completions exactly one passes.
 * @throws AppError 401 `confirm-mfa_not_found` when the challenge was spent or expired meanwhile.
 */
const spendConfirmMfaToken = async (ctx: Context<Env>) => {
  const spent = await spendCookieToken(ctx, 'confirm-mfa');
  if (!spent) throw new AppError(401, 'confirm-mfa_not_found', 'warn');
  return spent;
};

/** A second factor offered for an MFA challenge: a code from the authenticator app, or a passkey response. */
export type MfaProof = { strategy: 'totp'; code: string } | { strategy: 'passkey'; assertion: AuthenticationResponseJSON };

/**
 * The only way out of an MFA challenge: reads the challenge this browser holds, verifies the offered factor for the
 * challenge's account, spends the challenge, and signs the account in with an mfa session. A factor that fails leaves
 * the challenge open for the next try.
 * @throws AppError 401 `confirm-mfa_not_found` or `confirm-mfa_expired` without a live challenge, and what the factor's
 *   verification throws (`verifyTotp`, `verifyPasskeyAssertion`).
 */
export const completeMfaChallenge = async (ctx: Context<Env>, proof: MfaProof) => {
  const user = await validateConfirmMfaToken(ctx);

  if (proof.strategy === 'totp') await verifyTotp(ctx, { user, code: proof.code });
  else await verifyPasskeyAssertion(ctx, { assertion: proof.assertion, purpose: 'mfa', userId: user.id });

  await spendConfirmMfaToken(ctx);
  await setUserSession(ctx, user, proof.strategy, 'mfa');
};
