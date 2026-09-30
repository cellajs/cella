import type { Context } from 'hono';
import type { Env } from '#/core/context';
import {
  blockSpentBucket,
  getRateLimiterInstance,
  rateLimitError,
  refundAttempt,
  reserveAttempt,
} from '#/middlewares/rate-limiter/helpers';
import type { BucketLimits, LimiterStore, Outcome, Tier } from '#/middlewares/rate-limiter/types';
import { log } from '#/utils/logger';

/** A zero block duration would block forever in the store; fall back to the counting window. */
const blockSecondsOf = ({ duration, blockDuration }: BucketLimits) => (blockDuration > 0 ? blockDuration : duration);

const slowLimits: BucketLimits = { points: 100, duration: 60 * 60 * 24, blockDuration: 60 * 60 * 3 };

/**
 * The 24-hour bucket behind a failure budget, catching slow brute force: 100 failures within a day block the key for
 * three hours, whatever the hourly series did in between; a success gives its attempt back.
 * @param keyPrefix - The budget's prefix; this bucket lives under `<keyPrefix>:slow`.
 */
export const slowTier = (keyPrefix: string): Tier => ({
  store: getRateLimiterInstance({ ...slowLimits, keyPrefix: `${keyPrefix}:slow`, inMemoryBlock: false }),
  limits: slowLimits,
  counts: 'fail',
  resetsOnSuccess: false,
});

/** One attempt reserved in its tiers: per tier that counted it, the store holding it and its count there. */
export interface Reservation {
  key: string;
  held: { tier: Tier; store: LimiterStore; count: number }[];
}

/**
 * Counts an attempt in every tier before the work it bounds runs, so a parallel burst takes each budget one attempt at
 * a time and at most its `points` attempts go through. A spent tier refuses without counting or blocking, and the tiers
 * that counted the attempt already give it back; a tier whose store fails leaves the attempt uncounted there. The
 * caller settles the attempt once its outcome is known (`settleTiers`).
 * @param ctx - The request, for the refusal's Retry-After header.
 * @param tiers - The buckets to count in, in order.
 * @param key - The subject's key, as the middleware derives it.
 * @throws AppError 429 `too_many_requests` while a tier is spent.
 */
export const reserveTiers = async (ctx: Context<Env>, tiers: Tier[], key: string): Promise<Reservation> => {
  const reservation: Reservation = { key, held: [] };
  for (const tier of tiers) {
    let taken: Awaited<ReturnType<typeof reserveAttempt>>;
    try {
      taken = await reserveAttempt(tier.store, key, tier.limits);
    } catch (err) {
      log.warn('Rate limit attempt not counted', { key, err });
      continue;
    }
    if (!taken.granted) {
      await settleTiers(reservation, 'other');
      return rateLimitError(ctx, taken.state);
    }
    reservation.held.push({ tier, store: taken.store, count: taken.state.consumedPoints });
  }
  return reservation;
};

/**
 * Settles a reserved attempt once its outcome is known. A tier keeps the attempt when the outcome is the one it counts,
 * and a kept failure while the tier's whole budget is taken blocks the key for the tier's block duration, in every
 * process; a success ends a series that resets on it; any other outcome gives the attempt back. So nothing but counted
 * failures ever blocks a key.
 * @returns The tiers this attempt locked out: a failure that took a tier's last attempt and blocked it, once per lockout.
 */
export const settleTiers = async ({ key, held }: Reservation, outcome: Outcome): Promise<Tier[]> => {
  const lockedOut: Tier[] = [];
  for (const { tier, store, count } of held) {
    try {
      if (outcome === tier.counts) {
        if (tier.counts !== 'fail') continue;
        const blocked = await blockSpentBucket(store, key, tier.limits.points, blockSecondsOf(tier.limits));
        if (blocked && count >= tier.limits.points) lockedOut.push(tier);
      } else if (outcome === 'success' && tier.resetsOnSuccess) {
        await store.delete(key);
      } else {
        await refundAttempt(store, key);
      }
    } catch (err) {
      log.warn('Rate limit attempt could not be settled', { key, err });
    }
  }
  return lockedOut;
};
