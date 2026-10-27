import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { verifyPasskeyAssertion } from '#/modules/auth/passkeys/operations/passkey-challenges';
import { setUserSession } from '#/modules/auth/sessions/operations/create-session';
import type { AuthStrategy } from '#/modules/auth/sessions/sessions-db';
import { issueCookieToken, readBoundToken, spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import type { TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import { verifyTotp } from '#/modules/auth/totps/operations/verify-totp';
import type { UserModel } from '#/modules/user/user-db';
import { findUserById } from '#/modules/user/user-queries';

/**
 * Starts an MFA challenge: issues a `confirm-mfa` token in its cookie and returns the `/auth/mfa` path, or null when MFA
 * is off. The token carries the method the sign-in started with (`strategy`), so the session the challenge ends in
 * records it.
 */
export const initiateMfa = async (ctx: Context<Env>, user: UserModel, strategy: AuthStrategy, connectionId: string | null = null) => {
  if (!user.mfaRequired) return null;

  await issueCookieToken(ctx, { type: 'confirm-mfa', userId: user.id, email: user.email, createdBy: user.id, authStrategy: strategy, connectionId });

  return '/auth/mfa';
};

/**
 * The MFA challenge this browser holds, which stays open, its user and the method its sign-in started with.
 * @throws AppError 401 `confirm-mfa_not_found` or `confirm-mfa_expired` without a live challenge, 400 `invalid_request`
 *   for one no sign-in issued, 404 `not_found` when its user is gone.
 */
export const validateConfirmMfaToken = async (ctx: Context<Env>): Promise<{ user: UserModel; token: TokenRecord; authStrategy: AuthStrategy }> => {
  const token = await readBoundToken(ctx, 'confirm-mfa');

  // `initiateMfa` records both: a challenge without them comes from no sign-in.
  const { userId, authStrategy } = token;
  if (!userId || !authStrategy) throw new AppError(400, 'invalid_request', 'error');

  const user = await findUserById({ var: { db: baseDb } }, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });

  return { user, token, authStrategy };
};

/** A second factor offered for an MFA challenge: a code from the authenticator app, or a passkey response. */
export type MfaProof = { strategy: 'totp'; code: string } | { strategy: 'passkey'; assertion: AuthenticationResponseJSON };

/**
 * The only way out of an MFA challenge: reads the challenge this browser holds, verifies the offered factor for the
 * challenge's account, spends the challenge, and signs the account in with an mfa session. That session records the
 * method the sign-in started with and the factor as its step-up. A factor that fails leaves the challenge open for the
 * next try.
 * @throws AppError 401 `confirm-mfa_not_found` or `confirm-mfa_expired` without a live challenge, and what the factor's
 *   verification throws (`verifyTotp`, `verifyPasskeyAssertion`).
 */
export const completeMfaChallenge = async (ctx: Context<Env>, proof: MfaProof) => {
  const { user, token, authStrategy } = await validateConfirmMfaToken(ctx);

  if (proof.strategy === 'totp') await verifyTotp(ctx, { user, code: proof.code });
  else await verifyPasskeyAssertion(ctx, { assertion: proof.assertion, purpose: 'mfa', userId: user.id });

  // Spent, row and cookie, once the factor verified: of two concurrent completions exactly one passes.
  if (!(await spendCookieToken(ctx, 'confirm-mfa'))) throw new AppError(401, 'confirm-mfa_not_found', 'warn');
  await setUserSession(ctx, user, authStrategy, 'mfa', { steppedUpVia: proof.strategy, connectionId: token.connectionId });
};
