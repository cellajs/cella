import { metrics } from '../services/cdc-metrics';
import { replicationState } from '../services/replication-state';
import { getRoleCapabilities } from '../services/role-capabilities';
import { wsClient } from './websocket-client';

const HEALTH_PUSH_INTERVAL_MS = 15_000;

let timer: NodeJS.Timeout | null = null;

/** Sends the status payload now. The timer does it every 15 seconds; a new generation of the books should not wait for it. */
export function pushHealth(): void {
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
      lagMs: replicationState.lagMs,
      generation: replicationState.generation,
      stuck: replicationState.stuck,
      rlsBypass: role?.rlsBypass ?? null,
      roleReplication: role?.replication ?? null,
    },
  });
}

export function startHealthReporter(): void {
  if (timer) return;
  timer = setInterval(pushHealth, HEALTH_PUSH_INTERVAL_MS);
  timer.unref?.();
}

export function stopHealthReporter(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
