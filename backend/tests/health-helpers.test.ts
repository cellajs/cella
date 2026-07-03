import { describe, expect, it } from 'vitest';
import {
  CDC_LAG_BYTES_DEGRADED,
  type CdcSocketSnapshot,
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

const connectedSocket: CdcSocketSnapshot = {
  cdcConnected: true,
  lastMessageAt: null,
  messagesReceived: 10,
  parseErrors: 0,
};

function worker(overrides: Record<string, unknown> = {}) {
  return {
    replicationStatus: 'active',
    lastLsn: '0/1',
    messagesSent: 5,
    slotActive: true,
    lagBytes: 0,
    lastEventAt: new Date().toISOString(),
    catchingUp: false,
    receivedAt: new Date().toISOString(),
    ageMs: 1000,
    ...overrides,
  };
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
    const memory = {
      rss: 400 * 1024 * 1024,
      heapUsed: 180 * 1024 * 1024,
      heapTotal: 256 * 1024 * 1024,
    } as NodeJS.MemoryUsage;
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
    const c = mapCdcComponent({ ...connectedSocket, cdcConnected: false }, null);
    expect(c.status).toBe('unhealthy');
    expect(c.reason).toBe('worker_disconnected');
    expect(c.details).toMatchObject({ wsConnected: false });
  });

  it('is healthy when active, slot active, and lag is low', () => {
    const c = mapCdcComponent(connectedSocket, worker());
    expect(c.status).toBe('healthy');
    expect(c.reason).toBeUndefined();
    expect(c.details).toMatchObject({ wsConnected: true, replication: 'active', slotActive: true });
  });

  it('degrades on a stale worker report', () => {
    const c = mapCdcComponent(connectedSocket, worker({ ageMs: WORKER_HEALTH_STALE_MS + 1 }));
    expect(c.status).toBe('degraded');
    expect(c.reason).toContain('worker_report_stale');
  });

  it('degrades when replication is not active', () => {
    const c = mapCdcComponent(connectedSocket, worker({ replicationStatus: 'paused' }));
    expect(c.status).toBe('degraded');
    expect(c.reason).toContain('replication_paused');
  });

  it('degrades when the slot is inactive', () => {
    const c = mapCdcComponent(connectedSocket, worker({ slotActive: false }));
    expect(c.status).toBe('degraded');
    expect(c.reason).toContain('slot_inactive');
  });

  it('degrades when WAL lag is high', () => {
    const c = mapCdcComponent(connectedSocket, worker({ lagBytes: CDC_LAG_BYTES_DEGRADED + 1 }));
    expect(c.status).toBe('degraded');
    expect(c.reason).toContain('wal_lag_high');
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
