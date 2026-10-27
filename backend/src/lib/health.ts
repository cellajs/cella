import process from 'node:process';
import { sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { createHealthApp } from 'shared/health-app';
import { getEventLoopLagMs } from 'shared/utils/event-loop-monitor';
import { baseDb } from '#/db/db';
import { env } from '#/env';
import { cdcWebSocketServer } from '#/lib/cdc-websocket';
import {
  type HealthComponent,
  type HealthResponse,
  mapApiComponent,
  mapCdcComponent,
  mapDatabaseComponent,
  mapProbeComponent,
  rollupStatus,
} from '#/lib/health-helpers';
import { probedWorkers, probeWorker } from '#/lib/health-probe';
import { mapJobsComponent, readJobsHealth } from '#/lib/jobs-health';
import { getBackendJobs } from '#/lib/module';
import { log } from '#/utils/logger';

/** Components that reflect the process's own ability to serve; only these can drive an `unhealthy` rollup (503). */
const criticalComponents = new Set(['api', 'database']);

/** Check database connectivity with a timed `SELECT 1`. */
async function checkDatabase(): Promise<{ connected: boolean; latencyMs: number | null }> {
  if (env.NODB) return { connected: false, latencyMs: null };

  const startedAt = Date.now();
  try {
    await baseDb.execute(sql`SELECT 1`);
    return { connected: true, latencyMs: Date.now() - startedAt };
  } catch {
    return { connected: false, latencyMs: null };
  }
}

/** The CDC component: the worker socket as this process holds it, and the grade the worker pushed over it. */
function buildCdcComponent(): HealthComponent {
  const report = cdcWebSocketServer.getWorkerHealth();
  const worker = report && { health: report.health, ageMs: Date.now() - report.receivedAt.getTime() };
  return mapCdcComponent(cdcWebSocketServer.getHealthStatus(), worker);
}

/** Build the mcp worker's own component (self-check) when this process IS the mcp worker. */
function buildMcpSelfComponent(): HealthComponent {
  const mode = env.SCW_AI_API_KEY ? 'active' : 'noop';
  return { status: 'healthy', checkedVia: 'local', details: { mode } };
}

/** The job store as read from the database: the api process and the jobs worker report the same component. */
async function buildJobsComponent(): Promise<HealthComponent> {
  try {
    return mapJobsComponent(await readJobsHealth(), getBackendJobs().length > 0);
  } catch (err) {
    // The diagnostics are public, and a failed query's message can carry its SQL: the log keeps it, redacted.
    log.error('Reading the job store for health failed', { err });
    return { status: 'degraded', checkedVia: 'local', reason: 'jobs_unreadable' };
  }
}

/**
 * Aggregates every dependency and sibling worker into a uniform `component` keyed by name. The api process grades
 * itself, checks the database, reads the pushed CDC report, probes yjs/mcp/oauth and reads the job store; the mcp
 * worker grades the same two and reports itself; the jobs worker grades itself, the database and the store.
 */
async function getHealthResponse(): Promise<{ response: HealthResponse; httpStatus: number }> {
  const components: Record<string, HealthComponent> = {};

  const dbCheck = await checkDatabase();
  components.api = mapApiComponent(getEventLoopLagMs(), process.memoryUsage());
  components.database = mapDatabaseComponent(dbCheck.connected, dbCheck.latencyMs);

  if (env.MODE === 'mcp') {
    components.mcp = buildMcpSelfComponent();
  } else if (env.MODE === 'jobs') {
    components.jobs = await buildJobsComponent();
  } else {
    if (appConfig.services.cdc.enabled !== false) components.cdc = buildCdcComponent();

    const enabledWorkers = probedWorkers.filter(({ name }) => appConfig.services[name].enabled !== false);
    const workerChecks = await Promise.all(
      enabledWorkers.map(async ({ name, url, details }) => [name, mapProbeComponent(await probeWorker(url), details)] as const),
    );
    for (const [name, component] of workerChecks) components[name] = component;

    if (appConfig.services.jobs.enabled !== false) components.jobs = await buildJobsComponent();
  }

  const status = rollupStatus(components, criticalComponents);
  const response: HealthResponse = { status, uptime: Math.floor(process.uptime()), components };
  const httpStatus = status === 'unhealthy' ? 503 : 200;
  return { response, httpStatus };
}

/**
 * The health routes of both listeners, built once: `GET /health` answers 204 and `?depth=full` the diagnostics above
 * (503 when a critical component is unhealthy), both with the release SHA the load balancer contract requires.
 */
export const healthApp = createHealthApp({
  version: env.RELEASE_SHA,
  full: async () => {
    const { response, httpStatus } = await getHealthResponse();
    return { httpStatus, body: { ...response, version: env.RELEASE_SHA } };
  },
});
