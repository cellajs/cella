import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { getRateLimiterInstance } from '#/middlewares/rate-limiter/helpers';
import { type Reservation, reserveTiers, settleTiers, slowTier } from '#/middlewares/rate-limiter/tiers';
import type { BucketLimits, Tier } from '#/middlewares/rate-limiter/types';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import type { UserModel } from '#/modules/user/user-db';

/** The account whose codes are checked; a lockout mails it. */
export type TotpUser = Pick<UserModel, 'id' | 'email' | 'name' | 'language'>;

const hourly: BucketLimits = { points: 5, duration: 60 * 60, blockDuration: 60 * 30 };

/**
 * The failures one account may make at TOTP checks, whatever IP or route they come from: 5 within an hour lock its TOTP
 * checks for 30 minutes, 100 within a day for 3 hours. A verified code ends the hourly series; the daily count keeps
 * its failures.
 */
const tiers: Tier[] = [
  {
    store: getRateLimiterInstance({ ...hourly, keyPrefix: 'totpAccount', inMemoryBlock: false }),
    limits: hourly,
    counts: 'fail',
    resetsOnSuccess: true,
  },
  slowTier('totpAccount'),
];

/**
 * Counts a TOTP attempt against the account's budget before its code is checked, so a parallel burst checks at most
 * the budget's codes.
 * @throws AppError 429 `too_many_requests` while a tier is spent, even for the right code.
 */
export const takeTotpAttempt = (ctx: Context<Env>, userId: string) => reserveTiers(ctx, tiers, `userId:${userId}`);

/**
 * Settles an attempt once its code is checked. A failure that spent a tier locks the account's TOTP checks for that
 * tier's block and mails the owner, once per lockout.
 */
export const settleTotpAttempt = async (attempt: Reservation, user: TotpUser, verified: boolean) => {
  for (const { limits } of await settleTiers(attempt, verified ? 'success' : 'fail')) {
    sendAccountSecurityEmail(user, 'totp-lockout', { attempts: limits.points, duration: Math.round(limits.blockDuration / 60) });
  }
};
