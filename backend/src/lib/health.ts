import process from 'node:process';
import { sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { getEventLoopLagMs } from 'shared/utils/event-loop-monitor';
import { baseDb } from '#/db/db';
import { env } from '#/env';
import { cdcWebSocketServer } from '#/lib/cdc-websocket';
import {
  type HealthComponent,
  type HealthResponse,
  type HealthStatus,
  mapApiComponent,
  mapCdcComponent,
  mapDatabaseComponent,
  mapProbeComponent,
  rollupStatus,
} from '#/lib/health-helpers';
import { extractMcpDetails, extractYjsDetails, probeWorker, workerUrls } from '#/lib/health-probe';
import { mapJobsComponent, readJobsHealth } from '#/lib/jobs-health';
import { getBackendJobs } from '#/lib/module';

export type { HealthResponse, HealthStatus };

/** Components that reflect the backend's own ability to serve; only these can drive an `unhealthy` rollup (503). */
const CRITICAL_COMPONENTS = new Set(['api', 'database']);

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

/** Build the CDC component from the backend-side socket snapshot + the worker's pushed self-report. */
function buildCdcComponent(): HealthComponent {
  const socket = cdcWebSocketServer.getHealthStatus();
  const report = cdcWebSocketServer.getWorkerHealth();
  const worker = report
    ? {
        ...report.payload,
        receivedAt: report.receivedAt.toISOString(),
        ageMs: Date.now() - report.receivedAt.getTime(),
      }
    : null;
  const component = mapCdcComponent(
    {
      cdcConnected: socket.cdcConnected,
      lastMessageAt: socket.lastMessageAt,
      messagesReceived: socket.messagesReceived,
      parseErrors: socket.parseErrors,
    },
    worker,
  );
  const lagAlert = cdcWebSocketServer.getLastLagAlert();
  return lagAlert ? { ...component, details: { ...component.details, lagAlert } } : component;
}

/** Build the mcp worker's own component (self-check) when this process IS the mcp worker. */
function buildMcpSelfComponent(): HealthComponent {
  const mode = env.SCW_AI_API_KEY ? 'active' : 'noop';
  return { status: 'healthy', checkedVia: 'local', details: { mode } };
}

/** The job store as read from the database: the api process and the jobs service report the same component. */
async function buildJobsComponent(): Promise<HealthComponent> {
  try {
    return mapJobsComponent(await readJobsHealth(), getBackendJobs().length > 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'degraded', checkedVia: 'local', reason: 'jobs_unreadable', details: { error: message } };
  }
}

/**
 * Aggregates every dependency and sibling worker into a uniform `component` keyed by name. The api process grades
 * itself, checks the database, reads the pushed CDC report, probes yjs/mcp and reads the job store; the mcp worker
 * reports itself, the jobs service reports the store.
 */
export async function getHealthResponse(): Promise<{ response: HealthResponse; httpStatus: number }> {
  const components: Record<string, HealthComponent> = {};

  const dbCheck = await checkDatabase();
  components.api = { ...mapApiComponent(getEventLoopLagMs(), process.memoryUsage()), label: 'API' };
  components.database = { ...mapDatabaseComponent(dbCheck.connected, dbCheck.latencyMs), label: 'Database' };

  if (env.MODE === 'mcp') {
    components.mcp = { ...buildMcpSelfComponent(), label: 'MCP' };
  } else if (env.MODE === 'jobs') {
    components.jobs = { ...(await buildJobsComponent()), label: 'Jobs' };
  } else {
    if (appConfig.services.cdc.enabled !== false) components.cdc = { ...buildCdcComponent(), label: 'CDC' };

    const workerChecks = await Promise.all([
      appConfig.services.yjs.enabled !== false
        ? probeWorker(workerUrls.yjs).then(
            (result) => ['yjs', { ...mapProbeComponent(result, extractYjsDetails), label: 'YJS' }] as const,
          )
        : Promise.resolve(null),
      appConfig.services.mcp.enabled !== false
        ? probeWorker(workerUrls.mcp).then(
            (result) => ['mcp', { ...mapProbeComponent(result, extractMcpDetails), label: 'MCP' }] as const,
          )
        : Promise.resolve(null),
    ]);

    for (const workerCheck of workerChecks) {
      if (!workerCheck) continue;
      const [name, component] = workerCheck;
      components[name] = component;
    }

    if (appConfig.services.jobs.enabled !== false) components.jobs = { ...(await buildJobsComponent()), label: 'Jobs' };
  }

  const status = rollupStatus(components, CRITICAL_COMPONENTS);
  const response: HealthResponse = { status, uptime: Math.floor(process.uptime()), components };
  const httpStatus = status === 'unhealthy' ? 503 : 200;
  return { response, httpStatus };
}
