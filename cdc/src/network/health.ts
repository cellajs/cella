import { circuitBreaker } from '../services/circuit-breaker';
import { cdcMetrics, type MetricsSnapshot } from '../services/cdc-metrics';
import { replicationState } from '../services/replication-state';
import { wsClient } from './websocket-client';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface HealthResponse {
  status: HealthStatus;
  uptime: number;
  replication: {
    status: string;
    lastLsn: string | null;
    pausedAt: string | null;
  };
  catchup: {
    active: boolean;
    eventsProcessed: number;
    startedAt: string | null;
    lagMs: number;
  } | null;
  websocket: {
    connected: boolean;
    state: string;
    messagesSent: number;
    lastMessageAt: string | null;
  };
  circuitBreakers: Record<string, { state: string; failureCount: number; skippedCount: number }>;
  metrics: MetricsSnapshot;
}

export function getHealthResponse(): { response: HealthResponse; httpStatus: number } {
  const replStatus = replicationState.status;
  const wsConnected = wsClient.isConnected();

  let status: HealthStatus = 'healthy';
  if (replStatus === 'stopped') status = 'unhealthy';
  else if (replStatus === 'paused' || !wsConnected) status = 'degraded';

  const circuitStatus = circuitBreaker.getStatus();
  const hasOpenBreakers = Object.values(circuitStatus).some((s) => s.state !== 'closed');
  if (hasOpenBreakers && status === 'healthy') status = 'degraded';

  const response: HealthResponse = {
    status,
    uptime: Math.floor(process.uptime()),
    replication: {
      status: replStatus,
      lastLsn: replicationState.lastLsn,
      pausedAt: replicationState.replicationPausedAt?.toISOString() ?? null,
    },
    catchup: replicationState.catchingUp
      ? {
          active: true,
          eventsProcessed: replicationState.catchupEventsProcessed,
          startedAt: replicationState.catchupStartedAt ? new Date(replicationState.catchupStartedAt).toISOString() : null,
          lagMs: replicationState.lastLagMs ?? 0,
        }
      : null,
    websocket: {
      connected: wsConnected,
      state: wsClient.state,
      messagesSent: wsClient.messagesSent,
      lastMessageAt: wsClient.lastMessageAt?.toISOString() ?? null,
    },
    circuitBreakers: circuitStatus,
    metrics: cdcMetrics.getSnapshot(),
  };

  const httpStatus = status === 'unhealthy' ? 503 : 200;
  return { response, httpStatus };
}
