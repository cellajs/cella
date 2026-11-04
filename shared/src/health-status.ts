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

/** Severity order of the statuses: a higher rank is worse. */
export const statusRank: Record<HealthStatus, number> = { healthy: 0, degraded: 1, unhealthy: 2 };

/** Return the worse (higher-severity) of two statuses. */
export function worstStatus(a: HealthStatus, b: HealthStatus): HealthStatus {
  return statusRank[a] >= statusRank[b] ? a : b;
}
