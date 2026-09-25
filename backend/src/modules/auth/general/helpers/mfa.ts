import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { type DbOrTx, baseDb as db } from '#/db/db';
import { findRemainingMfaMethods } from '#/modules/auth/auth-queries';
import { getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { tokensTable } from '#/modules/auth/tokens-db';
import { userSelect } from '#/modules/user/helpers/select';
import { type UserModel, usersTable } from '#/modules/user/user-db';
import { getValidToken } from '#/utils/get-valid-token';
import { hashToken } from '#/utils/hash-token';
import { createDate, TimeSpan } from '#/utils/time-span';

/** Starts an MFA challenge: stores a hashed `confirm-mfa` token, sets its cookie, and returns the `/auth/mfa` path or null when MFA is off. */
export const initiateMfa = async (ctx: Context<Env>, user: UserModel) => {
  if (!user.mfaRequired) return null;

  const timespan = new TimeSpan(10, 'm');

  // Generate token and store hashed
  const newToken = nanoid(40);
  const hashedToken = hashToken(newToken);

  await db
    .insert(tokensTable)
    .values({
      secret: hashedToken,
      type: 'confirm-mfa',
      userId: user.id,
      email: user.email,
      createdBy: user.id,
      expiresAt: createDate(timespan), // token expires in 10 minutes
    })
    .returning({ secret: tokensTable.secret });

  await setAuthCookie(ctx, 'confirm-mfa', newToken, timespan);

  return '/auth/mfa';
};

/** Validates the `confirm-mfa` cookie token and returns its user. Throws if missing, not found, or expired. */
export const validateConfirmMfaToken = async (ctx: Context<Env>): Promise<UserModel> => {
  const tokenFromCookie = await getAuthCookie(ctx, 'confirm-mfa');
  if (!tokenFromCookie)
    throw new AppError(401, 'confirm-mfa_not_found', 'error', {
      willRedirect: appConfig.mode !== 'test',
      meta: { errorPagePath: '/auth/error' },
    });

  const tokenRecord = await getValidToken({
    ctx,
    token: tokenFromCookie,
    invokeToken: false,
    tokenType: 'confirm-mfa',
  });

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
