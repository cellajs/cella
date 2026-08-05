import { RateLimiterDrizzle, RateLimiterMemory } from 'rate-limiter-flexible';
import { rateLimitsTable } from '#/modules/auth/rate-limits-db';
import { db } from '../data/db';
import { env } from '../env';
import { log } from '../lib/pino';

/**
 * DB-backed per-user WebSocket connection rate limiter.
 * Shares the backend's `rate_limits` table through its drizzle schema, mirroring the
 * backend rate-limiter helpers. Falls back to in-memory limiting when the DB is
 * unreachable (fail-open with safety net).
 */
const connectionLimiter = env.NODB
  ? new RateLimiterMemory({ keyPrefix: 'yjs_ws', points: 20, duration: 60 })
  : new RateLimiterDrizzle({
      storeClient: db,
      schema: rateLimitsTable,
      keyPrefix: 'yjs_ws',
      points: 20, // 20 connections per minute per user
      duration: 60,
      blockDuration: 0, // No extra block: budget resets after the window
      insuranceLimiter: new RateLimiterMemory({
        keyPrefix: 'yjs_ws',
        points: 20,
        duration: 60,
      }),
      inMemoryBlockOnConsumed: 20,
    });

/** Consume one connection point for a userId. Rejects if over limit. */
export async function checkConnectionRate(userId: string): Promise<boolean> {
  try {
    await connectionLimiter.consume(userId);
    return true;
  } catch {
    log.warn('WS connection rate limited', { userId });
    return false;
  }
}
