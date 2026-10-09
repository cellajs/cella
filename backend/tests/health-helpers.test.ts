import { describe, expect, it } from 'vitest';
import type { CdcWorkerHealth } from '#/lib/cdc-websocket';
import {
  type CdcSocketSnapshot,
  type CdcWorkerReport,
  gradeEventLoop,
  mapApiComponent,
  mapCdcComponent,
  mapDatabaseComponent,
  mapProbeComponent,
  type ProbeResult,
  rollupStatus,
  WORKER_HEALTH_STALE_MS,
  worstStatus,
} from '#/lib/health-helpers';

const connectedSocket: CdcSocketSnapshot = { cdcConnected: true, lastMessageAt: null, messagesReceived: 10, parseErrors: 0 };

/** A report the worker pushed a second ago, with its own grade. */
function report(health: Partial<CdcWorkerHealth> = {}, ageMs = 1000): CdcWorkerReport {
  return { health: { status: 'healthy', reasons: [], details: {}, generation: 1, ...health }, ageMs };
}

describe('worstStatus', () => {
  it('returns the higher-severity status', () => {
    expect(worstStatus('healthy', 'degraded')).toBe('degraded');
    expect(worstStatus('unhealthy', 'degraded')).toBe('unhealthy');
    expect(worstStatus('healthy', 'healthy')).toBe('healthy');
  });
});

describe('rollupStatus', () => {
  const critical = new Set(['api', 'database']);

  it('is healthy when all components are healthy', () => {
    expect(rollupStatus({ api: { status: 'healthy' }, yjs: { status: 'healthy' } }, critical)).toBe('healthy');
  });

  it('lets a critical component drive unhealthy', () => {
    expect(rollupStatus({ database: { status: 'unhealthy' } }, critical)).toBe('unhealthy');
  });

  it('caps a non-critical unhealthy component at degraded', () => {
    expect(rollupStatus({ cdc: { status: 'unhealthy' } }, critical)).toBe('degraded');
    expect(rollupStatus({ yjs: { status: 'unhealthy' }, mcp: { status: 'unhealthy' } }, critical)).toBe('degraded');
  });
});

describe('gradeEventLoop', () => {
  it('grades by lag thresholds', () => {
    expect(gradeEventLoop(5)).toBe('healthy');
    expect(gradeEventLoop(100)).toBe('degraded');
    expect(gradeEventLoop(1000)).toBe('unhealthy');
  });
});

describe('mapApiComponent', () => {
  it('reports memory in MB and grades the event loop', () => {
    const memory = { rss: 400 * 1024 * 1024, heapUsed: 180 * 1024 * 1024, heapTotal: 256 * 1024 * 1024 } as NodeJS.MemoryUsage;
    const component = mapApiComponent(8, memory);
    expect(component.status).toBe('healthy');
    expect(component.checkedVia).toBe('local');
    expect(component.details).toMatchObject({ eventLoopLagMs: 8, rssMb: 400, heapUsedMb: 180, heapTotalMb: 256 });
  });
});

describe('mapDatabaseComponent', () => {
  it('is healthy with a latency when connected', () => {
    expect(mapDatabaseComponent(true, 3)).toMatchObject({ status: 'healthy', latencyMs: 3 });
  });

  it('is unhealthy when disconnected', () => {
    expect(mapDatabaseComponent(false, null)).toMatchObject({ status: 'unhealthy', reason: 'database_unreachable' });
  });
});

describe('mapCdcComponent', () => {
  it('is unhealthy when the worker socket is disconnected', () => {
    const c = mapCdcComponent({ ...connectedSocket, cdcConnected: false, lastMessageAt: '2026-10-09T10:00:00.000Z' }, null);

    expect(c).toEqual({
      status: 'unhealthy',
      checkedVia: 'push',
      ageMs: null,
      reason: 'worker_disconnected',
      details: { wsConnected: false, lastMessageAt: '2026-10-09T10:00:00.000Z', messages: 10, parseErrors: 0 },
    });
  });

  it('degrades while a connected worker has not reported yet', () => {
    const c = mapCdcComponent(connectedSocket, null);

    expect(c).toMatchObject({ status: 'degraded', ageMs: null, reason: 'worker_report_stale' });
    expect(c.details).toEqual({ wsConnected: true, messages: 10, parseErrors: 0 });
  });

  it('degrades on a report older than 45 seconds, and still shows what it said', () => {
    const fresh = mapCdcComponent(connectedSocket, report({ details: { lagBytes: 12 } }, WORKER_HEALTH_STALE_MS));
    const stale = mapCdcComponent(connectedSocket, report({ details: { lagBytes: 12 } }, WORKER_HEALTH_STALE_MS + 1));

    expect(fresh.status).toBe('healthy');
    expect(fresh.reason).toBeUndefined();
    expect(stale).toMatchObject({ status: 'degraded', reason: 'worker_report_stale', ageMs: WORKER_HEALTH_STALE_MS + 1 });
    expect(stale.details).toMatchObject({ lagBytes: 12 });
  });

  it('must not grade a stale report better than the worker did', () => {
    const c = mapCdcComponent(connectedSocket, report({ status: 'unhealthy', reasons: ['worker_stuck'] }, WORKER_HEALTH_STALE_MS + 1));

    expect(c).toMatchObject({ status: 'unhealthy', reason: 'worker_report_stale,worker_stuck' });
  });

  it('degrades on a report it cannot read, as a worker of another release sends during a deploy', () => {
    const c = mapCdcComponent(connectedSocket, { health: null, ageMs: 1000 });

    expect(c).toMatchObject({ status: 'degraded', ageMs: 1000, reason: 'worker_report_unreadable' });
    expect(c.details).toEqual({ wsConnected: true, messages: 10, parseErrors: 0 });
  });

  it("passes a healthy report on with the worker's details beside the API's own counts", () => {
    const details = { replication: 'active', lastLsn: '0/1', lagBytes: 0, messages: 999 };
    const c = mapCdcComponent(connectedSocket, report({ details }));

    expect(c).toEqual({
      status: 'healthy',
      checkedVia: 'push',
      ageMs: 1000,
      reason: undefined,
      // What the API counted itself is not the worker's to report.
      details: { wsConnected: true, replication: 'active', lastLsn: '0/1', lagBytes: 0, messages: 10, parseErrors: 0 },
    });
  });

  it("passes a degraded report on with both of the worker's reasons", () => {
    const c = mapCdcComponent(connectedSocket, report({ status: 'degraded', reasons: ['reading_again', 'wal_lag_high'] }));

    expect(c).toMatchObject({ status: 'degraded', reason: 'reading_again,wal_lag_high' });
  });

  it('passes an unhealthy report of a stuck worker on, with the failure it reads again from', () => {
    const failure = { position: '0/50', count: 5, error: 'null value in column "organization_id"', passing: false };
    const c = mapCdcComponent(connectedSocket, report({ status: 'unhealthy', reasons: ['worker_stuck'], details: { failure } }));

    // A deploy that ends on a stuck worker must fail its smoke step, not warn: nothing is read until the rebuild.
    expect(c).toMatchObject({ status: 'unhealthy', reason: 'worker_stuck' });
    expect(c.details?.failure).toEqual(failure);
  });

  it("must not grade the worker's facts a second time: the grade is the worker's alone", () => {
    const details = { replication: 'stopped', slotActive: false, lagBytes: 2 ** 40, setupProblems: ['publication lacks a table'], stuck: true };
    const c = mapCdcComponent(connectedSocket, report({ details }));

    expect(c.status).toBe('healthy');
    expect(c.reason).toBeUndefined();
  });
});

describe('mapProbeComponent', () => {
  const extract = (body: Record<string, unknown>) => ({ connections: body.connections ?? null });

  it('maps a healthy probe', () => {
    const result: ProbeResult = { ok: true, latencyMs: 12, body: { status: 'healthy', connections: 3 } };
    const c = mapProbeComponent(result, extract);
    expect(c.status).toBe('healthy');
    expect(c.checkedVia).toBe('probe');
    expect(c.details).toMatchObject({ connections: 3 });
  });

  it('reflects a degraded body', () => {
    const result: ProbeResult = { ok: true, latencyMs: 12, body: { status: 'degraded' } };
    expect(mapProbeComponent(result, extract).status).toBe('degraded');
  });

  it('is unhealthy when unreachable', () => {
    const result: ProbeResult = { ok: false, latencyMs: 2000, reason: 'timeout' };
    const c = mapProbeComponent(result, extract);
    expect(c.status).toBe('unhealthy');
    expect(c.reason).toBe('timeout');
  });
});
