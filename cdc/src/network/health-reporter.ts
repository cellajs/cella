import { cdcMetrics } from '../services/cdc-metrics';
import { replicationState } from '../services/replication-state';
import { wsClient } from './websocket-client';

const HEALTH_PUSH_INTERVAL_MS = 15_000;

let timer: NodeJS.Timeout | null = null;

function push(): void {
  if (!wsClient.isConnected()) return;
  wsClient.send({
    _control: 'health',
    payload: {
      replicationStatus: replicationState.status,
      lastLsn: replicationState.lastLsn,
      messagesSent: wsClient.messagesSent,
      slotActive: cdcMetrics.slotActive,
      lagBytes: cdcMetrics.lagBytes,
      lastEventAt: replicationState.lastEventAt?.toISOString() ?? null,
      catchingUp: replicationState.catchingUp,
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
