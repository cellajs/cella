import { type HealthComponent, type HealthStatus, worstStatus } from 'shared/health-status';
import { eventLoopLagLimitsMs } from 'shared/utils/event-loop-monitor';
import type { CdcWorkerHealth } from '#/lib/cdc-websocket';

export { type HealthComponent, type HealthResponse, type HealthStatus, worstStatus } from 'shared/health-status';

/** The worst status among the components: one unhealthy component, a worker's included, makes the rollup unhealthy. */
export function rollupStatus(components: Record<string, HealthComponent>): HealthStatus {
  return Object.values(components).reduce<HealthStatus>((status, component) => worstStatus(status, component.status), 'healthy');
}

/** Grade a Node service's own runtime from event-loop lag. */
export function gradeEventLoop(eventLoopLagMs: number): HealthStatus {
  if (eventLoopLagMs >= eventLoopLagLimitsMs.unhealthy) return 'unhealthy';
  if (eventLoopLagMs >= eventLoopLagLimitsMs.degraded) return 'degraded';
  return 'healthy';
}

/** The `api` component: this process graded by its event-loop lag, with its memory in MB. */
export function mapApiComponent(eventLoopLagMs: number, memory: NodeJS.MemoryUsage): HealthComponent {
  return {
    status: gradeEventLoop(eventLoopLagMs),
    checkedVia: 'local',
    details: {
      eventLoopLagMs,
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
    },
  };
}

/** The `database` component from the connectivity check; an unreachable database is unhealthy. */
export function mapDatabaseComponent(connected: boolean, latencyMs: number | null): HealthComponent {
  return connected
    ? { status: 'healthy', checkedVia: 'local', latencyMs }
    : { status: 'unhealthy', checkedVia: 'local', latencyMs: null, reason: 'database_unreachable' };
}

/** Worker reports are considered stale (and therefore degrading) after this long without an update. */
export const workerHealthStaleMs = 45_000;

/** The worker socket as the API holds it. */
export interface CdcSocketSnapshot {
  cdcConnected: boolean;
  lastMessageAt: string | null;
  messagesReceived: number;
  parseErrors: number;
}

/** The worker's latest health push and its age; `health` is null when the push had a shape the API cannot read. */
export interface CdcWorkerReport {
  health: CdcWorkerHealth | null;
  ageMs: number;
}

/**
 * The `cdc` component. The worker grades itself, and the API passes that grade and its reasons on unchanged. The API
 * adds only what the worker cannot tell: no socket (`worker_disconnected`), no report within `workerHealthStaleMs`
 * (`worker_report_stale`), or one it cannot read (`worker_report_unreadable`). The last two degrade at least, and a
 * stale report still shows what it said.
 * @param worker - The worker's latest report, or null when none arrived on this connection.
 */
export function mapCdcComponent(socket: CdcSocketSnapshot, worker: CdcWorkerReport | null): HealthComponent {
  const counts = { messages: socket.messagesReceived, parseErrors: socket.parseErrors };
  const ageMs = worker?.ageMs ?? null;

  if (!socket.cdcConnected) {
    const details = { wsConnected: false, lastMessageAt: socket.lastMessageAt, ...counts };
    return { status: 'unhealthy', checkedVia: 'push', ageMs, reason: 'worker_disconnected', details };
  }

  const health = worker?.health ?? null;
  const stale = !worker || worker.ageMs > workerHealthStaleMs;
  const ownReason = stale ? 'worker_report_stale' : health ? null : 'worker_report_unreadable';
  const reasons = [...(ownReason ? [ownReason] : []), ...(health?.reasons ?? [])];

  // The diagnostics are public, and a flush failure's message carries the failed SQL: the worker's log keeps it.
  const { failure, ...workerDetails } = health?.details ?? {};
  const publicFailure = failure ? { failure: Object.fromEntries(Object.entries(failure).filter(([key]) => key !== 'error')) } : {};

  return {
    status: worstStatus(health?.status ?? 'degraded', ownReason ? 'degraded' : 'healthy'),
    checkedVia: 'push',
    ageMs,
    reason: reasons.length ? reasons.join(',') : undefined,
    details: { wsConnected: true, ...workerDetails, ...publicFailure, ...counts },
  };
}

/** A probe that reached the worker carries its health body; one that did not, why. */
export type ProbeResult = { ok: true; latencyMs: number; body: Record<string, unknown> } | { ok: false; latencyMs: number; reason: string };

/** Maps an active probe of a worker's `/health?depth=full`; an unreachable worker is `unhealthy` here. */
export function mapProbeComponent(result: ProbeResult, extractDetails: (body: Record<string, unknown>) => Record<string, unknown>): HealthComponent {
  if (!result.ok) return { status: 'unhealthy', checkedVia: 'probe', latencyMs: result.latencyMs, reason: result.reason };
  const reported = result.body.status;
  const status: HealthStatus = reported === 'unhealthy' ? 'unhealthy' : reported === 'degraded' ? 'degraded' : 'healthy';
  return { status, checkedVia: 'probe', latencyMs: result.latencyMs, details: extractDetails(result.body) };
}
