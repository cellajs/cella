import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { env } from './env';
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

/**
 * Handle health check request.
 */
function handleHealthRequest(_req: IncomingMessage, res: ServerResponse): void {
  const cdcState = getCdcHealthState();
  const status = getHealthStatus(cdcState);

  const response: HealthResponse = {
    status,
    wsState: cdcState.wsState,
    replicationState: cdcState.replicationState,
    lastLsn: cdcState.lastLsn,
    lastMessageAt: cdcState.lastMessageAt?.toISOString() ?? null,
  };

  const httpStatus = status === 'unhealthy' ? 503 : 200;

  res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

/**
 * Start the health HTTP server.
 */
export function startHealthServer(): void {
  const server = createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      handleHealthRequest(req, res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(env.CDC_HEALTH_PORT, '0.0.0.0', () => {
    console.info(`CDC health server listening on port ${env.CDC_HEALTH_PORT}`);
  });
}
