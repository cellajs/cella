import type { CdcWorkerHealth } from '#/lib/cdc-websocket';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * One service or dependency in the health envelope. Every component shares the
 * same shape: a graded `status` plus optional probe metadata and a free-form
 * `details` bag. There is intentionally no discriminated union — consumers read
 * `status` for grading and `details` for diagnostics.
 */
export interface HealthComponent {
  status: HealthStatus;
  /** How the status was obtained: `local` self-check, worker `push`, or active `probe`. */
  checkedVia?: 'local' | 'push' | 'probe';
  /** Age of the underlying data (ms) — set for pushed/cached reports. */
  ageMs?: number | null;
  /** Round-trip latency of the check (ms) — set for db/probe checks. */
  latencyMs?: number | null;
  /** Short machine-readable reason when degraded/unhealthy. */
  reason?: string;
  details?: Record<string, unknown>;
}

export interface HealthResponse {
  status: HealthStatus;
  uptime: number;
  components: Record<string, HealthComponent>;
}

const RANK: Record<HealthStatus, number> = { healthy: 0, degraded: 1, unhealthy: 2 };

/** Return the worse (higher-severity) of two statuses. */
export function worstStatus(a: HealthStatus, b: HealthStatus): HealthStatus {
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * Roll a set of components up into a single overall status.
 *
 * Critical components (the backend's own ability to serve — `api`, `database`)
 * contribute their full status. Non-critical dependency components are capped
 * at `degraded`, so a flaky worker degrades the API without marking it
 * `unhealthy` — which would otherwise deregister it from the load balancer.
 */
export function rollupStatus(
  components: Record<string, HealthComponent>,
  criticalComponents: Set<string>,
): HealthStatus {
  let result: HealthStatus = 'healthy';
  for (const [name, component] of Object.entries(components)) {
    const capped = criticalComponents.has(name) || component.status !== 'unhealthy' ? component.status : 'degraded';
    result = worstStatus(result, capped);
  }
  return result;
}

const EVENT_LOOP_LAG_DEGRADED_MS = 100;
const EVENT_LOOP_LAG_UNHEALTHY_MS = 1_000;

/** Grade a Node service's own runtime from event-loop lag, with memory diagnostics. */
export function gradeEventLoop(eventLoopLagMs: number): HealthStatus {
  if (eventLoopLagMs >= EVENT_LOOP_LAG_UNHEALTHY_MS) return 'unhealthy';
  if (eventLoopLagMs >= EVENT_LOOP_LAG_DEGRADED_MS) return 'degraded';
  return 'healthy';
}

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

export function mapDatabaseComponent(connected: boolean, latencyMs: number | null): HealthComponent {
  return connected
    ? { status: 'healthy', checkedVia: 'local', latencyMs }
    : { status: 'unhealthy', checkedVia: 'local', latencyMs: null, reason: 'database_unreachable' };
}

/** Worker reports are considered stale (and therefore degrading) after this long without an update. */
export const WORKER_HEALTH_STALE_MS = 45_000;
/** WAL replication lag (bytes) above which the CDC component degrades. */
export const CDC_LAG_BYTES_DEGRADED = 50 * 1024 * 1024;

export interface CdcSocketSnapshot {
  cdcConnected: boolean;
  lastMessageAt: string | null;
  messagesReceived: number;
  parseErrors: number;
}

type CdcWorkerReport = CdcWorkerHealth & { receivedAt: string; ageMs: number };

/**
 * Map the CDC worker's pushed self-report (plus the backend-side socket
 * snapshot) into a component. A live socket alone never proves the data plane
 * is healthy: WAL liveness comes from the worker's `slotActive`/`lagBytes`/
 * `replicationStatus` signals, which the backend only learns via the push.
 */
export function mapCdcComponent(socket: CdcSocketSnapshot, worker: CdcWorkerReport | null): HealthComponent {
  if (!socket.cdcConnected) {
    return {
      status: 'unhealthy',
      checkedVia: 'push',
      ageMs: worker?.ageMs ?? null,
      reason: 'worker_disconnected',
      details: {
        wsConnected: false,
        lastMessageAt: socket.lastMessageAt,
        messages: socket.messagesReceived,
        parseErrors: socket.parseErrors,
      },
    };
  }

  const replication = worker?.replicationStatus ?? 'unknown';
  const slotActive = worker?.slotActive ?? null;
  const lagBytes = worker?.lagBytes ?? null;
  const stale = !worker || worker.ageMs > WORKER_HEALTH_STALE_MS;

  let status: HealthStatus = 'healthy';
  const reasons: string[] = [];
  if (stale) {
    status = worstStatus(status, 'degraded');
    reasons.push('worker_report_stale');
  }
  if (replication !== 'active') {
    status = worstStatus(status, 'degraded');
    reasons.push(`replication_${replication}`);
  }
  if (slotActive === false) {
    status = worstStatus(status, 'degraded');
    reasons.push('slot_inactive');
  }
  if (lagBytes !== null && lagBytes > CDC_LAG_BYTES_DEGRADED) {
    status = worstStatus(status, 'degraded');
    reasons.push('wal_lag_high');
  }

  return {
    status,
    checkedVia: 'push',
    ageMs: worker?.ageMs ?? null,
    reason: reasons.length ? reasons.join(',') : undefined,
    details: {
      wsConnected: true,
      replication,
      slotActive,
      lagBytes,
      lastLsn: worker?.lastLsn ?? null,
      lastEventAt: worker?.lastEventAt ?? null,
      catchingUp: worker?.catchingUp ?? null,
      messages: socket.messagesReceived,
      messagesSent: worker?.messagesSent ?? null,
      parseErrors: socket.parseErrors,
    },
  };
}

export interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  reason?: string;
  body?: Record<string, unknown> | null;
}

/**
 * Map an active probe of a worker's `/health?depth=full` into a component.
 * An unreachable worker is `unhealthy` for the component itself; the rollup
 * caps non-critical components at `degraded`.
 */
export function mapProbeComponent(
  result: ProbeResult,
  extractDetails: (body: Record<string, unknown>) => Record<string, unknown>,
): HealthComponent {
  if (!result.ok || !result.body) {
    return {
      status: 'unhealthy',
      checkedVia: 'probe',
      latencyMs: result.latencyMs,
      reason: result.reason ?? 'unreachable',
    };
  }
  const reported = result.body.status;
  const status: HealthStatus =
    reported === 'unhealthy' ? 'unhealthy' : reported === 'degraded' ? 'degraded' : 'healthy';
  return { status, checkedVia: 'probe', latencyMs: result.latencyMs, details: extractDetails(result.body) };
}
