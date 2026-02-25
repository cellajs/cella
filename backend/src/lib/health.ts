import { sql } from 'drizzle-orm';
import { baseDb as db } from '#/db/db';
import { env } from '#/env';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface HealthResponse {
  status: HealthStatus;
  uptime: number;
  database: 'connected' | 'disconnected';
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
}

/**
 * Check database connectivity with a simple SELECT 1 query.
 */
async function checkDatabase(): Promise<boolean> {
  // No DB in DEV_MODE=none
  if (env.DEV_MODE === 'none') return false;

  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get backend health status with database connectivity and process metrics.
 * Similar to CDC health endpoint for consistency across services.
 */
export async function getHealthResponse(): Promise<{ response: HealthResponse; httpStatus: number }> {
  const dbConnected = await checkDatabase();
  const memoryUsage = process.memoryUsage();

  const status: HealthStatus = dbConnected ? 'healthy' : 'unhealthy';

  const response: HealthResponse = {
    status,
    uptime: Math.floor(process.uptime()),
    database: dbConnected ? 'connected' : 'disconnected',
    memory: {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      rss: memoryUsage.rss,
    },
  };

  const httpStatus = status === 'unhealthy' ? 503 : 200;
  return { response, httpStatus };
}
