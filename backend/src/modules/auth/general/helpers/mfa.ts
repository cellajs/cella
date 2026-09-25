import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { type DbOrTx, baseDb as db } from '#/db/db';
import { findRemainingMfaMethods } from '#/modules/auth/auth-queries';
import { issueCookieToken, readBoundToken } from '#/modules/auth/tokens/token-lifecycle';
import { userSelect } from '#/modules/user/helpers/select';
import { type UserModel, usersTable } from '#/modules/user/user-db';

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

  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, tokenRecord.userId)).limit(1);
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });

  return user;
};

/**
 * MFA keeps both a passkey and an authenticator app, so a lost one can be replaced while the other still signs in.
 * Enabling needs both methods switched on and enrolled; while MFA is on, the last of either cannot be removed. The
 * interface enforces the same, this makes it hold for every caller.
 */
export const mfaFactorRules = {
  /** Refuses turning MFA on unless both methods are enabled for the app and enrolled by the user. */
  async assertCanEnable(tx: DbOrTx, userId: string) {
    const missing = (['passkey', 'totp'] as const).find((method) => !appConfig.enabledAuthStrategies.includes(method));
    if (missing) throw new AppError(400, 'forbidden_strategy', 'warn', { meta: { strategy: missing } });

    const { passkeys, totps } = await findRemainingMfaMethods({ var: { db: tx } }, { userId });
    if (!passkeys.length || !totps.length) throw new AppError(400, 'mfa_factors_required', 'warn');
  },

  /** Run after deleting a factor in the same transaction: refuses when MFA is on and a method is now gone. */
  async assertKeepsFactors(tx: DbOrTx, userId: string) {
    const [user] = await tx
      .select({ mfaRequired: usersTable.mfaRequired })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user?.mfaRequired) return;

    const { passkeys, totps } = await findRemainingMfaMethods({ var: { db: tx } }, { userId });
    if (!passkeys.length || !totps.length) throw new AppError(400, 'mfa_factor_in_use', 'warn');
  },
};
