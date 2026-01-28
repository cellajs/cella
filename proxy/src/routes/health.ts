import { Hono } from 'hono';
import { env } from '../env';
import { checkServiceHealth, type ServiceHealth } from '../lib/proxy';

const app = new Hono();

/**
 * Overall health status combining all services.
 */
type OverallStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Aggregated health response.
 */
interface AggregatedHealth {
  status: OverallStatus;
  services: {
    proxy: ServiceHealth;
    api: ServiceHealth;
    cdc: ServiceHealth;
  };
  timestamp: string;
}

/**
 * Aggregated health check combining proxy, API, and CDC status.
 * Returns 503 if API is unhealthy, 200 otherwise.
 *
 * - API being down = unhealthy (503)
 * - CDC being down = degraded (200, but shows degraded status)
 * - All healthy = healthy (200)
 */
app.get('/', async (c) => {
  const timeout = env.HEALTH_CHECK_TIMEOUT;

  // Check all services in parallel
  const [apiHealth, cdcHealth] = await Promise.all([
    checkServiceHealth(`${env.API_URL}/ping`, timeout),
    checkServiceHealth(`${env.CDC_URL}/health`, timeout),
  ]);

  // Proxy is always healthy if we're responding
  const services: AggregatedHealth['services'] = {
    proxy: { status: 'healthy' },
    api: apiHealth,
    cdc: cdcHealth,
  };

  // Determine overall status:
  // - API unhealthy -> overall unhealthy
  // - API degraded or CDC not healthy -> overall degraded
  // - All healthy -> overall healthy
  let overallStatus: OverallStatus = 'healthy';

  if (apiHealth.status === 'unhealthy') {
    overallStatus = 'unhealthy';
  } else if (apiHealth.status === 'degraded' || cdcHealth.status !== 'healthy') {
    overallStatus = 'degraded';
  }

  const health: AggregatedHealth = {
    status: overallStatus,
    services,
    timestamp: new Date().toISOString(),
  };

  // Return 503 only if API is unhealthy
  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;
  return c.json(health, httpStatus as 200);
});

/**
 * Simple liveness probe for load balancers.
 * Always returns 200 if the proxy is running.
 */
app.get('/live', (c) => {
  return c.json({ status: 'ok' });
});

/**
 * Readiness probe - checks if proxy can serve requests.
 * Returns 200 if API is reachable, 503 otherwise.
 */
app.get('/ready', async (c) => {
  const apiHealth = await checkServiceHealth(`${env.API_URL}/ping`, env.HEALTH_CHECK_TIMEOUT);

  if (apiHealth.status === 'unhealthy') {
    return c.json({ status: 'not_ready', api: apiHealth }, 503);
  }

  return c.json({ status: 'ready', api: apiHealth });
});

export { app as healthRoutes };
