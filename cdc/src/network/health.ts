import process from 'node:process';
import { getEventLoopLagMs } from 'shared/utils/event-loop-monitor';
import { RESOURCE_LIMITS } from '../constants';
import { type MetricsSnapshot, metrics } from '../services/cdc-metrics';
import { type ReplicationFailure, replicationState } from '../services/replication-state';
import { getRoleCapabilities, type RoleCapabilities } from '../services/role-capabilities';
import { wsClient } from './websocket-client';

const { unhealthyBytes } = RESOURCE_LIMITS.walLag;
const { pauseUnhealthyMs } = RESOURCE_LIMITS.runtime;

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface HealthResponse {
  status: HealthStatus;
  uptime: number;
  eventLoopLagMs: number;
  replication: {
    status: string;
    lastLsn: string | null;
    pausedAt: string | null;
    slotActive: boolean | null;
    slotStatus: string | null;
    lagBytes: number | null;
    /** How long ago the transaction read last committed; null before the first one. */
    lagMs: number | null;
    lastEventAt: string | null;
    /** The failure the worker is reading again from, with `stuck` set once the change itself failed it too often. */
    failure: (ReplicationFailure & { stuck: boolean }) | null;
    /** Null until the startup probe ran or when it failed. */
    role: RoleCapabilities | null;
  };
  websocket: { connected: boolean; state: string; messagesSent: number; lastMessageAt: string | null };
  metrics: MetricsSnapshot;
}

export function getHealthResponse(): { response: HealthResponse; httpStatus: number } {
  const replStatus = replicationState.status;
  const wsConnected = wsClient.isConnected();

  const { failure, stuck, replicationPausedAt } = replicationState;

  // Between two reads after a failed flush the subscription is down on purpose: that is degraded until it is stuck.
  let status: HealthStatus = 'healthy';
  if (stuck) status = 'unhealthy';
  else if (replStatus === 'stopped' && !failure) status = 'unhealthy';
  else if (replStatus !== 'active' || failure || !wsConnected) status = 'degraded';

  // Without the API nothing is consumed: after a while that is an outage of sync, not a restart.
  if (replicationPausedAt && Date.now() - replicationPausedAt.getTime() > pauseUnhealthyMs) status = 'unhealthy';

  // Without an effective RLS bypass every seq stamp silently affects zero rows; without REPLICATION the slot cannot be opened.
  const role = getRoleCapabilities();
  if (role && (!role.rlsBypass || !role.replication)) status = 'unhealthy';

  // WAL lag threshold for unhealthy status.
  const lagBytes = metrics.lagBytes;
  if (lagBytes !== null && lagBytes >= unhealthyBytes && status !== 'unhealthy') {
    status = 'unhealthy';
  }

  // The slot no longer holds the WAL the worker needs, or nothing reads it while the worker believes it does.
  if (metrics.slotStatus === 'unreserved' || metrics.slotStatus === 'lost') status = 'unhealthy';
  if (replStatus === 'active' && metrics.slotActive === false && status === 'healthy') status = 'degraded';

  // Same saturation thresholds the yjs relay uses for its health status.
  const eventLoopLagMs = getEventLoopLagMs();
  if (eventLoopLagMs >= 1000) status = 'unhealthy';
  else if (eventLoopLagMs >= 100 && status === 'healthy') status = 'degraded';

  const response: HealthResponse = {
    status,
    uptime: Math.floor(process.uptime()),
    eventLoopLagMs,
    replication: {
      status: replStatus,
      lastLsn: replicationState.lastLsn,
      pausedAt: replicationState.replicationPausedAt?.toISOString() ?? null,
      slotActive: metrics.slotActive,
      slotStatus: metrics.slotStatus,
      lagBytes: metrics.lagBytes,
      lagMs: replicationState.lagMs,
      lastEventAt: replicationState.lastEventAt?.toISOString() ?? null,
      failure: failure ? { ...failure, stuck } : null,
      role,
    },
    websocket: {
      connected: wsConnected,
      state: wsClient.state,
      messagesSent: wsClient.messagesSent,
      lastMessageAt: wsClient.lastMessageAt?.toISOString() ?? null,
    },
    metrics: metrics.getSnapshot(),
  };

  const httpStatus = status === 'unhealthy' ? 503 : 200;
  return { response, httpStatus };
}
