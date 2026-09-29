import { decodeBase32 } from '@oslojs/encoding';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { settleTotpAttempt, type TotpUser, takeTotpAttempt } from '#/modules/auth/totps/helpers/totp-budget';
import { matchTOTPStep } from '#/modules/auth/totps/helpers/totp-core';
import { decryptTotpSecret } from '#/modules/auth/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/totps/totps-db';

const { intervalInSeconds, digits, gracePeriodInSeconds } = appConfig.totp;

/** The account's stored Base32 secret. */
const findStoredSecret = async (userId: string) => {
  const [totp] = await db
    .select({ secret: totpsTable.secret })
    .from(totpsTable)
    .where(eq(totpsTable.userId, userId))
    .limit(1);
  if (!totp) throw new AppError(404, 'not_found', 'warn');

  return decryptTotpSecret(totp.secret);
};

/**
 * Moves the account's last used step forward to `step`: false when that step or a later one was used already. Of two
 * checks of one code, exactly one moves it.
 */
const spendStep = async (userId: string, step: number) => {
  const [spent] = await db
    .update(totpsTable)
    .set({ lastUsedStep: step })
    .where(and(eq(totpsTable.userId, userId), or(isNull(totpsTable.lastUsedStep), lt(totpsTable.lastUsedStep, step))))
    .returning({ id: totpsTable.id });
  return !!spent;
};

interface VerifyTotpOpts {
  user: TotpUser;
  code: string;
  /** The Base32 secret TOTP setup is confirming, not stored yet. Without it, the account's stored secret is used. */
  pendingSecret?: string;
}

/**
 * The one TOTP check: the second factor of an MFA challenge, the proof on the MFA toggle and the confirmation of TOTP
 * setup all come here. A code verifies within ±`gracePeriodInSeconds` of now, and only for a time step later than the
 * last one used, which it then spends: each code counts once. Every check draws on the account's failure budget.
 * @returns The time step the code belongs to; TOTP setup stores it with the secret.
 * @throws AppError 404 `not_found` without a stored secret, 429 `too_many_requests` while the account's budget is
 *   spent, 401 `invalid_token` for a wrong code and 401 `totp_code_used` for a code whose step was used.
 */
export const verifyTotp = async (ctx: Context<Env>, { user, code, pendingSecret }: VerifyTotpOpts) => {
  const secret = pendingSecret ?? (await findStoredSecret(user.id));

  const attempt = await takeTotpAttempt(ctx, user.id);
  const step = matchTOTPStep(decodeBase32(secret), intervalInSeconds, digits, code, gracePeriodInSeconds);
  const spent = step !== null && (pendingSecret !== undefined || (await spendStep(user.id, step)));
  await settleTotpAttempt(attempt, user, spent);

  if (step === null) throw new AppError(401, 'invalid_token', 'warn');
  if (!spent) throw new AppError(401, 'totp_code_used', 'warn');
  return step;
};
