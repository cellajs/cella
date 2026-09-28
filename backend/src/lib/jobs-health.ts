import { sql } from 'drizzle-orm';
import { baseDb } from '#/db/db';
import { env } from '#/env';
import type { HealthComponent, HealthStatus } from '#/lib/health-helpers';
import { JOBS_SCHEMA } from '#/lib/pg-boss';

/** The maintainer stamps `cron_on` every half minute; older than this and no process is scheduling. */
export const CRON_STALE_MS = 5 * 60 * 1000;

export interface JobsQueueHealth {
  name: string;
  policy: string;
  queued: number;
  active: number;
  /** Failed runs completed in the last hour (a rolling window, bounded by retention). */
  failedLastHour: number;
  /** Age in ms of the oldest job still waiting, null when nothing waits. */
  oldestQueuedAgeMs: number | null;
  /** Queued jobs the maintainer warns above; pg-boss's default when the queue sets none. */
  warningQueueSize: number | null;
  /** Depth of this queue's dead-letter queue, null when it has none. */
  deadLetterDepth: number | null;
}

export interface JobsHealthSnapshot {
  installed: boolean;
  schema: string;
  cronOn: string | null;
  cronAgeMs: number | null;
  queues: JobsQueueHealth[];
}

interface QueueRow extends Record<string, unknown> {
  name: string;
  policy: string;
  dead_letter: string | null;
  warning_queued: number | null;
  queued: number;
  active: number;
  failed_last_hour: number;
  oldest_queued_on: Date | null;
}

/**
 * Reads the job store directly, so the API reports it without reaching the jobs service: live
 * counts per queue (pg-boss's internal queues left out) and the scheduler's last pass. Works for any role with read access to
 * the schema; an absent schema (before the first migrate) reads as not installed.
 */
export async function readJobsHealth(): Promise<JobsHealthSnapshot> {
  const schema = sql.raw(JOBS_SCHEMA);
  const empty: JobsHealthSnapshot = {
    installed: false,
    schema: JOBS_SCHEMA,
    cronOn: null,
    cronAgeMs: null,
    queues: [],
  };
  if (env.NODB) return empty;

  const { rows: versions } = await baseDb.execute<{ cron_on: Date | null }>(sql`
    SELECT v.cron_on FROM pg_namespace n
    LEFT JOIN LATERAL (SELECT cron_on FROM ${schema}.version LIMIT 1) v ON true
    WHERE n.nspname = ${JOBS_SCHEMA}`);
  const version = versions[0];
  if (!version) return empty;

  const { rows } = await baseDb.execute<QueueRow>(sql`
    SELECT q.name, q.policy, q.dead_letter, q.warning_queued,
      COALESCE(j.queued, 0)::int AS queued,
      COALESCE(j.active, 0)::int AS active,
      COALESCE(j.failed_last_hour, 0)::int AS failed_last_hour,
      j.oldest_queued_on
    FROM ${schema}.queue q
    LEFT JOIN (
      SELECT name,
        count(*) FILTER (WHERE state < 'active') AS queued,
        count(*) FILTER (WHERE state = 'active') AS active,
        count(*) FILTER (WHERE state = 'failed' AND completed_on > now() - interval '1 hour') AS failed_last_hour,
        min(created_on) FILTER (WHERE state < 'active') AS oldest_queued_on
      FROM ${schema}.job GROUP BY name
    ) j ON j.name = q.name
    WHERE q.name NOT LIKE '\\_\\_pgboss\\_\\_%'
    ORDER BY q.name`);

  const now = Date.now();
  const queuedByName = new Map(rows.map((row) => [row.name, row.queued]));
  const queues = rows.map<JobsQueueHealth>((row) => ({
    name: row.name,
    policy: row.policy,
    queued: row.queued,
    active: row.active,
    failedLastHour: row.failed_last_hour,
    oldestQueuedAgeMs: row.oldest_queued_on ? now - new Date(row.oldest_queued_on).getTime() : null,
    warningQueueSize: row.warning_queued,
    deadLetterDepth: row.dead_letter ? (queuedByName.get(row.dead_letter) ?? 0) : null,
  }));
  const cronOn = version.cron_on ? new Date(version.cron_on) : null;
  return {
    installed: true,
    schema: JOBS_SCHEMA,
    cronOn: cronOn?.toISOString() ?? null,
    cronAgeMs: cronOn ? now - cronOn.getTime() : null,
    queues,
  };
}

/**
 * Grades the store: degraded when nothing schedules (no maintainer up, or none since install),
 * when a queue backs up past its warning size, or when dead letters wait for an operator. Never
 * unhealthy: sweeps and deliveries tolerate minutes of delay, and a cutover must not wait on them.
 * @param expectsCron - Whether any cron job is declared, so an idle store without jobs stays healthy.
 */
export function mapJobsComponent(snapshot: JobsHealthSnapshot, expectsCron: boolean): HealthComponent {
  const reasons: string[] = [];
  let status: HealthStatus = 'healthy';
  if (!snapshot.installed) {
    return {
      status: 'degraded',
      checkedVia: 'local',
      reason: 'jobs_not_installed',
      details: { schema: snapshot.schema, queues: [] },
    };
  }
  if (expectsCron && (snapshot.cronAgeMs === null || snapshot.cronAgeMs > CRON_STALE_MS)) {
    status = 'degraded';
    reasons.push('cron_stale');
  }
  if (snapshot.queues.some((queue) => queue.warningQueueSize !== null && queue.queued > queue.warningQueueSize)) {
    status = 'degraded';
    reasons.push('queue_backlog');
  }
  if (snapshot.queues.some((queue) => (queue.deadLetterDepth ?? 0) > 0)) {
    status = 'degraded';
    reasons.push('dead_letters');
  }
  return {
    status,
    checkedVia: 'local',
    ageMs: snapshot.cronAgeMs,
    reason: reasons.length ? reasons.join(',') : undefined,
    details: { schema: snapshot.schema, cronOn: snapshot.cronOn, queues: snapshot.queues },
  };
}
