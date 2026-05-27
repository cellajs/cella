import { RateLimiterPostgres, RateLimiterMemory } from 'rate-limiter-flexible';
import { pool } from '../data/db';
import { env } from '../env';
import { logEvent } from '../lib/pino';

/**
 * DB-backed per-user WebSocket connection rate limiter.
 * Shares the backend's `rate_limits` table via a raw pg.Pool — no Drizzle needed.
 * Falls back to in-memory limiting when the DB is unreachable (fail-open with safety net).
 */
const connectionLimiter = env.DEV_MODE === 'none'
  ? new RateLimiterMemory({ keyPrefix: 'yjs_ws', points: 20, duration: 60 })
  : new RateLimiterPostgres({
      storeClient: pool,
      tableName: 'rate_limits',
      tableCreated: true, // Table managed by backend Drizzle migrations
      keyPrefix: 'yjs_ws',
      points: 20, // 20 connections per minute per user
      duration: 60,
      blockDuration: 0, // No extra block — budget resets after the window
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
    logEvent('warn', 'WS connection rate limited', { userId });
    return false;
  }
}
