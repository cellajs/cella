import { and, eq, gt, gte, lte, or, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { RateLimiterDrizzle, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import type { Env } from '#/core/context';
import { AppError, type ErrorKey } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { env } from '#/env';
import type { Identifiers, LimiterStore, RateLimiterHandler, RateLimitIdentifier } from '#/middlewares/rate-limiter/types';
import { rateLimitsTable } from '#/modules/auth/rate-limits-db';
import { getIp } from '#/utils/get-ip';
import { hashRateLimitSubject } from '#/utils/hash-pii';
import { toRateLimitIp } from '#/utils/ip-subnet';
import { ambientRequest, log } from '#/utils/logger';

type RateLimiterOptions = {
  keyPrefix?: string;
  points: number;
  duration: number;
  blockDuration?: number;
};

/** Limiter instances by key prefix, so limiters that share a prefix share one store and its in-memory state. */
const limiterRegistry = new Map<string, LimiterStore>();

/** Each database store's in-memory insurance, for the statements this module runs on the store's table itself. */
const insurances = new WeakMap<RateLimiterDrizzle, RateLimiterMemory>();

/** The database store for a key prefix, created once; an in-memory insurance limiter covers database outages. */
export const getRateLimiterInstance = (options: RateLimiterOptions): LimiterStore => {
  const keyPrefix = options.keyPrefix ?? '';
  const existing = limiterRegistry.get(keyPrefix);
  if (existing) return existing;

  let instance: LimiterStore;

  if (env.NODB) {
    instance = new RateLimiterMemory(options);
  } else {
    // Fail-open: an unreachable DB falls back to the in-memory limiter so the request survives without a 500.
    // The retention sweep deletes aged rows (`sweepRules`), so the store's own timer per instance stays off.
    const insurance = new RateLimiterMemory(options);
    instance = new RateLimiterDrizzle({
      ...options,
      storeClient: db,
      schema: rateLimitsTable,
      insuranceLimiter: insurance,
      clearExpiredByTimeout: false,
    });
    insurances.set(instance, insurance);
  }

  limiterRegistry.set(keyPrefix, instance);
  return instance;
};

/** The in-memory store a database store falls back to while the database is unreachable; none for a memory store. */
const insuranceOf = (store: LimiterStore) => (store instanceof RateLimiterDrizzle ? insurances.get(store) : undefined);

const msUntil = (expire: Date | null) => (expire ? Math.max(expire.getTime() - Date.now(), 0) : -1);

/**
 * Adds `cost` to a bucket's row in one statement: a new or expired row starts at `cost` with a window of `duration`
 * seconds, a live one gains it, and with `within` only while it stays within that many points.
 * @returns The row with the cost, or none when `within` refused it.
 */
const addToRow = (key: string, cost: number, duration: number, within?: number) => {
  const now = new Date();
  const expired = lte(rateLimitsTable.expire, now);
  return db
    .insert(rateLimitsTable)
    .values({ key, points: cost, expire: new Date(now.getTime() + duration * 1000) })
    .onConflictDoUpdate({
      target: rateLimitsTable.key,
      set: {
        points: sql`case when ${expired} then ${cost} else ${rateLimitsTable.points} + ${cost} end`,
        expire: sql`case when ${expired} then excluded.expire else ${rateLimitsTable.expire} end`,
      },
      setWhere: within === undefined ? undefined : or(expired, lte(rateLimitsTable.points, within - cost)),
    })
    .returning({ points: rateLimitsTable.points, expire: rateLimitsTable.expire });
};

/**
 * Takes `cost` points from a bucket while its budget lasts, in one statement: a new or expired bucket starts at `cost`,
 * a live one gains it while it stays within `points`. A spent bucket stays as it is, so a refused request neither counts
 * nor blocks. `debt` is points already spent that the bucket has not counted: the attempt fits only on top of it, and a
 * refusal adds it in a second statement.
 * @returns The bucket with this attempt, or null when its budget cannot hold it.
 */
const takeAttempt = async (
  store: LimiterStore,
  rateLimitKey: string,
  { points, duration }: { points: number; duration: number },
  cost: number,
  debt: number,
): Promise<RateLimiterRes | null> => {
  if (cost > points && !debt) return null;
  if (store instanceof RateLimiterDrizzle) {
    const key = store.getKey(rateLimitKey);
    const [bucket] = cost + debt <= points ? await addToRow(key, cost + debt, duration, points) : [];
    if (bucket) return new RateLimiterRes(Math.max(points - bucket.points, 0), msUntil(bucket.expire), bucket.points);
    if (debt) await addToRow(key, debt, duration);
    return null;
  }
  // In memory the count this attempt reads back is its own, so a parallel burst takes the budget one by one here too.
  const taken = await store.penalty(rateLimitKey, cost + debt, { customDuration: duration });
  if (taken.consumedPoints <= points) return taken;
  await store.reward(rateLimitKey, cost);
  return null;
};

/**
 * Counts an attempt before the work it bounds runs, so a parallel burst takes the budget one point at a time and at
 * most `points` attempts go through. A spent budget refuses without counting the attempt or blocking.
 * @param cost - Points the attempt takes at once: a batch of mails counts each one.
 * @param debt - Points the in-process fast path let through since its last count here: counted, refused or not.
 * @returns The store holding the attempt (process memory while the database is unreachable) and the bucket with it,
 *   or the spent bucket that refused it.
 */
export const reserveAttempt = async (
  store: LimiterStore,
  rateLimitKey: string,
  limits: { points: number; duration: number },
  cost = 1,
  debt = 0,
): Promise<{ granted: true; store: LimiterStore; state: RateLimiterRes } | { granted: false; state: RateLimiterRes }> => {
  let holder = store;
  let taken: RateLimiterRes | null;
  try {
    taken = await takeAttempt(holder, rateLimitKey, limits, cost, debt);
  } catch (err) {
    const insurance = insuranceOf(store);
    if (!insurance) throw err;
    log.warn('Rate limit attempt counted in process memory', { rateLimitKey, err });
    holder = insurance;
    taken = await takeAttempt(holder, rateLimitKey, limits, cost, debt);
  }
  if (taken) return { granted: true, store: holder, state: taken };
  // Read for Retry-After; a bucket reset, expired or given back since the refusal lets the client retry at once.
  const state = await holder.get(rateLimitKey);
  const spent = state !== null && state.consumedPoints + cost > limits.points;
  return { granted: false, state: spent ? state : new RateLimiterRes(0, 1000, limits.points) };
};

/**
 * Gives back an attempt counted before the handler ran whose outcome the bucket does not count. A bucket that expired
 * or was reset since holds no attempt to give back.
 * @param cost - The points the attempt took.
 */
export const refundAttempt = async (store: LimiterStore, rateLimitKey: string, cost = 1) => {
  if (store instanceof RateLimiterDrizzle) {
    await db
      .update(rateLimitsTable)
      .set({ points: sql`${rateLimitsTable.points} - ${cost}` })
      .where(and(eq(rateLimitsTable.key, store.getKey(rateLimitKey)), gte(rateLimitsTable.points, cost), gt(rateLimitsTable.expire, new Date())));
    return;
  }
  // In memory a bucket reset or expired since reads back below zero: the points go back where they came from.
  const refunded = await store.reward(rateLimitKey, cost);
  if (refunded.consumedPoints < 0) await store.penalty(rateLimitKey, cost);
};

/**
 * Blocks a bucket whose whole budget is taken, for `blockSeconds` from now: what a failure answered at that point does.
 * The block keeps the bucket's points, so attempts still in flight that the bucket does not count give theirs back and
 * reopen it.
 * @returns Whether the bucket was spent and is blocked now.
 */
export const blockSpentBucket = async (store: LimiterStore, rateLimitKey: string, points: number, blockSeconds: number): Promise<boolean> => {
  const now = new Date();
  if (store instanceof RateLimiterDrizzle) {
    const blocked = await db
      .update(rateLimitsTable)
      .set({ expire: new Date(now.getTime() + blockSeconds * 1000) })
      .where(and(eq(rateLimitsTable.key, store.getKey(rateLimitKey)), gte(rateLimitsTable.points, points), gt(rateLimitsTable.expire, now)))
      .returning({ key: rateLimitsTable.key });
    return blocked.length > 0;
  }
  const state = await store.get(rateLimitKey);
  if (!state || state.consumedPoints < points) return false;
  await store.set(rateLimitKey, state.consumedPoints, blockSeconds);
  return true;
};

/**
 * The refusal carries the wait alone: the key names a subject, which no client needs and no log line repeats.
 * @param type - The limiter's own refusal type, when a client says more than "too many requests" for it.
 */
export const refuseRateLimited = (limitState: RateLimiterRes, type: ErrorKey = 'too_many_requests') => {
  const retryAfter = getRetryAfter(limitState.msBeforeNext);
  throw new AppError(429, type, 'warn', { meta: { retryAfter } });
};

/** Seconds to wait, floored to 1 so a sub-second wait never sends `Retry-After: 0`, which clients read as "retry immediately". */
export const getRetryAfter = (ms: number) => Math.max(1, Math.round(ms / 1000));

/**
 * One identifier's segment of a rate-limit key. An id enters as it is; an IP (IPv6 by its /64) or an address enters
 * as its keyed pseudonym, so `rate_limits` holds neither in the clear.
 */
export const subjectSegment = (identifier: RateLimitIdentifier, value: string): string => {
  if (identifier === 'ip') return `ip:${hashRateLimitSubject('ip', toRateLimitIp(value))}`;
  if (identifier === 'email') return `email:${hashRateLimitSubject('email', value)}`;
  return `${identifier}:${value}`;
};

/** How each identifier reads its value from the request; the map covers every identifier. */
const identifierReaders = {
  // Normalize the email exactly like validation so aliases share a bucket; this runs before Zod, so guard the type
  email: async (ctx) => {
    if (!ctx.req.header('content-type')?.includes('application/json')) return null;
    try {
      const body = (await ctx.req.json()) as { email?: unknown };
      if (typeof body.email === 'string' && body.email) return body.email.toLowerCase().trim();
    } catch {}
    return null;
  },
  ip: (ctx) => getIp(ctx),
  actorId: (ctx) => ctx.var.actor?.id ?? null,
  tenantId: (ctx) => ctx.var.tenantId || null,
} satisfies Record<RateLimitIdentifier, (ctx: Context<Env>) => string | null | Promise<string | null>>;

/** The value of each identifier in `identifiersToExtract` from the request, null where it has none. */
export const extractIdentifiers = async (ctx: Context<Env>, identifiersToExtract: RateLimitIdentifier[]): Promise<Identifiers> => {
  const results: Identifiers = { email: null, ip: null, actorId: null, tenantId: null };
  for (const identifier of identifiersToExtract) results[identifier] = await identifierReaders[identifier](ctx);
  return results;
};

/** {@link checkRateLimitStatus} for the request's IP. */
export const checkIpRateLimitStatus = (ctx: Context<Env>, rateLimiterHandler: RateLimiterHandler) => {
  const ip = getIp(ctx);
  return checkRateLimitStatus(rateLimiterHandler, subjectSegment('ip', ip ?? ''));
};

/**
 * Reports whether the limiter refuses `rateLimitKey`'s next request, without counting one: `/auth/health` reads it for
 * `restrictedMode`. A bucket at its budget refuses, blocked or not.
 */
export const checkRateLimitStatus = async (
  { buckets }: RateLimiterHandler,
  rateLimitKey: string,
): Promise<{ isLimited: boolean; retryAfter?: number }> => {
  for (const { store, limits } of buckets) {
    const state = await store.get(rateLimitKey);
    if (state && state.consumedPoints >= limits.points) {
      return { isLimited: true, retryAfter: getRetryAfter(state.msBeforeNext) };
    }
  }
  return { isLimited: false };
};

/** Length of a `{ ids: [...] }` or top-level array body, falling back to 1 so every request costs a point. */
export const bulkBodyLength = async (ctx: Context<Env>): Promise<number> => {
  try {
    const contentType = ctx.req.header('content-type');
    if (!contentType?.includes('application/json')) return 1;

    const body = await ctx.req.json();

    if (Array.isArray(body)) return Math.max(body.length, 1);
    if (body && Array.isArray(body.ids)) return Math.max(body.ids.length, 1);
  } catch {}

  return 1;
};

/**
 * Charges `limiter` for the request this code runs in (`ambientRequest`), at the moment the work it bounds starts, as
 * the limiter does in front of a route: for a library hook that has no request context of its own.
 * @param limiter - A route limiter; its key reads the ambient request.
 * @throws AppError 429 `too_many_requests` once the budget is spent, with the wait in `meta.retryAfter`.
 * @returns False outside a request, so the caller can refuse the work.
 */
export const chargeLimiter = async (limiter: RateLimiterHandler): Promise<boolean> => {
  const ctx = ambientRequest();
  if (!ctx) return false;
  await limiter(ctx, async () => {});
  return true;
};
