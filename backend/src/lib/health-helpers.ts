import type { CdcWorkerHealth } from '#/lib/cdc-websocket';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/** One service or dependency in the health envelope: `status` grades it, the open `details` bag diagnoses it. */
export interface HealthComponent {
  status: HealthStatus;
  /** How the status was obtained: `local` self-check, worker `push`, or active `probe`. */
  checkedVia?: 'local' | 'push' | 'probe';
  /** Age of the underlying data (ms), set for pushed/cached reports. */
  ageMs?: number | null;
  /** Round-trip latency of the check (ms), set for db/probe checks. */
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

/** Only critical components reach `unhealthy`; others cap at `degraded` so a flaky worker keeps the API registered. */
export function rollupStatus(components: Record<string, HealthComponent>, criticalComponents: Set<string>): HealthStatus {
  let result: HealthStatus = 'healthy';
  for (const [name, component] of Object.entries(components)) {
    const capped = criticalComponents.has(name) || component.status !== 'unhealthy' ? component.status : 'degraded';
    result = worstStatus(result, capped);
  }
  return result;
}

const EVENT_LOOP_LAG_DEGRADED_MS = 100;
const EVENT_LOOP_LAG_UNHEALTHY_MS = 1_000;

/** Grade a Node service's own runtime from event-loop lag. */
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
 * adds only what the worker cannot tell: no socket (`worker_disconnected`), no report within 45 seconds
 * (`worker_report_stale`), or one it cannot read (`worker_report_unreadable`). The last two degrade at least, and a
 * stale report still shows what it said.
 * @param socket - The worker socket as the API holds it.
 * @param worker - The worker's latest report, or null when none arrived on this connection.
 * @returns The component for the health response.
 */
export function mapCdcComponent(socket: CdcSocketSnapshot, worker: CdcWorkerReport | null): HealthComponent {
  const counts = { messages: socket.messagesReceived, parseErrors: socket.parseErrors };
  const ageMs = worker?.ageMs ?? null;

  if (!socket.cdcConnected) {
    const details = { wsConnected: false, lastMessageAt: socket.lastMessageAt, ...counts };
    return { status: 'unhealthy', checkedVia: 'push', ageMs, reason: 'worker_disconnected', details };
  }

  const health = worker?.health ?? null;
  const stale = !worker || worker.ageMs > WORKER_HEALTH_STALE_MS;
  const ownReason = stale ? 'worker_report_stale' : health ? null : 'worker_report_unreadable';
  const reasons = [...(ownReason ? [ownReason] : []), ...(health?.reasons ?? [])];

  return {
    status: worstStatus(health?.status ?? 'degraded', ownReason ? 'degraded' : 'healthy'),
    checkedVia: 'push',
    ageMs,
    reason: reasons.length ? reasons.join(',') : undefined,
    details: { wsConnected: true, ...health?.details, ...counts },
  };
}

export interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  reason?: string;
  body?: Record<string, unknown> | null;
}

/** Maps an active probe of a worker's `/health?depth=full`; an unreachable worker is `unhealthy` here. */
export function mapProbeComponent(result: ProbeResult, extractDetails: (body: Record<string, unknown>) => Record<string, unknown>): HealthComponent {
  if (!result.ok || !result.body) {
    return { status: 'unhealthy', checkedVia: 'probe', latencyMs: result.latencyMs, reason: result.reason ?? 'unreachable' };
  }
  const reported = result.body.status;
  const status: HealthStatus = reported === 'unhealthy' ? 'unhealthy' : reported === 'degraded' ? 'degraded' : 'healthy';
  return { status, checkedVia: 'probe', latencyMs: result.latencyMs, details: extractDetails(result.body) };
}
