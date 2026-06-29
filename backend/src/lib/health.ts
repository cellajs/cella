import process from 'node:process';
import { sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { getEventLoopLagMs } from 'shared/event-loop-monitor';
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
import { extractAiDetails, extractYjsDetails, probeWorker, workerUrls } from '#/lib/health-probe';

export type { HealthResponse, HealthStatus };

/** Components that reflect the backend's own ability to serve; only these can drive an `unhealthy` rollup (503). */
const CRITICAL_COMPONENTS = new Set(['api', 'database']);

/** Check database connectivity with a timed `SELECT 1`. */
async function checkDatabase(): Promise<{ connected: boolean; latencyMs: number | null }> {
  // No DB when NODB is set
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
  return mapCdcComponent(
    {
      cdcConnected: socket.cdcConnected,
      lastMessageAt: socket.lastMessageAt,
      messagesReceived: socket.messagesReceived,
      parseErrors: socket.parseErrors,
    },
    worker,
  );
}

/** Build the ai worker's own component (self-check) when this process IS the ai worker. */
async function buildAiSelfComponent(): Promise<HealthComponent> {
  const mode = env.SCW_AI_API_KEY ? 'active' : 'noop';
  if (mode === 'noop') return { status: 'healthy', checkedVia: 'local', details: { mode, queueDepth: 0 } };

  try {
    const { getQueueDepth } = await import('#/lib/pg-boss');
    const queueDepth = await getQueueDepth();
    return { status: 'healthy', checkedVia: 'local', details: { mode, queueDepth } };
  } catch {
    return {
      status: 'degraded',
      checkedVia: 'local',
      reason: 'queue_unavailable',
      details: { mode, queueDepth: null },
    };
  }
}

/**
 * Aggregate a structured, wide health report.
 *
 * Every dependency and sibling worker is a uniform `component` keyed by name.
 * The api process grades its own runtime (`api`), checks the database, watches
 * the pushed CDC report, and actively probes the yjs/ai workers. The ai worker
 * process reports its own queue depth instead of probing itself.
 */
export async function getHealthResponse(): Promise<{ response: HealthResponse; httpStatus: number }> {
  const components: Record<string, HealthComponent> = {};

  const dbCheck = await checkDatabase();
  components.api = { ...mapApiComponent(getEventLoopLagMs(), process.memoryUsage()), label: 'API' };
  components.database = { ...mapDatabaseComponent(dbCheck.connected, dbCheck.latencyMs), label: 'Database' };

  if (env.MODE === 'ai-worker') {
    components.ai = { ...(await buildAiSelfComponent()), label: 'AI' };
  } else {
    if (appConfig.services.cdc.enabled !== false) components.cdc = { ...buildCdcComponent(), label: 'CDC' };

    const workerChecks = await Promise.all([
      appConfig.services.yjs.enabled !== false
        ? probeWorker(workerUrls.yjs).then(
            (result) => ['yjs', { ...mapProbeComponent(result, extractYjsDetails), label: 'YJS' }] as const,
          )
        : Promise.resolve(null),
      appConfig.services.ai.enabled !== false
        ? probeWorker(workerUrls.ai).then(
            (result) => ['ai', { ...mapProbeComponent(result, extractAiDetails), label: 'AI' }] as const,
          )
        : Promise.resolve(null),
    ]);

    for (const workerCheck of workerChecks) {
      if (!workerCheck) continue;
      const [name, component] = workerCheck;
      components[name] = component;
    }
  }

  const status = rollupStatus(components, CRITICAL_COMPONENTS);
  const response: HealthResponse = { status, uptime: Math.floor(process.uptime()), components };
  const httpStatus = status === 'unhealthy' ? 503 : 200;
  return { response, httpStatus };
}
