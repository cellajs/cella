import { RateLimiterDrizzle, RateLimiterMemory } from 'rate-limiter-flexible';
import { rateLimitsTable } from '#/modules/auth/rate-limits-db';
import { db } from '../data/db';
import { env } from '../env';
import { log } from '../lib/pino';

/** 20 connections per minute per user, the same in every store, the insurance one included. */
const connectionBudget = { keyPrefix: 'yjs_ws', points: 20, duration: 60 };

/** Per-user connection limiter over the backend's `rate_limits` table; falls back to in-memory limiting when the DB is unreachable. */
const connectionLimiter = env.NODB
  ? new RateLimiterMemory(connectionBudget)
  : new RateLimiterDrizzle({
      ...connectionBudget,
      storeClient: db,
      schema: rateLimitsTable,
      blockDuration: 0, // No extra block: budget resets after the window
      insuranceLimiter: new RateLimiterMemory(connectionBudget),
      inMemoryBlockOnConsumed: connectionBudget.points,
    });

export async function checkConnectionRate(userId: string): Promise<boolean> {
  try {
    await connectionLimiter.consume(userId);
    return true;
  } catch {
    log.warn('WS connection rate limited', { userId });
    return false;
  }
}
