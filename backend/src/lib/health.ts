import process from 'node:process';
import { appConfig } from 'shared';
import { createHealthApp, type FullHealth } from 'shared/health-app';
import { getEventLoopLagMs } from 'shared/utils/event-loop-monitor';
import { isPool } from '#/db/create-connection';
import { baseDb } from '#/db/db';
import { databaseAnswers } from '#/db/driver-client';
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
import { TTLCache } from '#/lib/ttl-cache';
import { log } from '#/utils/logger';

/** The database check for 5 s, concurrent requests sharing one: each opens a connection, and the answer is public. */
const databaseCache = new TTLCache<{ connected: boolean; latencyMs: number | null }>({ maxSize: 1, defaultTtl: 5_000 });

/** Checks that the database answers, on a connection of its own: a frozen server is unreachable within the ask's deadline. */
function checkDatabase(): Promise<{ connected: boolean; latencyMs: number | null }> {
  const pool: unknown = baseDb.$client;
  if (env.NODB || !isPool(pool)) return Promise.resolve({ connected: false, latencyMs: null });
  return databaseCache.load('database', async () => {
    const startedAt = Date.now();
    const connected = await databaseAnswers(pool.options);
    return { connected, latencyMs: connected ? Date.now() - startedAt : null };
  });
}

/** The CDC component: the worker socket as this process holds it, and the grade the worker pushed over it. */
function buildCdcComponent(): HealthComponent {
  const report = cdcWebSocketServer.getWorkerHealth();
  const worker = report && { health: report.health, ageMs: Date.now() - report.receivedAt.getTime() };
  return mapCdcComponent(cdcWebSocketServer.getHealthStatus(), worker);
}

/** The jobs component for 10 s, concurrent requests sharing one read: the aggregate scans the whole job table and the answer is public. */
const jobsCache = new TTLCache<HealthComponent>({ maxSize: 1, defaultTtl: 10_000 });

/** Forgets the cached jobs component, so a test reads the store again. */
export const clearJobsHealthCache = () => jobsCache.clear();

const buildJobsComponent = () => jobsCache.load('jobs', readJobsComponent);

const jobsUnreadable: HealthComponent = { status: 'degraded', checkedVia: 'local', reason: 'jobs_unreadable' };

/** The api process and the jobs worker report the same component. */
async function readJobsComponent(): Promise<HealthComponent> {
  try {
    return mapJobsComponent(await readJobsHealth(), getBackendJobs().length > 0);
  } catch (err) {
    // The diagnostics are public, and a failed query's message can carry its SQL: the log keeps it, redacted.
    log.error('Reading the job store for health failed', { err });
    return jobsUnreadable;
  }
}

/**
 * Aggregates every dependency and sibling worker into a uniform `component` keyed by name. The api process grades
 * itself, checks the database, reads the pushed CDC report, probes yjs/mcp/oauth and reads the job store; the mcp
 * worker grades the same two; the jobs worker grades itself, the database and the store.
 */
async function getHealthResponse(): Promise<{ response: HealthResponse; httpStatus: FullHealth['httpStatus'] }> {
  const components: Record<string, HealthComponent> = {};

  const dbCheck = await checkDatabase();
  components.api = mapApiComponent(getEventLoopLagMs(), process.memoryUsage());
  components.database = mapDatabaseComponent(dbCheck.connected, dbCheck.latencyMs);
  // The job store lives in the database: unread while it does not answer, where its read would wait out the pool.
  const readJobs = () => (dbCheck.connected ? buildJobsComponent() : jobsUnreadable);

  if (env.SERVICE === 'jobs') {
    components.jobs = await readJobs();
  } else if (env.SERVICE !== 'mcp') {
    if (appConfig.services.cdc.enabled) components.cdc = buildCdcComponent();

    // Folded under singleVM, the mcp listener answers with this health app: probing it would run this aggregate again.
    const enabledWorkers = probedWorkers.filter(({ name }) => appConfig.services[name].enabled && !(name === 'mcp' && appConfig.singleVM));
    const workerChecks = await Promise.all(
      enabledWorkers.map(async ({ name, url, details }) => [name, mapProbeComponent(await probeWorker(url), details)] as const),
    );
    for (const [name, component] of workerChecks) components[name] = component;

    if (appConfig.services.jobs.enabled) components.jobs = await readJobs();
  }

  const status = rollupStatus(components);
  const response: HealthResponse = { status, uptime: Math.floor(process.uptime()), components };
  const httpStatus = status === 'unhealthy' ? 503 : 200;
  return { response, httpStatus };
}

/**
 * The health routes of both listeners, built once: `GET /health` answers 204 and `?depth=full` the diagnostics above
 * (503 when any component is unhealthy), both with the release SHA the load balancer contract requires.
 */
export const healthApp = createHealthApp({
  version: env.RELEASE_SHA,
  full: async () => {
    const { response, httpStatus } = await getHealthResponse();
    return { httpStatus, body: { ...response, version: env.RELEASE_SHA } };
  },
});
