import { metrics } from '../services/cdc-metrics';
import { replicationState } from '../services/replication-state';
import { getRoleCapabilities } from '../services/role-capabilities';
import { wsClient } from './websocket-client';

const HEALTH_PUSH_INTERVAL_MS = 15_000;

let timer: NodeJS.Timeout | null = null;

function push(): void {
  if (!wsClient.isConnected()) return;
  const role = getRoleCapabilities();
  wsClient.send({
    _control: 'health',
    payload: {
      replicationStatus: replicationState.status,
      lastLsn: replicationState.lastLsn,
      messagesSent: wsClient.messagesSent,
      slotActive: metrics.slotActive,
      lagBytes: metrics.lagBytes,
      lastEventAt: replicationState.lastEventAt?.toISOString() ?? null,
      catchingUp: replicationState.catchingUp,
      rlsBypass: role?.rlsBypass ?? null,
      roleReplication: role?.replication ?? null,
    },
  });
}

export function startHealthReporter(): void {
  if (timer) return;
  timer = setInterval(push, HEALTH_PUSH_INTERVAL_MS);
  timer.unref?.();
}

export function stopHealthReporter(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
