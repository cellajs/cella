import { AsyncLocalStorage } from 'node:async_hooks';
import { and, eq, gt, gte, lt, lte, or, sql } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { RateLimiterDrizzle, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { env } from '#/env';
import { defaultOptions, slowOptions } from '#/middlewares/rate-limiter/core';
import type { Identifiers, RateLimiterHandler, RateLimitIdentifier } from '#/middlewares/rate-limiter/types';
import { rateLimitsTable } from '#/modules/auth/rate-limits-db';
import { getIp } from '#/utils/get-ip';
import { toRateLimitIp } from '#/utils/ip-subnet';
import { log } from '#/utils/logger';

type RateLimiterOptions = {
  keyPrefix?: string;
  points: number;
  duration: number;
  blockDuration?: number;
  /**
   * Also block an over-limit key in this process's memory, until its window ends (default true). Buckets that reserve
   * attempts pass false: an attempt given back must free the budget, and a block lives in the database only, so every
   * process holds it for the same time.
   */
  inMemoryBlock?: boolean;
};

type LimiterStore = RateLimiterDrizzle | RateLimiterMemory;

// Singleton registry: reuse limiter instances with the same keyPrefix to share internal caches and reduce DB round-trips
const limiterRegistry = new Map<string, LimiterStore>();

/** Each database store's in-memory insurance, for the statements this module runs on the store's table itself. */
const insurances = new WeakMap<RateLimiterDrizzle, RateLimiterMemory>();

/** Prefix-memoized Drizzle limiter; an in-memory insurance limiter covers DB outages and blocks stay local. */
export const getRateLimiterInstance = ({ inMemoryBlock = true, ...options }: RateLimiterOptions): LimiterStore => {
  const keyPrefix = options.keyPrefix ?? '';
  const existing = limiterRegistry.get(keyPrefix);
  if (existing) return existing;

  const enforcedOptions = {
    ...options,
    tableName: defaultOptions.tableName,
  };

  let instance: LimiterStore;

  if (env.NODB) {
    instance = new RateLimiterMemory(enforcedOptions);
  } else {
    // Fail-open: an unreachable DB falls back to the in-memory limiter so the request survives without a 500
    const insurance = new RateLimiterMemory(enforcedOptions);
    instance = new RateLimiterDrizzle({
      ...enforcedOptions,
      storeClient: db,
      schema: rateLimitsTable,
      insuranceLimiter: insurance,
      // Block over-limit keys in-memory so repeat offenders miss the DB; blockDuration=0 uses the remaining window
      ...(inMemoryBlock && { inMemoryBlockOnConsumed: enforcedOptions.points }),
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
 * Creates a bucket's row, or restarts an expired one, in one statement, leaving a live count alone. The database
 * store's own upsert reads the row before it writes, so the first requests of a parallel burst on a new key would each
 * start the count at one; after this, every consume increments the row atomically.
 * @param store - The bucket's limiter; only the database store needs the row.
 * @param rateLimitKey - The key as the middleware passes it to the store.
 * @param durationSeconds - The counting window a new or restarted row gets.
 */
export const openBucket = async (store: LimiterStore, rateLimitKey: string, durationSeconds: number) => {
  if (!(store instanceof RateLimiterDrizzle)) return;
  const now = new Date();
  const expire = new Date(now.getTime() + durationSeconds * 1000);
  await db
    .insert(rateLimitsTable)
    .values({ key: store.getKey(rateLimitKey), points: 0, expire })
    .onConflictDoUpdate({
      target: rateLimitsTable.key,
      set: { points: 0, expire },
      setWhere: lte(rateLimitsTable.expire, now),
    });
};

/**
 * Takes one attempt from a bucket while its budget lasts, in one statement: a new or expired bucket starts at one, a
 * live one below `points` gains one. A spent bucket stays as it is, so a refused request neither counts nor blocks.
 * @returns The bucket with this attempt, or null when its budget is spent.
 */
const takeAttempt = async (
  store: LimiterStore,
  rateLimitKey: string,
  { points, duration }: { points: number; duration: number },
): Promise<RateLimiterRes | null> => {
  if (store instanceof RateLimiterDrizzle) {
    const now = new Date();
    const expired = lte(rateLimitsTable.expire, now);
    const [bucket] = await db
      .insert(rateLimitsTable)
      .values({ key: store.getKey(rateLimitKey), points: 1, expire: new Date(now.getTime() + duration * 1000) })
      .onConflictDoUpdate({
        target: rateLimitsTable.key,
        set: {
          points: sql`case when ${expired} then 1 else ${rateLimitsTable.points} + 1 end`,
          expire: sql`case when ${expired} then excluded.expire else ${rateLimitsTable.expire} end`,
        },
        setWhere: or(expired, lt(rateLimitsTable.points, points)),
      })
      .returning({ points: rateLimitsTable.points, expire: rateLimitsTable.expire });
    if (!bucket) return null;
    return new RateLimiterRes(Math.max(points - bucket.points, 0), msUntil(bucket.expire), bucket.points);
  }
  // In memory the count this attempt reads back is its own, so a parallel burst takes the budget one by one here too.
  const taken = await store.penalty(rateLimitKey, 1);
  if (taken.consumedPoints <= points) return taken;
  await store.reward(rateLimitKey, 1);
  return null;
};

/**
 * Counts an attempt before the work it bounds runs, so a parallel burst takes the budget one point at a time and at
 * most `points` attempts go through. A spent budget refuses without counting or blocking; the caller settles the
 * attempt once its outcome is known (`refundAttempt`, `blockSpentBucket`).
 * @param store - The bucket's limiter.
 * @param rateLimitKey - The key as the middleware passes it to the store.
 * @param limits - The budget and the counting window a new or restarted bucket gets.
 * @returns The store holding the attempt (process memory while the database is unreachable) and the bucket with it,
 *   or the spent bucket that refused it.
 */
export const reserveAttempt = async (
  store: LimiterStore,
  rateLimitKey: string,
  limits: { points: number; duration: number },
): Promise<
  { granted: true; store: LimiterStore; state: RateLimiterRes } | { granted: false; state: RateLimiterRes }
> => {
  let holder = store;
  let taken: RateLimiterRes | null;
  try {
    taken = await takeAttempt(holder, rateLimitKey, limits);
  } catch (err) {
    const insurance = insuranceOf(store);
    if (!insurance) throw err;
    log.warn('Rate limit attempt counted in process memory', { rateLimitKey, err });
    holder = insurance;
    taken = await takeAttempt(holder, rateLimitKey, limits);
  }
  if (taken) return { granted: true, store: holder, state: taken };
  // Read for Retry-After; a bucket reset, expired or given back since the refusal lets the client retry at once.
  const state = await holder.get(rateLimitKey);
  const spent = state !== null && state.consumedPoints >= limits.points;
  return { granted: false, state: spent ? state : new RateLimiterRes(0, 1000, limits.points) };
};

/**
 * Gives back an attempt counted before the handler ran whose outcome the bucket does not count. A bucket that expired
 * or was reset since holds no attempt to give back.
 * @param store - The bucket's limiter.
 * @param rateLimitKey - The key as the middleware passes it to the store.
 */
export const refundAttempt = async (store: LimiterStore, rateLimitKey: string) => {
  if (store instanceof RateLimiterDrizzle) {
    await db
      .update(rateLimitsTable)
      .set({ points: sql`${rateLimitsTable.points} - 1` })
      .where(
        and(
          eq(rateLimitsTable.key, store.getKey(rateLimitKey)),
          gt(rateLimitsTable.points, 0),
          gt(rateLimitsTable.expire, new Date()),
        ),
      );
    return;
  }
  // In memory a bucket reset or expired since reads back below zero: the point goes back where it came from.
  const refunded = await store.reward(rateLimitKey, 1);
  if (refunded.consumedPoints < 0) await store.penalty(rateLimitKey, 1);
};

/**
 * Blocks a bucket whose whole budget is taken, for `blockSeconds` from now: what a failure answered at that point does.
 * The block keeps the bucket's points, so attempts still in flight that the bucket does not count give theirs back and
 * reopen it.
 * @param store - The bucket's limiter.
 * @param rateLimitKey - The key as the middleware passes it to the store.
 * @param points - The bucket's budget.
 * @param blockSeconds - How long the block lasts, the same in every process.
 * @returns Whether the bucket was spent and is blocked now.
 */
export const blockSpentBucket = async (
  store: LimiterStore,
  rateLimitKey: string,
  points: number,
  blockSeconds: number,
): Promise<boolean> => {
  const now = new Date();
  if (store instanceof RateLimiterDrizzle) {
    const blocked = await db
      .update(rateLimitsTable)
      .set({ expire: new Date(now.getTime() + blockSeconds * 1000) })
      .where(
        and(
          eq(rateLimitsTable.key, store.getKey(rateLimitKey)),
          gte(rateLimitsTable.points, points),
          gt(rateLimitsTable.expire, now),
        ),
      )
      .returning({ key: rateLimitsTable.key });
    return blocked.length > 0;
  }
  const state = await store.get(rateLimitKey);
  if (!state || state.consumedPoints < points) return false;
  await store.set(rateLimitKey, state.consumedPoints, blockSeconds);
  return true;
};

export const rateLimitError = (ctx: Context<Env>, limitState: RateLimiterRes, rateLimitKey: string) => {
  const retryAfter = getRetryAfter(limitState.msBeforeNext);
  ctx.header('Retry-After', retryAfter);
  throw new AppError(429, 'too_many_requests', 'warn', { meta: { rateLimitKey, retryAfter: Number(retryAfter) } });
};

/** Floored to 1s so sub-second waits never emit `Retry-After: 0`, which clients read as "retry immediately". */
export const getRetryAfter = (ms: number) => Math.max(1, Math.round(ms / 1000)).toString();

export const extractIdentifiers = async (
  ctx: Context<Env>,
  identifiersToExtract: RateLimitIdentifier[],
): Promise<Identifiers> => {
  const results: Identifiers = {
    email: null,
    ip: null,
    userId: null,
    actorId: null,
    tenantId: null,
  };

  for (const identifier of identifiersToExtract) {
    switch (identifier) {
      case 'email': {
        // Normalize the email exactly like validation so aliases share a bucket; this runs before Zod, so guard the type
        if (ctx.req.header('content-type')?.includes('application/json')) {
          try {
            const body = (await ctx.req.json()) as { email?: unknown };
            if (typeof body.email === 'string' && body.email) results.email = body.email.toLowerCase().trim();
          } catch {}
        }
        break;
      }

      case 'ip': {
        results.ip = getIp(ctx);
        break;
      }
      case 'userId': {
        const user = ctx.var.user;
        if (user) results.userId = user.id;
        break;
      }
      case 'actorId': {
        const actor = ctx.var.actor;
        if (actor) results.actorId = actor.id;
        break;
      }
      case 'tenantId': {
        const tenantId = ctx.var.tenantId;
        if (tenantId) results.tenantId = tenantId;
        break;
      }
    }
  }

  return results;
};

export const checkIpRateLimitStatus = async (ctx: Context<Env>, rateLimiterHandler: RateLimiterHandler) => {
  const ip = getIp(ctx);
  return checkRateLimitStatus(rateLimiterHandler, `ip:${toRateLimitIp(ip ?? '')}`);
};

/** Reports whether a key is blocked without consuming points. /auth/health uses it to detect restrictedMode. */
export const checkRateLimitStatus = async (
  rateLimiterHandler: RateLimiterHandler,
  rateLimitKey: string,
): Promise<{ isLimited: boolean; retryAfter?: number }> => {
  const { keyPrefix, points: mainPoints } = rateLimiterHandler;
  const limiter = getRateLimiterInstance({ ...defaultOptions, points: mainPoints, keyPrefix });
  const slowLimiter = getRateLimiterInstance({ ...slowOptions, keyPrefix: `${keyPrefix}:slow` });

  const [state, slowState] = await Promise.all([limiter.get(rateLimitKey), slowLimiter.get(rateLimitKey)]);

  if (state && state.consumedPoints > mainPoints) {
    return { isLimited: true, retryAfter: Math.round(state.msBeforeNext / 1000) };
  }

  if (slowState && slowState.consumedPoints > (slowOptions.points ?? 100)) {
    return { isLimited: true, retryAfter: Math.round(slowState.msBeforeNext / 1000) };
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

/** The request whose code runs now, for a limiter charged where its cost arises (`chargeLimiter`). */
const scopedRequests = new AsyncLocalStorage<Context<Env>>();

/**
 * Binds the request to everything its handler runs, so `chargeLimiter` can charge a limiter from code that has no
 * request context of its own: a library hook about to do the work a budget bounds.
 */
export const limiterScope: MiddlewareHandler<Env> = (ctx, next) => scopedRequests.run(ctx, next);

/**
 * Charges `limiter` for the request `limiterScope` bound, at the moment the work it bounds starts, as the limiter does in
 * front of a route.
 * @param limiter - A route limiter; its key reads the bound request.
 * @throws AppError 429 `too_many_requests` once the budget is spent, with the wait in `meta.retryAfter`.
 * @returns False outside a bound request, so the caller can refuse the work.
 */
export const chargeLimiter = async (limiter: RateLimiterHandler): Promise<boolean> => {
  const ctx = scopedRequests.getStore();
  if (!ctx) return false;
  await limiter(ctx, async () => {});
  return true;
};
