import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './env';
import { cdcErrorHandler } from './lib/error';
import { logEvent } from './pino';
import { getCdcMetrics } from './tracing';
import { RESOURCE_LIMITS } from './constants';
import { getCdcHealthState, getReplicationPausedAt, getWalBytes, getFreeDiskSpace, type CdcHealthState } from './worker';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface HealthResponse {
  status: HealthStatus;
  wsState: string;
  replicationState: string;
  lastLsn: string | null;
  lastMessageAt: string | null;
  pausedDurationMs: number | null;
  walBytes: number | null;
  freeDiskBytes: number | null;
}

const { runtime } = RESOURCE_LIMITS;

async function getHealthStatus(state: CdcHealthState): Promise<HealthStatus> {
  if (state.wsState === 'open' && state.replicationState === 'active') return 'healthy';

  const walBytes = await getWalBytes();
  if (walBytes !== null) {
    if (walBytes > runtime.walShutdownBytes) return 'unhealthy';
    if (walBytes > runtime.walWarningBytes) return 'degraded';
  }

  const freeDisk = getFreeDiskSpace();
  if (freeDisk !== null && freeDisk < runtime.diskUnhealthyBytes) return 'unhealthy';

  const pausedAt = getReplicationPausedAt();
  if (pausedAt && Date.now() - pausedAt.getTime() > runtime.pauseUnhealthyMs) return 'unhealthy';

  if (state.wsState === 'reconnecting' && state.replicationState === 'paused') return 'degraded';
  if (state.wsState === 'closed') return 'unhealthy';

  return 'degraded';
}

// Create Hono app for health endpoints
const app = new Hono();

// Minimal security middleware
app.use('*', secureHeaders());

// Health check endpoint
app.get('/health', async (c) => {
  const cdcState = getCdcHealthState();
  const status = await getHealthStatus(cdcState);
  const metrics = getCdcMetrics();

  // Calculate paused duration if replication is paused
  const pausedAt = getReplicationPausedAt();
  const pausedDurationMs = pausedAt ? Date.now() - pausedAt.getTime() : null;
  
  // Get WAL and disk space metrics
  const walBytes = await getWalBytes();
  const freeDiskBytes = getFreeDiskSpace();

  const response: HealthResponse & { metrics: typeof metrics } = {
    status,
    wsState: cdcState.wsState,
    replicationState: cdcState.replicationState,
    lastLsn: cdcState.lastLsn,
    lastMessageAt: cdcState.lastMessageAt?.toISOString() ?? null,
    pausedDurationMs,
    walBytes,
    freeDiskBytes,
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
