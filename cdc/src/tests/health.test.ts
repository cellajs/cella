import { beforeEach, describe, expect, it, vi } from 'vitest';

/** What the grade reads outside the worker's own state: the socket, the last poll of the slot, the event loop. */
const world = vi.hoisted(() => ({
  apiAwaySince: null as Date | null,
  slotActive: null as boolean | null,
  slotStatus: null as string | null,
  lagBytes: null as number | null,
  eventLoopLagMs: 0,
}));

vi.mock('../network/websocket-client', () => ({
  wsClient: {
    isConnected: () => world.apiAwaySince === null,
    state: 'open',
    messagesSent: 7,
    lastMessageAt: null,
    get apiAwaySince() {
      return world.apiAwaySince;
    },
  },
}));

vi.mock('../services/cdc-metrics', () => ({
  metrics: {
    get slotActive() {
      return world.slotActive;
    },
    get slotStatus() {
      return world.slotStatus;
    },
    get lagBytes() {
      return world.lagBytes;
    },
    getSnapshot: () => ({ throughput: 12.5, processingLatency: { p95: 3 } }),
  },
}));

vi.mock('shared/utils/event-loop-monitor', () => ({ getEventLoopLagMs: () => world.eventLoopLagMs }));

import { RESOURCE_LIMITS } from '../constants';
import { getHealthResponse, gradeWorker } from '../network/health';
import { replicationState } from '../services/replication-state';
import { replicationStatus } from '../services/replication-status';

const { stuckAfter } = RESOURCE_LIMITS.reread;
const limits = RESOURCE_LIMITS.health;
const MB = 1024 * 1024;
const GB = 1024 * MB;

const refused = Object.assign(new Error('null value in column "organization_id"'), { code: '23502' });
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

/** The status and the reasons of the grade: what a deploy and a person read first. */
const grade = () => {
  const { status, reasons } = gradeWorker();
  return { status, reasons };
};

beforeEach(() => {
  replicationState.reset();
  Object.assign(world, { apiAwaySince: null, slotActive: true, slotStatus: 'reserved', lagBytes: 0, eventLoopLagMs: 0 });
  // A worker that reads: every case below takes one thing away from it.
  replicationState.subscribed = true;
});

describe('replicationStatus: the status the worker publishes', () => {
  it.each([
    { subscribed: true, away: false, status: 'active' },
    { subscribed: false, away: false, status: 'stopped' },
    { subscribed: true, away: true, status: 'paused' },
    { subscribed: false, away: true, status: 'paused' },
  ])('is $status when subscribed is $subscribed and the API away is $away', ({ subscribed, away, status }) => {
    replicationState.subscribed = subscribed;
    world.apiAwaySince = away ? new Date() : null;

    expect(replicationStatus()).toBe(status);
  });

  it('must not stay paused once the API is back between two reads, while no subscription is open', () => {
    replicationState.subscribed = false;
    world.apiAwaySince = minutesAgo(10);
    expect(replicationStatus()).toBe('paused');

    // One fact, kept by the socket: no second stamp is left behind to turn health unhealthy later.
    world.apiAwaySince = null;
    expect(replicationStatus()).toBe('stopped');
    expect(grade()).toEqual({ status: 'degraded', reasons: ['replication_stopped'] });
  });
});

describe('gradeWorker', () => {
  it('is healthy while it reads, the API is reachable and the slot holds its WAL', () => {
    expect(grade()).toEqual({ status: 'healthy', reasons: [] });
  });

  it('is healthy before the first poll of the slot: there is nothing to judge yet', () => {
    Object.assign(world, { slotActive: null, slotStatus: null, lagBytes: null });

    expect(grade()).toEqual({ status: 'healthy', reasons: [] });
  });

  describe('unhealthy: it needs a person, and fails a deploy', () => {
    it('reports a stuck worker, and stuck wins over reading again', () => {
      for (let read = 0; read < stuckAfter; read++) replicationState.recordFailure('0/50', refused);

      expect(grade()).toEqual({ status: 'unhealthy', reasons: ['worker_stuck'] });
    });

    it('reports what the setup check found, and not that replication stopped: the cause is the setup', () => {
      replicationState.subscribed = false;
      replicationState.setupProblems = ['role runtime_role lacks REPLICATION'];

      expect(grade()).toEqual({ status: 'unhealthy', reasons: ['setup_problems'] });
      expect(gradeWorker().details.setupProblems).toEqual(['role runtime_role lacks REPLICATION']);
    });

    it('reports the API away for more than five minutes', () => {
      world.apiAwaySince = new Date(Date.now() - limits.apiAwayUnhealthyMs - 1000);

      expect(grade()).toEqual({ status: 'unhealthy', reasons: ['api_away'] });
    });

    it.each(['lost', 'unreserved'])('reports a slot whose wal_status is %s', (slotStatus) => {
      world.slotStatus = slotStatus;

      expect(grade()).toEqual({ status: 'unhealthy', reasons: ['slot_lost'] });
    });

    it('reports slot lag at 2 GB, as critical only', () => {
      world.lagBytes = 2 * GB;

      expect(grade()).toEqual({ status: 'unhealthy', reasons: ['wal_lag_critical'] });
    });

    it('reports event-loop lag at a second', () => {
      world.eventLoopLagMs = 1000;

      expect(grade()).toEqual({ status: 'unhealthy', reasons: ['event_loop_lag'] });
    });
  });

  describe('degraded: it passes by itself', () => {
    it('reports the API away for less than five minutes', () => {
      world.apiAwaySince = minutesAgo(4);

      expect(grade()).toEqual({ status: 'degraded', reasons: ['api_away'] });
      expect(gradeWorker().details.replication).toBe('paused');
    });

    it('is degraded when it never connected to the API, and turns unhealthy after five minutes', () => {
      vi.useFakeTimers();
      try {
        // The first attempt failed a moment ago, and no subscription starts without the API.
        replicationState.subscribed = false;
        world.apiAwaySince = new Date();
        expect(grade()).toEqual({ status: 'degraded', reasons: ['api_away'] });

        vi.advanceTimersByTime(limits.apiAwayUnhealthyMs);
        expect(grade()).toEqual({ status: 'degraded', reasons: ['api_away'] });

        vi.advanceTimersByTime(1);
        expect(grade()).toEqual({ status: 'unhealthy', reasons: ['api_away'] });
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports replication stopped when not subscribed with the API reachable: never unhealthy, however long', () => {
      vi.useFakeTimers();
      try {
        // Another worker still holds the slot during a deploy, or the worker waits between two reads.
        replicationState.subscribed = false;
        expect(grade()).toEqual({ status: 'degraded', reasons: ['replication_stopped'] });

        vi.advanceTimersByTime(60 * 60_000);
        expect(grade()).toEqual({ status: 'degraded', reasons: ['replication_stopped'] });
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports a failure it is reading again from, also between the two reads', () => {
      replicationState.recordFailure('0/50', refused);
      expect(grade()).toEqual({ status: 'degraded', reasons: ['reading_again'] });

      replicationState.subscribed = false;
      expect(grade()).toEqual({ status: 'degraded', reasons: ['replication_stopped', 'reading_again'] });
      expect(gradeWorker().details.failure).toEqual({ position: '0/50', count: 1, error: refused.message, passing: false });
    });

    it('reports a slot Postgres shows as inactive while the worker is subscribed', () => {
      world.slotActive = false;

      expect(grade()).toEqual({ status: 'degraded', reasons: ['slot_inactive'] });
    });

    it('must not report the slot inactive between two subscriptions: nothing reads it then on purpose', () => {
      replicationState.subscribed = false;
      world.slotActive = false;

      expect(grade().reasons).not.toContain('slot_inactive');
    });

    it('reports slot lag from 50 MB, below 2 GB', () => {
      world.lagBytes = 50 * MB - 1;
      expect(grade()).toEqual({ status: 'healthy', reasons: [] });

      world.lagBytes = 50 * MB;
      expect(grade()).toEqual({ status: 'degraded', reasons: ['wal_lag_high'] });

      world.lagBytes = 2 * GB - 1;
      expect(grade()).toEqual({ status: 'degraded', reasons: ['wal_lag_high'] });
    });

    it('reports event-loop lag from 100 ms', () => {
      world.eventLoopLagMs = 99;
      expect(grade()).toEqual({ status: 'healthy', reasons: [] });

      world.eventLoopLagMs = 100;
      expect(grade()).toEqual({ status: 'degraded', reasons: ['event_loop_lag'] });
    });
  });

  it('lists every reason that holds, the unhealthy ones first, each once', () => {
    replicationState.subscribed = false;
    replicationState.recordFailure('0/50', refused);
    world.apiAwaySince = minutesAgo(6);
    world.lagBytes = 3 * GB;
    world.eventLoopLagMs = 1500;

    expect(grade()).toEqual({ status: 'unhealthy', reasons: ['api_away', 'wal_lag_critical', 'event_loop_lag', 'reading_again'] });
  });

  it('carries what a person needs in its details', () => {
    replicationState.lastAckedLsn = '0/AB';
    replicationState.lagMs = 1200;
    replicationState.lastEventAt = new Date('2026-10-09T08:00:00.000Z');
    world.lagBytes = 4096;

    expect(gradeWorker().details).toEqual({
      replication: 'active',
      lastAckedLsn: '0/AB',
      apiAwaySince: null,
      slotActive: true,
      slotStatus: 'reserved',
      lagBytes: 4096,
      lagMs: 1200,
      lastEventAt: '2026-10-09T08:00:00.000Z',
      failure: null,
      setupProblems: [],
      messagesSent: 7,
      eventLoopLagMs: 0,
    });
  });
});

describe('getHealthResponse: the body of the health endpoint', () => {
  it('answers 200 with the grade and what the skills and the bench read', () => {
    const { response, httpStatus } = getHealthResponse();

    expect(httpStatus).toBe(200);
    expect(response).toMatchObject({
      status: 'healthy',
      reasons: [],
      uptime: expect.any(Number),
      eventLoopLagMs: 0,
      replication: { status: 'active', setupProblems: [], failure: null, lastAckedLsn: null },
      websocket: { connected: true, state: 'open', messagesSent: 7, lastMessageAt: null },
      metrics: { throughput: 12.5, processingLatency: { p95: 3 } },
    });
  });

  it('answers 503 when unhealthy, with the same grade the API is pushed', () => {
    replicationState.subscribed = false;
    replicationState.setupProblems = ["publication 'cdc_pub' lacks tracked tables: attachments"];

    const { response, httpStatus } = getHealthResponse();

    expect(httpStatus).toBe(503);
    expect({ status: response.status, reasons: response.reasons }).toEqual(grade());
    expect(response.replication).toMatchObject({ status: 'stopped', setupProblems: replicationState.setupProblems });
  });

  it('answers 200 when degraded', () => {
    replicationState.subscribed = false;

    expect(getHealthResponse().httpStatus).toBe(200);
  });
});
