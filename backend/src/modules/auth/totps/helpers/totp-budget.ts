import type { Context } from 'hono';
import { RateLimiterRes } from 'rate-limiter-flexible';
import type { Env } from '#/core/context';
import { slowOptions } from '#/middlewares/rate-limiter/core';
import { getRateLimiterInstance, rateLimitError } from '#/middlewares/rate-limiter/helpers';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import type { UserModel } from '#/modules/user/user-db';
import { log } from '#/utils/logger';

/** The account whose codes are checked; a lockout mails it. */
export type TotpUser = Pick<UserModel, 'id' | 'email' | 'name' | 'language'>;

interface TierLimits {
  points: number;
  duration: number;
  blockDuration: number;
}

const tier = (keyPrefix: string, limits: TierLimits, endsOnSuccess: boolean) => ({
  limits,
  endsOnSuccess,
  store: getRateLimiterInstance({ ...limits, keyPrefix }),
});

/**
 * The failures one account may make at TOTP checks, whatever IP or route they come from: 5 within an hour lock its TOTP
 * checks for 30 minutes, 100 within a day for 3 hours. A verified code ends the hourly series; the daily count keeps
 * its failures.
 */
const tiers = [
  tier('totpAccount', { points: 5, duration: 60 * 60, blockDuration: 60 * 30 }, true),
  tier('totpAccount:slow', slowOptions, false),
];

/** One TOTP attempt: its count in each tier of the account's budget, or null where the store was unavailable. */
export interface TotpAttempt {
  key: string;
  counts: (number | null)[];
}

/**
 * Counts a TOTP attempt against the account's budget before its code is checked, so parallel guesses cannot all pass
 * a budget that is already spent.
 * @throws AppError 429 `too_many_requests` while a tier is spent, even for the right code.
 */
export const takeTotpAttempt = async (ctx: Context<Env>, userId: string): Promise<TotpAttempt> => {
  const key = `userId:${userId}`;
  const counts: (number | null)[] = [];

  for (const { store } of tiers) {
    try {
      counts.push((await store.consume(key)).consumedPoints);
    } catch (err) {
      // The store refuses a spent tier, also while it holds the key blocked in memory.
      if (err instanceof RateLimiterRes) return rateLimitError(ctx, err, key);
      // Unreachable store: the check goes on uncounted, as the route limiters do.
      log.warn('TOTP budget unavailable', { key, err });
      counts.push(null);
    }
  }

  return { key, counts };
};

/**
 * Settles an attempt once its code is checked. A verified code gives the attempt back and ends the hourly series. The
 * failure that spends a tier locks the account's TOTP checks for that tier's block and mails the owner.
 */
export const settleTotpAttempt = async ({ key, counts }: TotpAttempt, user: TotpUser, verified: boolean) => {
  for (const [index, { store, limits, endsOnSuccess }] of tiers.entries()) {
    const count = counts[index];
    if (count === null || count === undefined) continue;

    try {
      if (verified) {
        await (endsOnSuccess ? store.delete(key) : store.reward(key));
      } else if (count >= limits.points) {
        await store.block(key, limits.blockDuration);
        sendAccountSecurityEmail(user, 'totp-lockout', {
          attempts: limits.points,
          duration: Math.round(limits.blockDuration / 60),
        });
      }
    } catch (err) {
      log.warn('TOTP budget not settled', { key, err });
    }
  }
};
