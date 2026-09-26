import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { slowOptions } from '#/middlewares/rate-limiter/core';
import {
  blockSpentBucket,
  getRateLimiterInstance,
  rateLimitError,
  refundAttempt,
  reserveAttempt,
} from '#/middlewares/rate-limiter/helpers';
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
  // A lockout lives in the database only, so every process holds it for the same time.
  store: getRateLimiterInstance({ ...limits, keyPrefix, inMemoryBlock: false }),
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

type TierStore = (typeof tiers)[number]['store'];

/** One TOTP attempt: per tier, the store holding it and its count there, or null where the tier did not count it. */
export interface TotpAttempt {
  key: string;
  held: ({ store: TierStore; count: number } | null)[];
}

/** Gives back the attempt in every tier that counted it. */
const giveBack = async ({ key, held }: TotpAttempt) => {
  for (const counted of held) {
    if (!counted) continue;
    try {
      await refundAttempt(counted.store, key);
    } catch (err) {
      log.warn('TOTP budget not settled', { key, err });
    }
  }
};

/**
 * Counts a TOTP attempt against the account's budget before its code is checked. Each tier takes it only while its
 * budget lasts, so a parallel burst checks at most the budget's codes; a spent tier counts nothing and refuses.
 * @throws AppError 429 `too_many_requests` while a tier is spent, even for the right code.
 */
export const takeTotpAttempt = async (ctx: Context<Env>, userId: string): Promise<TotpAttempt> => {
  const attempt: TotpAttempt = { key: `userId:${userId}`, held: [] };

  for (const { store, limits } of tiers) {
    let reservation: Awaited<ReturnType<typeof reserveAttempt>>;
    try {
      reservation = await reserveAttempt(store, attempt.key, limits);
    } catch (err) {
      // Neither the database nor process memory counted it: the check goes on uncounted in this tier.
      log.warn('TOTP budget unavailable', { key: attempt.key, err });
      attempt.held.push(null);
      continue;
    }
    if (!reservation.granted) {
      await giveBack(attempt);
      return rateLimitError(ctx, reservation.state, attempt.key);
    }
    attempt.held.push({ store: reservation.store, count: reservation.state.consumedPoints });
  }

  return attempt;
};

/**
 * Settles an attempt once its code is checked. A verified code gives the attempt back and ends the hourly series. A
 * failure keeps it, and a failure answered while a tier's whole budget is taken locks the account's TOTP checks for
 * that tier's block; the failure that took the last attempt mails the owner, once per lockout.
 */
export const settleTotpAttempt = async ({ key, held }: TotpAttempt, user: TotpUser, verified: boolean) => {
  for (const [index, { limits, endsOnSuccess }] of tiers.entries()) {
    const counted = held[index];
    if (!counted) continue;

    try {
      if (verified) {
        await (endsOnSuccess ? counted.store.delete(key) : refundAttempt(counted.store, key));
      } else if (
        (await blockSpentBucket(counted.store, key, limits.points, limits.blockDuration)) &&
        counted.count >= limits.points
      ) {
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
