import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './env';
import { cdcErrorHandler } from './lib/error';
import { logEvent } from './pino';
import { getCdcMetrics } from './tracing';
import { getCdcHealthState, type CdcHealthState } from './worker';

/**
 * Health status derived from CDC state.
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Health response payload.
 */
interface HealthResponse {
  status: HealthStatus;
  wsState: string;
  replicationState: string;
  lastLsn: string | null;
  lastMessageAt: string | null;
}

/**
 * Determine health status from CDC state.
 */
function getHealthStatus(state: CdcHealthState): HealthStatus {
  // Healthy: WebSocket OPEN and replication active
  if (state.wsState === 'open' && state.replicationState === 'active') {
    return 'healthy';
  }

  // Degraded: WebSocket reconnecting and replication paused
  if (state.wsState === 'reconnecting' && state.replicationState === 'paused') {
    return 'degraded';
  }

  // Unhealthy: WebSocket closed for > 30 seconds
  if (state.wsState === 'closed' || state.wsState === 'reconnecting') {
    // We don't have disconnectedAt exposed, but we can check lastMessageAt
    // If no messages and not connected, consider unhealthy after threshold
    // For now, treat closed as unhealthy, reconnecting as degraded
    if (state.wsState === 'closed') {
      return 'unhealthy';
    }
  }

  // Default to degraded for other states
  return 'degraded';
}

// Create Hono app for health endpoints
const app = new Hono();

// Minimal security middleware
app.use('*', secureHeaders());

// Health check endpoint
app.get('/health', (c) => {
  const cdcState = getCdcHealthState();
  const status = getHealthStatus(cdcState);
  const metrics = getCdcMetrics();

  const response: HealthResponse & { metrics: typeof metrics } = {
    status,
    wsState: cdcState.wsState,
    replicationState: cdcState.replicationState,
    lastLsn: cdcState.lastLsn,
    lastMessageAt: cdcState.lastMessageAt?.toISOString() ?? null,
    metrics,
  };

  const httpStatus = status === 'unhealthy' ? 503 : 200;
  return c.json(response, httpStatus as 200);
});

// Metrics endpoint
app.get('/metrics', (c) => {
  const metrics = getCdcMetrics();
  return c.json(metrics);
});

// Not found handler
app.notFound((c) => c.json({ error: 'not_found' }, 404));

// Error handler
app.onError(cdcErrorHandler);

// Server instance for graceful shutdown
let server: ServerType | null = null;

/**
 * Start the CDC health HTTP server using Hono.
 * Returns the server instance for graceful shutdown.
 */
export function startHealthServer(): ServerType {
  const port = env.CDC_HEALTH_PORT;

  server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
    logEvent('info', 'CDC health server listening', { port });
  });

  return server;
}

/**
 * Stop the CDC health server gracefully.
 */
export async function stopHealthServer(): Promise<void> {
  if (server) {
    server.close();
    logEvent('info', 'CDC health server stopped');
    server = null;
  }
}
